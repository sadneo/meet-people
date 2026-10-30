import { expect, test } from '@playwright/test';
import { wiringFixture } from './wiring-fixture';

for (const width of [320, 390]) {
  test(`profile overview and editor fit ${width}px mobile`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const fixture = await wiringFixture(page);
    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible();
    await expect(page.locator('.account-row')).toHaveCount(5);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByLabel('Display name', { exact: true }).fill('Unsaved name');
    await page.getByRole('button', { name: 'Interests & time', exact: true }).click();
    await page.getByRole('button', { name: 'About you', exact: true }).click();
    await expect(page.getByLabel('Display name', { exact: true })).toHaveValue('Unsaved name');
    await expect(page.getByRole('complementary', { name: 'Development navigation' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.locator('.profile-summary h3')).not.toHaveText('Unsaved name');
    expect(fixture.calls.filter(call => call.method === 'PUT')).toHaveLength(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    const preview = page.getByRole('dialog', { name: 'Profile preview' });
    await expect(preview).toBeVisible();
    await expect(preview.locator('input[type=date]')).toHaveCount(0);
    await preview.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(preview).toHaveCount(0);
  });
}
