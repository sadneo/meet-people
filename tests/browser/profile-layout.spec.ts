import { expect, test } from '@playwright/test';
import { wiringFixture } from './wiring-fixture';

for (const width of [320, 390]) {
  test(`profile overview and editor fit ${width}px mobile`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    const fixture = await wiringFixture(page);
    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible();
    await expect(page.locator('.account-row')).toHaveCount(6);
    await page.screenshot({ path: testInfo.outputPath('profile-hub.png'), fullPage: true });
    await page.getByRole('button', { name: 'Edit profile', exact: true }).click();
    await expect(page.locator('.profile-draft textarea').first()).toHaveCSS('resize', 'none');
    for (const tab of await page.getByRole('group', { name: 'Profile sections' }).getByRole('button').all()) {
      expect(await tab.evaluate(element => {
        const range = document.createRange(); range.selectNodeContents(element);
        const text = range.getBoundingClientRect(), bounds = element.getBoundingClientRect();
        return text.left >= bounds.left && text.right <= bounds.right;
      })).toBe(true);
    }
    await page.getByLabel('Display name', { exact: true }).fill('Unsaved name');
    await page.getByRole('button', { name: 'Interests & Availability', exact: true }).click();
    await page.getByRole('button', { name: 'About You', exact: true }).click();
    await expect(page.getByLabel('Display name', { exact: true })).toHaveValue('Unsaved name');
    await expect(page.getByRole('complementary', { name: 'Development navigation' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.locator('.profile-summary h3')).not.toHaveText('Unsaved name');
    expect(fixture.calls.filter(call => call.method === 'PUT')).toHaveLength(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: 'Preview', exact: true })).toHaveCount(0);
  });
}
