import { expect, test } from '@playwright/test';
import { locationId, wiringFixture } from './wiring-fixture';

for (const width of [320, 626]) test(`Friends preferences match the reference and save immediately at ${width}px`, async ({ page }, testInfo) => {
  const fixture = await wiringFixture(page);
  let revision = 1;
  let preferences = { ageMin: 18, ageMax: 26, radiusMiles: 15, goals: ['New friends'], searchArea: { source: 'temporary', areaLabel: 'Stony Brook University', resolvedLocationRef: locationId } };
  const writes: unknown[] = [];
  await page.route('**/api/matchmaking/friends-search-preferences', route => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON();
      expect(body.expectedRevision).toBe(revision);
      preferences = body.preferences;
      writes.push(preferences);
      revision++;
    }
    return route.fulfill({ json: { revision, preferences } });
  });
  await page.setViewportSize({ width, height: 800 });
  await page.goto('/matchmaking?preferences=true');
  const dialog = page.getByRole('dialog', { name: 'Friends preferences' });
  await expect(dialog.getByRole('slider', { name: 'Minimum age', exact: true })).toHaveValue('18');
  await expect(dialog.getByRole('slider', { name: 'Maximum age', exact: true })).toHaveValue('26');
  await expect(dialog.getByRole('combobox', { name: 'Friendship goal', exact: true })).toHaveValue('New friends');
  await expect(dialog.getByRole('button', { name: 'Done', exact: true })).toBeVisible();
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('friends-preferences.png'), fullPage: true });
  await dialog.getByRole('slider', { name: 'Maximum age', exact: true }).press('ArrowRight');
  await expect.poll(() => writes.length).toBe(1);
  await expect(dialog.getByRole('button', { name: 'Done', exact: true })).toBeEnabled();
  expect(preferences.ageMax).toBe(27);
  await dialog.getByRole('combobox', { name: 'Friendship goal', exact: true }).selectOption('Study buddies');
  await expect.poll(() => writes.length).toBe(2);
  await expect(dialog.getByRole('button', { name: 'Done', exact: true })).toBeEnabled();
  expect(preferences.goals).toEqual(['Study buddies']);
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(fixture.calls.filter(call => call.path.endsWith('/account') && call.method === 'PUT')).toHaveLength(0);
});

test('Friends preference auto-save failures require reconciliation and do not close the panel', async ({ page }) => {
  await wiringFixture(page);
  const preferences = { ageMin: 18, ageMax: 26, radiusMiles: 15, goals: ['New friends'], searchArea: { source: 'home', resolvedLocationRef: locationId } };
  let writes = 0;
  await page.route('**/api/matchmaking/friends-search-preferences', route => {
    if (route.request().method() === 'PUT') {
      writes++;
      return route.fulfill({ status: 409, json: { code: 'conflict', error: 'Preferences changed.' } });
    }
    return route.fulfill({ json: { revision: 1, preferences } });
  });
  await page.goto('/matchmaking?preferences=true');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Friendship goal', exact: true }).selectOption('Study buddies');
  await expect(dialog.getByText(/Friends filters changed/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Done', exact: true })).toBeDisabled();
  expect(writes).toBe(1);
  await dialog.getByRole('button', { name: 'Reload saved data', exact: true }).click();
  await expect(dialog.getByRole('combobox', { name: 'Friendship goal', exact: true })).toHaveValue('New friends');
  expect(writes).toBe(1);
  await dialog.getByRole('link', { name: 'Edit profile', exact: true }).click();
  await expect(page.getByRole('button', { name: 'About You', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
