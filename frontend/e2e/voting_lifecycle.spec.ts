import { test, expect } from '@playwright/test';

test.describe('ICP Zero-Knowledge Voting Full Lifecycle', () => {
  test('should render public view and navigate through all 4 roles', async ({ page }) => {
    await page.goto('/');

    // 1. Check Brand & Header
    await expect(page.locator('.brand-title')).toHaveText('ICP Zero-Knowledge Voting');
    await expect(page.locator('.brand-badge')).toHaveText('BN254 Homomorphic ElGamal');

    // 2. Verify 4 Roles in Navigation
    const tabs = page.locator('.role-tab-btn');
    await expect(tabs).toHaveCount(4);

    // 3. Public Tally Tab (Default)
    await expect(page.getByText('Registered Voters')).toBeVisible();
    await expect(page.getByText('Encrypted Ballots Cast')).toBeVisible();
    await expect(page.getByText('Homomorphically Aggregated Ciphertext')).toBeVisible();

    // 4. Navigate to Voter Portal
    await tabs.nth(1).click();
    await expect(page.locator('h2')).toHaveText('Voter Portal');
    await expect(page.getByText('Select Your Vote Option')).toBeVisible();

    // 5. Navigate to Admin Portal
    await tabs.nth(2).click();
    await expect(page.locator('h2')).toHaveText('Election Administration');
    await expect(page.getByText('Initialize Election')).toBeVisible();
    await expect(page.getByText('Register Eligible Voters')).toBeVisible();

    // 6. Navigate to Trustee Key Custody Portal
    await tabs.nth(3).click();
    await expect(page.locator('h2')).toHaveText('Trustee Key Custody Portal');
    await expect(page.getByText('Generate n-of-m Threshold Keys')).toBeVisible();
    await expect(page.getByText('Threshold Tally Decryption')).toBeVisible();
  });
});
