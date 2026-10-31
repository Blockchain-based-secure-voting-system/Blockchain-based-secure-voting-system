import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import fs from 'node:fs';

function validateZeroPlaintextLeakage(postData: string) {
  if (
    postData.includes('"vote":1') ||
    postData.includes('"vote":0') ||
    postData.includes('"vote":"YES"') ||
    postData.includes('"vote":"NO"') ||
    postData.includes('super_secret_voter_123')
  ) {
    throw new Error(`SECURITY LEAK DETECTED: Plaintext vote or raw secret found in request body: ${postData}`);
  }
}

test.describe('ICP Zero-Knowledge Voting UI, Full Lifecycle, CSP, Accessibility & Network Security', () => {
  test('should execute full election lifecycle (create, register, open, cast, close, tally, finalize), assert zero CSP violations, and verify zero plaintext leakage', async ({ page }) => {
    const capturedRequests: Array<{ url: string; method: string; postData: string | null }> = [];
    const cspViolations: string[] = [];

    page.on('console', (msg) => {
      const text = msg.text();
      if (/Content Security Policy|CSP/i.test(text) && msg.type() === 'error') {
        cspViolations.push(text);
      }
    });

    page.on('pageerror', (err) => {
      if (/Content Security Policy|EvalError/i.test(err.message)) {
        cspViolations.push(err.message);
      }
    });

    // 1. Intercept all outbound network traffic
    page.on('request', (request) => {
      capturedRequests.push({
        url: request.url(),
        method: request.method(),
        postData: request.postData(),
      });
    });

    // 2. Open application in test-authenticated mode and inspect response headers
    const response = await page.goto('/?test_auth=true');
    expect(response).not.toBeNull();
    const headers = response!.headers();
    expect(headers['content-security-policy']).toContain("default-src 'self'");
    expect(headers['content-security-policy']).toContain("'wasm-unsafe-eval'");
    expect(headers['content-security-policy']).not.toContain("'unsafe-eval'");
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');

    // 3. Verify Brand & Header
    await expect(page.locator('.brand-title')).toHaveText('ICP Zero-Knowledge Voting');
    await expect(page.locator('.brand-badge')).toHaveText('BN254 Homomorphic ElGamal');

    // 4. Verify 4 Roles in Navigation
    const tabs = page.locator('.role-tab-btn');
    await expect(tabs).toHaveCount(4);

    // 5. Navigate to Trustee Key Custody to generate 3-of-5 threshold keys via real WASM
    await tabs.nth(3).click();
    await expect(page.locator('h2')).toHaveText('Trustee Key Custody Portal');
    await page.getByRole('button', { name: 'Generate Threshold Setup' }).click();

    const masterPkInput = page.locator('#generated-master-pk');
    await expect(masterPkInput).toBeVisible({ timeout: 15000 });
    const generatedMasterPk = await masterPkInput.inputValue();
    expect(generatedMasterPk).toMatch(/^(?:0x)?[0-9a-fA-F]{64,}$/);

    // Extract 3 generated shares from UI
    const shareCodes = page.locator('.receipt-card code.receipt-val');
    await expect(shareCodes).toHaveCount(5);
    const share1 = (await shareCodes.nth(0).textContent())!.trim();
    const share2 = (await shareCodes.nth(1).textContent())!.trim();
    const share3 = (await shareCodes.nth(2).textContent())!.trim();

    // 6. Navigate to Admin Portal: Create Election -> Register Voter -> Open Voting
    await tabs.nth(2).click();
    await expect(page.locator('h2')).toHaveText('Election Administration');
    await page.locator('#election-title-input').fill('2026 Municipal Zero-Knowledge Referendum');
    await page.locator('#trustee-pk-input').fill(generatedMasterPk);
    await page.getByRole('button', { name: 'Initialize Election in Setup Phase' }).click();
    await expect(page.getByText(/initialized in Setup phase/i)).toBeVisible();

    // Register voter bkyz2-fmaaa-aaaaa-qaaaq-cai
    await page.locator('#voter-principals-textarea').fill('bkyz2-fmaaa-aaaaa-qaaaq-cai');
    await page.getByRole('button', { name: 'Add Voters to Registry' }).click();
    await expect(page.getByText(/Successfully registered 1 voter principals/i)).toBeVisible();

    // Open Voting with confirmation dialog
    await page.getByRole('button', { name: /Open Voting Phase/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm & Open Voting' }).click();
    await expect(page.getByText(/transitioned to Voting phase/i)).toBeVisible();

    // 7. Navigate to Voter Portal: Choose YES (1), Review/Confirm, Cast Ballot
    await tabs.nth(1).click();
    await expect(page.locator('h2')).toHaveText('Voter Portal');
    await page.getByRole('button', { name: 'YES (1)' }).click();
    await page.getByPlaceholder('Enter secret passphrase (kept only in browser memory)').fill('super_secret_voter_123');

    // Step through Review & Confirm screen
    await page.getByRole('button', { name: 'Review & Prepare Encrypted Ballot' }).click();
    await expect(page.getByText('Confirm Encrypted Ballot Transmission')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm & Submit Encrypted Ballot' }).click();

    // 8. Wait for Cryptographic Ballot Receipt
    await expect(page.getByText('Cryptographic Ballot Receipt')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Ciphertext SHA-256 Digest:')).toBeVisible();
    await expect(page.getByText('Nullifier Hash (Double-Vote Guard):')).toBeVisible();
    await expect(page.getByText('Recorded & Verified Unique On-Chain')).toBeVisible();

    // Verify voter secret is cleared and plaintext vote is not echoed
    const receiptSectionText = await page.locator('main').textContent();
    expect(receiptSectionText).not.toContain('super_secret_voter_123');
    expect(receiptSectionText).not.toContain('YES (1)');

    // 9. Return to Admin Portal: Close Voting & Begin Tallying
    await tabs.nth(2).click();
    await page.getByRole('button', { name: /Close Voting & Begin Tallying/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm & Close Voting' }).click();
    await expect(page.getByText(/Election is now in Tallying phase/i)).toBeVisible();

    // 10. Navigate to Trustee Portal: Combine 3 shares, decrypt tally, and finalize proof
    await tabs.nth(3).click();
    const sharesInput = `${share1}\n${share2}\n${share3}`;
    await page.locator('#trustee-shares-textarea').fill(sharesInput);
    await page.getByRole('button', { name: 'Reconstruct, Prove & Finalize Tally' }).click();
    await expect(page.getByText(/Success! Election tally verified and finalized on-chain with result: 1 YES votes/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Memory Cleared Confirmation/i)).toBeVisible();

    // 11. Navigate to Public View: Verify Complete phase, final tally = 1, and ZK Validated status
    await tabs.nth(0).click();
    await expect(page.getByText('Final Election Result (Verified On-Chain)')).toBeVisible();
    await expect(page.getByText('Verified: ZK Validated')).toBeVisible();

    // 12. Inspect Network Payloads
    const postDataRequests = capturedRequests.filter((r) => r.postData !== null);
    console.log(`\n================ NETWORK TRACE AUDIT ================`);
    console.log(`Total Outbound Network Requests Captured: ${capturedRequests.length}`);
    console.log(`Requests with Non-Null PostData: ${postDataRequests.length}`);

    expect(postDataRequests.length).toBeGreaterThan(0);

    let ballotRequestFound = false;
    for (const req of postDataRequests) {
      const data = req.postData!;
      console.log(`Captured Request [${req.method}] ${req.url} -> Payload Length: ${data.length} bytes`);
      validateZeroPlaintextLeakage(data);

      if (data.includes('cast_ballot')) {
        ballotRequestFound = true;
        expect(data).toContain('ciphertext');
        expect(data).toContain('range_proof');
        expect(data).toContain('nullifier');
        expect(data).toContain('c1_hex');
        expect(data).toContain('c2_hex');
      }
    }

    expect(ballotRequestFound).toBe(true);
    console.log(`Verified Ballot Payload: Encrypted Ciphertext + Range Proof + Nullifier ONLY. Zero plaintext.`);
    console.log(`CSP Violations Count: ${cspViolations.length}`);
    console.log(`=====================================================\n`);

    expect(cspViolations).toEqual([]);

    // 13. Assert LocalStorage / SessionStorage Security Invariant
    const localStorageKeys = await page.evaluate(() => Object.keys(localStorage));
    const sessionStorageKeys = await page.evaluate(() => Object.keys(sessionStorage));
    expect(localStorageKeys).toEqual([]);
    expect(sessionStorageKeys).toEqual([]);
  });

  test('PROVE FAILURE CAPABILITY: network leak validator MUST fail when plaintext vote is injected', async () => {
    const leakingPayload = JSON.stringify({
      method: 'cast_ballot',
      vote: 1,
      voter_secret: 'super_secret_voter_123',
    });

    expect(() => validateZeroPlaintextLeakage(leakingPayload)).toThrow(
      'SECURITY LEAK DETECTED: Plaintext vote or raw secret found in request body'
    );
  });

  test('should pass axe-core WCAG accessibility audits across all 4 role views in both light and dark themes and capture visual screenshots at 360px and 1280px', async ({ page }) => {
    const screenshotDir = path.resolve(process.cwd(), 'screenshots');
    fs.mkdirSync(screenshotDir, { recursive: true });

    await page.goto('/?test_auth=true');
    const tabs = page.locator('.role-tab-btn');
    const roleNames: Array<{ idx: number; key: string }> = [
      { idx: 0, key: 'public' },
      { idx: 1, key: 'voter' },
      { idx: 2, key: 'admin' },
      { idx: 3, key: 'trustee' },
    ];

    for (const theme of ['light', 'dark'] as const) {
      // Ensure theme is active
      const currentTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      if (currentTheme !== theme) {
        await page.getByRole('button', { name: /Switch to .* theme/i }).click();
      }
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

      for (const role of roleNames) {
        await tabs.nth(role.idx).click();

        // Run axe-core accessibility scan
        const axeResults = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze();

        const seriousOrCritical = axeResults.violations.filter(
          (v) => v.impact === 'serious' || v.impact === 'critical'
        );

        console.log(
          `[AXE AUDIT] Theme=${theme} | View=${role.key} | Total Violations=${axeResults.violations.length} | Serious/Critical=${seriousOrCritical.length}`
        );
        expect(seriousOrCritical).toEqual([]);
        expect(axeResults.violations).toEqual([]);

        // Capture 1280px desktop screenshot
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.screenshot({
          path: path.join(screenshotDir, `${role.key}-${theme}-1280px.png`),
          fullPage: true,
        });

        // Capture 360px mobile responsive screenshot
        await page.setViewportSize({ width: 360, height: 800 });
        await page.screenshot({
          path: path.join(screenshotDir, `${role.key}-${theme}-360px.png`),
          fullPage: true,
        });

        // Restore viewport
        await page.setViewportSize({ width: 1280, height: 900 });
      }
    }
  });
});
