import { test, expect } from '@playwright/test';

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

test.describe('ICP Zero-Knowledge Voting UI & Network Security Trace', () => {
  test('should execute real vote-cast flow, capture network payloads, and verify zero plaintext leakage', async ({ page }) => {
    const capturedRequests: Array<{ url: string; method: string; postData: string | null }> = [];

    // 1. Intercept all outbound network traffic
    page.on('request', (request) => {
      capturedRequests.push({
        url: request.url(),
        method: request.method(),
        postData: request.postData(),
      });
    });

    // 2. Open application in test-authenticated mode
    await page.goto('/?test_auth=true');

    // 3. Verify Brand & Header
    await expect(page.locator('.brand-title')).toHaveText('ICP Zero-Knowledge Voting');
    await expect(page.locator('.brand-badge')).toHaveText('BN254 Homomorphic ElGamal');

    // 4. Verify 4 Roles in Navigation
    const tabs = page.locator('.role-tab-btn');
    await expect(tabs).toHaveCount(4);

    // 5. Navigate to Voter Portal
    await tabs.nth(1).click();
    await expect(page.locator('h2')).toHaveText('Voter Portal');

    // 6. Select YES (1) Vote Option & Enter Secret Passphrase
    await page.getByRole('button', { name: 'YES (1)' }).click();
    await page.getByPlaceholder('Enter secret passphrase').fill('super_secret_voter_123');

    // 7. Click Encrypt & Cast Ballot
    await page.getByRole('button', { name: 'Encrypt & Cast Ballot' }).click();

    // 8. Wait for Receipt Modal / Card
    await expect(page.getByText('Cryptographic Ballot Receipt')).toBeVisible();
    await expect(page.getByText('Nullifier Hash (Double-Vote Guard):')).toBeVisible();

    // 9. Inspect Network Payloads
    const postDataRequests = capturedRequests.filter(r => r.postData !== null);
    console.log(`\n================ NETWORK TRACE AUDIT ================`);
    console.log(`Total Outbound Network Requests Captured: ${capturedRequests.length}`);
    console.log(`Requests with Non-Null PostData: ${postDataRequests.length}`);

    // Assert that we captured actual POST requests (proves test is NOT vacuous)
    expect(postDataRequests.length).toBeGreaterThan(0);

    let ballotRequestFound = false;
    for (const req of postDataRequests) {
      const data = req.postData!;
      console.log(`Captured Request [${req.method}] ${req.url} -> Payload Length: ${data.length} bytes`);

      // Enforce zero plaintext leakage
      validateZeroPlaintextLeakage(data);

      if (data.includes('cast_ballot')) {
        ballotRequestFound = true;
        // Verify payload structure contains ciphertext, nullifier, and range_proof
        expect(data).toContain('ciphertext');
        expect(data).toContain('range_proof');
        expect(data).toContain('nullifier');
        expect(data).toContain('c1_hex');
        expect(data).toContain('c2_hex');
      }
    }

    expect(ballotRequestFound).toBe(true);
    console.log(`Verified Ballot Payload: Encrypted Ciphertext + Range Proof + Nullifier ONLY. Zero plaintext.`);
    console.log(`=====================================================\n`);

    // 10. Assert LocalStorage / SessionStorage Security Invariant
    const localStorageKeys = await page.evaluate(() => Object.keys(localStorage));
    const sessionStorageKeys = await page.evaluate(() => Object.keys(sessionStorage));
    expect(localStorageKeys).not.toContain('trustee_shares');
    expect(localStorageKeys).not.toContain('secret_key');
    expect(sessionStorageKeys).not.toContain('trustee_shares');
    expect(sessionStorageKeys).not.toContain('secret_key');
  });

  test('PROVE FAILURE CAPABILITY: network leak validator MUST fail when plaintext vote is injected', async () => {
    const leakingPayload = JSON.stringify({
      method: 'cast_ballot',
      vote: 1, // Deliberate injection of plaintext vote
      voter_secret: 'super_secret_voter_123',
    });

    expect(() => validateZeroPlaintextLeakage(leakingPayload)).toThrow(
      'SECURITY LEAK DETECTED: Plaintext vote or raw secret found in request body'
    );
  });
});
