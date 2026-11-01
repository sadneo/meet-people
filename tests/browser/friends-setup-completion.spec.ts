import { expect, test } from '@playwright/test';
import type { FriendsPreferences } from '../../shared/friends-search-preferences';
import { locationId, wiringFixture } from './wiring-fixture';
import { mockLocationPicker } from './location-picker-fixture';

test('unchanged defaults cannot complete Friends setup without a saved area', async ({ page }) => {
  const fixture = await wiringFixture(page);
  await page.route('**/api/matchmaking/friends/status', route => route.fulfill({ json: { available: true, eligible: false, reason: 'preferences' } }));
  await page.goto('/matchmaking');
  await page.getByRole('link', { name: 'Set up Friends preferences', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Friends preferences' });
  await expect(dialog.getByRole('button', { name: 'Search area Choose an area' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Confirm a search area before finishing Friends setup.');
  await expect(dialog).toBeVisible();
  expect(fixture.calls.filter(call => call.method === 'PUT')).toHaveLength(0);
});

test('confirming an area completes setup and stays complete across navigation and reload', async ({ page }) => {
  await wiringFixture(page);
  await mockLocationPicker(page);
  let preferences: FriendsPreferences | null = null, revision = 0;
  const methods: string[] = [];
  await page.route('**/api/matchmaking/friends-search-preferences', route => {
    methods.push(route.request().method());
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON();
      expect(body.expectedRevision).toBe(revision);
      preferences = body.preferences; revision++;
    }
    return route.fulfill({ json: { revision, preferences } });
  });
  await page.route('**/api/matchmaking/friends/status', route => route.fulfill({ json: {
    available: true, eligible: !!preferences?.searchArea.resolvedLocationRef, reason: preferences ? null : 'preferences',
  } }));
  await page.goto('/matchmaking');
  await page.getByRole('link', { name: 'Set up Friends preferences', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Friends preferences' });
  await dialog.getByRole('button', { name: 'Search area Choose an area' }).click();
  await page.getByRole('combobox', { name: 'Search city or neighborhood' }).fill('Brooklyn');
  await page.getByRole('button', { name: 'Brooklyn, NY', exact: true }).click();
  await page.getByRole('button', { name: 'Set search area', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Search area Brooklyn, NY' })).toBeVisible();
  expect(methods).toContain('PUT');
  expect(methods.at(-1)).toBe('GET');
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Connect', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Friends preferences', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Search area Brooklyn, NY' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Connect', exact: true })).toBeVisible();
  expect(methods.filter(method => method === 'PUT')).toHaveLength(1);
});

for (const failure of ['expired', 'unavailable'] as const) test(`Done waits for verification and preserves saved preferences when ${failure}`, async ({ page }) => {
  const fixture = await wiringFixture(page);
  const preferences: FriendsPreferences = { ageMin: 18, ageMax: 99, radiusMiles: 15, goals: [], searchArea: { source: 'home', resolvedLocationRef: locationId } };
  await page.route('**/api/matchmaking/friends-search-preferences', route => route.fulfill({ json: { revision: 1, preferences } }));
  let checking = false, retry = false, checks = 0;
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/matchmaking/friends/status', async route => {
    if (!checking) return route.fulfill({ json: { available: true, eligible: true, reason: null } });
    checks++;
    if (!retry) {
      await waiting;
      if (failure === 'unavailable') return route.fulfill({ status: 503, json: { error: 'Unavailable' } });
      return route.fulfill({ json: { available: true, eligible: false, reason: 'location' } });
    }
    return route.fulfill({ json: { available: true, eligible: true, reason: null } });
  });
  await page.goto('/matchmaking?preferences=true');
  const dialog = page.getByRole('dialog', { name: 'Friends preferences' });
  await expect(dialog.getByRole('button', { name: 'Done', exact: true })).toBeEnabled();
  checking = true;
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Checking setup…', exact: true })).toBeDisabled();
  await expect.poll(() => checks).toBe(1);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  release();
  await expect(dialog.getByRole('alert')).toContainText(failure === 'expired' ? 'expired or changed' : 'could not be confirmed');
  await expect(dialog.getByRole('button', { name: 'Done', exact: true })).toBeEnabled();
  retry = true;
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(checks).toBeGreaterThanOrEqual(2);
  expect(fixture.calls.filter(call => call.method === 'PUT')).toHaveLength(0);
});
