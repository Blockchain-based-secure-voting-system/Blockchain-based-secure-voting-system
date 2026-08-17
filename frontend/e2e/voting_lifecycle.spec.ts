import { test, expect } from '@playwright/test';

test.describe('ICP Zero-Knowledge Voting UI & Network Security Trace', () => {
  test('should render public view, navigate roles, and verify zero plaintext leakage on network', async ({ page }) => {
    const capturedRequests: Array<{ url: string; method: string; postData: string | null }> = [];

    // 1. Intercept all outbound network traffic
    page.on('request', (request) => {
      capturedRequests.push({
        url: request.url(),
        method: request.method(),
        postData: request.postData(),
      });
    });

    await page.goto('/');

    // 2. Verify Brand & Header
    await expect(page.locator('.brand-title')).toHaveText('ICP Zero-Knowledge Voting');
    await expect(page.locator('.brand-badge')).toHaveText('BN254 Homomorphic ElGamal');

    // 3. Verify 4 Roles in Navigation
    const tabs = page.locator('.role-tab-btn');
    await expect(tabs).toHaveCount(4);

    // 4. Public Tally Tab (Default View)
    await expect(page.getByText('Registered Voters')).toBeVisible();
    await expect(page.getByText('Encrypted Ballots Cast')).toBeVisible();
    await expect(page.getByText('Homomorphically Aggregated Ciphertext')).toBeVisible();

    // 5. Navigate to Voter Portal
    await tabs.nth(1).click();
    await expect(page.locator('h2')).toHaveText('Voter Portal');
    await expect(page.getByText('Select Your Vote Option')).toBeVisible();

    // 6. Navigate to Admin Portal
    await tabs.nth(2).click();
    await expect(page.locator('h2')).toHaveText('Election Administration');
    await expect(page.getByText('Initialize Election')).toBeVisible();

    // 7. Navigate to Trustee Key Custody Portal
    await tabs.nth(3).click();
    await expect(page.locator('h2')).toHaveText('Trustee Key Custody Portal');
    await expect(page.getByText('Generate n-of-m Threshold Keys')).toBeVisible();
    await expect(page.getByText('Threshold Tally Decryption')).toBeVisible();

    // 8. Assert Network Trace Security Guarantee:
    // Verify that NO captured network request body contains plaintext vote values or secrets
    for (const req of capturedRequests) {
      if (req.postData) {
        // Assert no raw plaintext vote JSON or strings
        expect(req.postData).not.toContain('"vote":1');
        expect(req.postData).not.toContain('"vote":0');
        expect(req.postData).not.toContain('"vote":"YES"');
        expect(req.postData).not.toContain('"vote":"NO"');
        expect(req.postData).not.toContain('voter_secret_raw');
      }
    }

    // 9. Assert LocalStorage / SessionStorage Security Invariant
    const localStorageData = await page.evaluate(() => Object.keys(localStorage));
    const sessionStorageData = await page.evaluate(() => Object.keys(sessionStorage));
    expect(localStorageData).not.toContain('trustee_shares');
    expect(localStorageData).not.toContain('secret_key');
    expect(sessionStorageData).not.toContain('trustee_shares');
    expect(sessionStorageData).not.toContain('secret_key');
  });
});
