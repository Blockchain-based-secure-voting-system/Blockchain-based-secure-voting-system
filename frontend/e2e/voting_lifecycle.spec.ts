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

test.describe('ICP Zero-Knowledge Voting UI, Full Lifecycle, IA Routes, Walkthrough, CSP, Accessibility & Network Security', () => {
  test('should navigate all 7 routes with browser back/forward, run guided walkthrough, execute full election lifecycle + double-vote rejection, verify network host allowlist, and assert zero plaintext leakage', async ({ page }) => {
    const capturedRequests: Array<{ url: string; method: string; postData: string | null }> = [];
    const contactedHosts = new Set<string>();
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

    // 1. Intercept all outbound network traffic and record contacted hosts
    page.on('request', (request) => {
      const reqUrl = request.url();
      try {
        const parsed = new URL(reqUrl);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          contactedHosts.add(parsed.hostname);
        }
      } catch {
        // Ignore data: or blob: URLs
      }
      capturedRequests.push({
        url: reqUrl,
        method: request.method(),
        postData: request.postData(),
      });
    });

    const isLiveReplica = process.env.USE_LIVE_REPLICA === 'true';
    const querySuffix = isLiveReplica ? '?test_auth=true&live_replica=true' : '?test_auth=true';

    // 2. Open Home route (/) and inspect security headers
    const response = await page.goto(`/${querySuffix}`);
    expect(response).not.toBeNull();
    const headers = response!.headers();
    expect(headers['content-security-policy']).toContain("default-src 'self'");
    expect(headers['content-security-policy']).toContain("'wasm-unsafe-eval'");
    expect(headers['content-security-policy']).not.toContain("'unsafe-eval'");
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');

    // 3. Verify Brand, 7 Navigation Routes, and Browser Back/Forward
    await expect(page.locator('.brand-title')).toHaveText('Zero-Knowledge Secure Voting');
    const navLinks = page.locator('nav[aria-label="Primary Navigation"] .role-tab-btn');
    await expect(navLinks).toHaveCount(7);

    // Navigate Home (/) -> Learn (/learn) -> Help (/help) -> Back (/learn) -> Forward (/help)
    await page.getByRole('link', { name: 'Learn', exact: true }).click();
    await expect(page).toHaveURL(/\/learn/);
    await expect(page.getByText('How This Voting System Works')).toBeVisible();

    await page.getByRole('link', { name: 'Accessibility and help' }).click();
    await expect(page).toHaveURL(/\/help/);
    await expect(page.getByText('Keyboard Shortcuts & Focus Guide')).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/learn/);
    await page.goForward();
    await expect(page).toHaveURL(/\/help/);

    // 4. Test Guided Walkthrough (Open, Keyboard ArrowRight, Skip with Escape, Re-open from Learn)
    await page.getByRole('button', { name: 'Open Guided Role Walkthrough' }).click();
    const walkthroughModal = page.getByTestId('walkthrough-modal');
    await expect(walkthroughModal).toBeVisible();
    await expect(walkthroughModal).toContainText('1. Sign in with Internet Identity');
    await page.keyboard.press('ArrowRight');
    await expect(walkthroughModal).toContainText('2. Confirm your voter eligibility');
    await page.keyboard.press('Escape');
    await expect(walkthroughModal).toBeHidden();

    // Re-open walkthrough from Learn (/learn)
    await page.getByRole('link', { name: 'Learn', exact: true }).click();
    await page.getByRole('button', { name: 'Open Voter Walkthrough (6 Steps)' }).click();
    await expect(walkthroughModal).toBeVisible();
    await page.getByRole('button', { name: /Skip and close walkthrough/i }).click();
    await expect(walkthroughModal).toBeHidden();

    // 5. Navigate to Trustee (/trustee) to generate 3-of-5 threshold keys via real WASM
    await page.getByRole('link', { name: 'Trustee', exact: true }).click();
    await expect(page).toHaveURL(/\/trustee/);
    await expect(page.locator('#trustee-portal-heading')).toHaveText('Trustee Key Custody Portal');
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

    // 6. Navigate to Admin (/admin): Create Election -> Register Voters -> Open Voting
    await page.getByRole('link', { name: 'Run an election' }).click();
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.locator('#admin-portal-heading')).toHaveText('Election Administration');
    await page.locator('#election-title-input').fill('2026 Municipal Zero-Knowledge Referendum');
    await page.locator('#trustee-pk-input').fill(generatedMasterPk);
    await page.getByRole('button', { name: 'Initialize Election in Setup Phase' }).click();
    await expect(page.getByText(/Setup phase/i).first()).toBeVisible({ timeout: 15000 });

    // Register both bkyz2-fmaaa-aaaaa-qaaaq-cai and 2vxsx-fae (so both E2E test principal and anonymous live-replica caller are eligible)
    await page.locator('#voter-principals-textarea').fill('bkyz2-fmaaa-aaaaa-qaaaq-cai\n2vxsx-fae');
    await page.getByRole('button', { name: 'Add Voters to Registry' }).click();
    await expect(page.getByText(/Successfully registered/i)).toBeVisible({ timeout: 15000 });

    // Open Voting with confirmation dialog
    await page.getByRole('button', { name: /Open Voting Phase/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm & Open Voting' }).click();
    await expect(page.getByText(/Voting phase|OPEN/i).first()).toBeVisible({ timeout: 15000 });

    // 7. Navigate to Vote (/vote): Choose YES (1), Review/Confirm, Cast Ballot
    await page.getByRole('link', { name: 'Vote', exact: true }).click();
    await expect(page).toHaveURL(/\/vote/);
    await expect(page.locator('#voter-portal-heading')).toHaveText('Voter Portal');
    await page.getByRole('button', { name: 'YES (1)' }).click();
    await page.getByPlaceholder('Enter secret passphrase (kept only in browser memory)').fill('super_secret_voter_123');

    // Step through Review & Confirm screen
    await page.getByRole('button', { name: 'Review & Prepare Encrypted Ballot' }).click();
    await expect(page.getByText('Confirm Encrypted Ballot Transmission')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm & Submit Encrypted Ballot' }).click();

    // 8. Wait for Cryptographic Ballot Receipt and capture nullifier hex
    await expect(page.getByText('Cryptographic Ballot Receipt')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Ciphertext SHA-256 Digest:')).toBeVisible();
    await expect(page.getByText('Nullifier Hash (Double-Vote Guard):')).toBeVisible();
    await expect(page.getByText('Recorded & Verified Unique On-Chain')).toBeVisible();

    const receiptRows = page.locator('.receipt-card .receipt-row');
    const nullifierRowText = await receiptRows.nth(1).locator('.receipt-val').textContent();
    const castNullifierHex = nullifierRowText!.trim();
    expect(castNullifierHex).toMatch(/^0x[0-9a-fA-F]{64}$/);

    // Verify voter secret is cleared and plaintext vote is not echoed
    const receiptSectionText = await page.locator('main').textContent();
    expect(receiptSectionText).not.toContain('super_secret_voter_123');
    expect(receiptSectionText).not.toContain('YES (1)');

    // 8b. Attempt a double-vote with the same secret and verify canister/UI rejection
    await page.getByRole('button', { name: 'Cast Another / Return' }).click();
    await page.getByRole('button', { name: 'NO (0)' }).click();
    await page.getByPlaceholder('Enter secret passphrase (kept only in browser memory)').fill('super_secret_voter_123');
    await page.getByRole('button', { name: 'Encrypt & Cast Ballot' }).click();
    await expect(page.getByText(/Double-vote prevented/i)).toBeVisible({ timeout: 15000 });

    // 9. Return to Admin (/admin): Close Voting & Begin Tallying
    await page.getByRole('link', { name: 'Run an election' }).click();
    await page.getByRole('button', { name: /Close Voting & Begin Tallying/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm & Close Voting' }).click();
    await expect(page.getByText(/Tallying phase/i).first()).toBeVisible({ timeout: 15000 });

    // 10. Navigate to Trustee (/trustee): Combine 3 shares, decrypt tally, and finalize proof
    await page.getByRole('link', { name: 'Trustee', exact: true }).click();
    const sharesInput = `${share1}\n${share2}\n${share3}`;
    await page.locator('#trustee-shares-textarea').fill(sharesInput);
    await page.getByRole('button', { name: 'Reconstruct, Prove & Finalize Tally' }).click();
    await expect(page.getByText(/Success! Election tally verified and finalized on-chain with result: 1 YES votes/i)).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/Memory Cleared Confirmation/i)).toBeVisible();

    // 11. Navigate to Verify Results (/verify): Check nullifier receipt, final tally = 1, and ZK Validated status
    await page.getByRole('link', { name: 'Verify results' }).click();
    await expect(page).toHaveURL(/\/verify/);
    await expect(page.getByText('Final Election Result (Verified On-Chain)')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Verified: ZK Validated')).toBeVisible();

    // Verify nullifier lookup on /verify
    await page.locator('#nullifier-lookup-input').fill(castNullifierHex);
    await page.getByRole('button', { name: 'Check Nullifier On-Chain' }).click();
    await expect(page.getByText(/\[RECORDED ON-CHAIN\]:/i)).toBeVisible({ timeout: 15000 });

    // 12. Inspect Network Payloads & Outbound Host Allowlist
    const postDataRequests = capturedRequests.filter((r) => r.postData !== null);
    console.log(`\n================ NETWORK TRACE & HOST ALLOWLIST AUDIT ================`);
    console.log(`Contacted Network Hosts: ${Array.from(contactedHosts).join(', ')}`);
    console.log(`Total Outbound Network Requests Captured: ${capturedRequests.length}`);
    console.log(`Requests with Non-Null PostData: ${postDataRequests.length}`);

    for (const host of contactedHosts) {
      expect(['localhost', '127.0.0.1']).toContain(host);
    }

    expect(postDataRequests.length).toBeGreaterThan(0);

    let ballotRequestFound = false;
    for (const req of postDataRequests) {
      const data = req.postData!;
      validateZeroPlaintextLeakage(data);

      if (data.includes('cast_ballot') || req.url.includes('/call') || req.url.includes('/ballots')) {
        ballotRequestFound = true;
      }
    }

    expect(ballotRequestFound).toBe(true);
    console.log(`Verified Ballot Payload: Encrypted Ciphertext + Range Proof + Nullifier ONLY. Zero plaintext.`);
    console.log(`CSP Violations Count: ${cspViolations.length}`);
    console.log(`======================================================================\n`);

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

  test('should pass axe-core WCAG accessibility audits across all 7 routes in both light and dark themes, verify 200% text zoom, and capture visual screenshots at 360px and 1280px', async ({ page }) => {
    const screenshotDir = path.resolve(process.cwd(), 'screenshots');
    fs.mkdirSync(screenshotDir, { recursive: true });

    await page.goto('/?test_auth=true');
    const routesToAudit: Array<{ path: string; label: string; key: string }> = [
      { path: '/', label: 'Home', key: 'home' },
      { path: '/verify', label: 'Verify results', key: 'public' },
      { path: '/vote', label: 'Vote', key: 'voter' },
      { path: '/admin', label: 'Run an election', key: 'admin' },
      { path: '/trustee', label: 'Trustee', key: 'trustee' },
      { path: '/learn', label: 'Learn', key: 'learn' },
      { path: '/help', label: 'Accessibility and help', key: 'help' },
    ];

    for (const theme of ['light', 'dark'] as const) {
      const currentTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      if (currentTheme !== theme) {
        await page.getByRole('button', { name: /Switch to .* theme/i }).click();
      }
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

      for (const route of routesToAudit) {
        await page.getByRole('link', { name: route.label, exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`${route.path === '/' ? '\\/(\\?|$)' : route.path}`));

        // Run axe-core accessibility scan
        const axeResults = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze();

        const seriousOrCritical = axeResults.violations.filter(
          (v) => v.impact === 'serious' || v.impact === 'critical'
        );

        console.log(
          `[AXE AUDIT] Theme=${theme} | Route=${route.path} (${route.key}) | Total Violations=${axeResults.violations.length} | Serious/Critical=${seriousOrCritical.length}`
        );
        expect(seriousOrCritical).toEqual([]);
        expect(axeResults.violations).toEqual([]);

        // Capture 1280px desktop screenshot
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.screenshot({
          path: path.join(screenshotDir, `${route.key}-${theme}-1280px.png`),
          fullPage: true,
        });

        // Capture 360px mobile responsive screenshot
        await page.setViewportSize({ width: 360, height: 800 });
        await page.screenshot({
          path: path.join(screenshotDir, `${route.key}-${theme}-360px.png`),
          fullPage: true,
        });

        // Restore viewport
        await page.setViewportSize({ width: 1280, height: 900 });
      }
    }

    // Verify 200% text zoom does not clip or hide main content
    await page.getByRole('link', { name: 'Vote', exact: true }).click();
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    await expect(page.locator('#voter-portal-heading')).toBeVisible();
    await expect(page.getByRole('button', { name: 'YES (1)' })).toBeVisible();
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '';
    });
  });
});
