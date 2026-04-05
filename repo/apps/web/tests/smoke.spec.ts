import { expect, test } from '@playwright/test';

test('landing page shows scaffold heading', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Submission + review/approval + journal governance slices are active' })).toBeVisible();
});
