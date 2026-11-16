import { expect, test } from '@playwright/test';
import { wiringFixture } from './wiring-fixture';

test('mobile timezone selection saves immediately and hides scrollbars without disabling scrolling', async ({ page }) => {
  await wiringFixture(page);
  let state: { revision: number; timeZone: string | null; showAvailability: boolean } = { revision: 0, timeZone: null, showAvailability: false };
  let writes = 0;
  await page.route('**/api/matchmaking/schedule', route => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON();
      expect(body.expectedRevision).toBe(state.revision);
      state = { revision: state.revision + 1, timeZone: body.timeZone, showAvailability: body.showAvailability };
      writes++;
    }
    return route.fulfill({ json: state });
  });
  await page.setViewportSize({ width: 390, height: 667 });
  await page.goto('/profile?section=interests');
  const picker = page.getByRole('button', { name: /^Timezone:/ });
  await expect(picker).toBeEnabled();
  await expect(picker).toHaveText('Choose a timezoneChoose');
  expect(writes).toBe(0);
  await expect(page.getByRole('button', { name: 'Save timezone & sharing', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reload timezone', exact: true })).toHaveCount(0);
  await picker.click();
  await page.getByRole('searchbox', { name: 'Search by city or timezone' }).fill('New York');
  await page.getByRole('button', { name: /Eastern Time · New York/ }).click();
  await expect.poll(() => writes).toBe(1);
  await expect(picker).toBeEnabled();
  await expect(picker).toContainText('New York');
  expect(writes).toBe(1);
  await page.getByRole('checkbox', { name: 'Allow shared-time explanations', exact: true }).check();
  await expect.poll(() => writes).toBe(2);
  await expect(picker).toBeEnabled();
  expect(state.showAvailability).toBe(true);
  expect(writes).toBe(2);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollbarWidth)).toBe('none');
  await page.evaluate(() => window.scrollTo(0, 300));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
});
