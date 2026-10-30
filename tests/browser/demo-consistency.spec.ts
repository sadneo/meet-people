import { expect, test } from '@playwright/test';
import { wiringFixture } from './wiring-fixture';

for (const width of [320, 390, 800]) {
  test(`Profile contains the account settings categories at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const fixture = await wiringFixture(page);
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.locator('.profile-settings-links .account-row')).toHaveCount(5);
    for (const row of await page.locator('.profile-settings-links .account-row').all())
      await expect(row).toHaveCSS('text-decoration-line', 'none');
    await expect(page.getByRole('link', { name: 'Settings', exact: true })).toHaveCount(0);
    await expect(page.getByLabel('New password', { exact: true })).toHaveCount(0);
    await page.getByRole('link', { name: /^Discovery Friends/ }).click();
    await expect(page.getByRole('heading', { name: 'Discovery', exact: true })).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Friends discovery', exact: true })).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Message notifications', exact: true })).toHaveCount(0);
    await page.locator('.account-back').click();
    await page.getByRole('link', { name: /^Notifications Messages/ }).click();
    await expect(page.getByRole('switch', { name: 'Message notifications', exact: true })).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Friends discovery', exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(fixture.calls.filter(call => call.method === 'PUT')).toHaveLength(0);
    await page.goBack();
    await expect(page.locator('.profile-settings-links .account-row')).toHaveCount(5);
  });
}

test('profile tabs highlight their state and keep the demo save bar above mobile navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await wiringFixture(page);
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click();
  const about = page.getByRole('button', { name: 'About You', exact: true });
  await expect(about).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Display name', { exact: true })).toBeVisible();
  const control = (await page.getByLabel('Display name', { exact: true }).boundingBox())!;
  expect(control.height).toBeGreaterThanOrEqual(49);
  const save = (await page.getByRole('button', { name: 'Save changes', exact: true }).boundingBox())!;
  const nav = (await page.getByRole('navigation', { name: 'Main navigation' }).boundingBox())!;
  expect(save.y + save.height).toBeLessThanOrEqual(nav.y);
  const interests = page.getByRole('button', { name: 'Interests & Availability', exact: true });
  await interests.click();
  await expect(interests).toHaveAttribute('aria-pressed', 'true');
  await expect(about).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByText('Edit availability', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('From', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Timezone', { exact: true })).toBeVisible();
});

test('Profile and its editor omit Preview and the photo helper text', async ({ page }) => {
  await wiringFixture(page);
  await page.goto('/profile');
  await expect(page.getByRole('button', { name: 'Preview', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Preview', exact: true })).toHaveCount(0);
  await expect(page.getByText(/One photo · JPG, PNG or WebP/)).toHaveCount(0);
  await expect(page.getByLabel('Choose a photo', { exact: false })).toBeAttached();
});

test('Profile Dating details stay separate from search preferences and do not change consent', async ({ page }) => {
  const fixture = await wiringFixture(page);
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click();
  await page.getByRole('button', { name: 'Dating Profile', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Gender', exact: true })).toBeVisible();
  await expect(page.getByLabel('Minimum age', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Find a city or campus', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Dating Profile', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(fixture.calls.filter(call => call.method === 'PUT' || call.method === 'POST')).toHaveLength(0);
});

test('Profile keeps personal details without duplicate search preference shortcuts', async ({ page }) => {
  await wiringFixture(page);
  await page.goto('/profile');
  await expect(page.getByRole('button', { name: /^Friends preferences/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Dating preferences/ })).toHaveCount(0);
  await expect(page.getByText('Profile details are shared. Your Friends and Dating search preferences stay separate.')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit profile', exact: true })).toBeVisible();
  await expect(page.locator('.profile-overview button.account-row')).toHaveCount(1);
  await expect(page.locator('.profile-settings-links .account-row')).toHaveCount(5);
});

test('Discovery settings have no legacy downtime queue controls or queue requests', async ({ page }) => {
  const fixture = await wiringFixture(page, { queue: 'downtime' });
  await page.goto('/settings?section=discovery');
  await expect(page.getByRole('switch', { name: 'Friends discovery', exact: true })).toBeVisible();
  await expect(page.getByText(/downtime/i)).toHaveCount(0);
  expect(fixture.calls.filter(call => /\/queue(?:\/|$)/.test(call.path))).toHaveLength(0);
});

for (const mode of ['Friends', 'Dating'] as const) test(`Settings ${mode} preferences open on Discover`, async ({ page }) => {
  await wiringFixture(page);
  await page.goto('/settings?section=discovery');
  await page.getByRole('link', { name: `${mode} preferences`, exact: false }).click();
  await expect(page).toHaveURL(new RegExp(`/matchmaking\\?mode=${mode.toLowerCase()}&preferences=true`));
  await expect(page.getByRole('dialog', { name: `${mode} preferences`, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: mode, exact: true })).toHaveAttribute('aria-pressed', 'true');
});

for (const mode of ['friends', 'dating']) test(`legacy Profile ${mode} preference links redirect to Discover`, async ({ page }) => {
  await wiringFixture(page);
  await page.goto(`/profile?section=${mode}-preferences`);
  await expect(page).toHaveURL(new RegExp(`/matchmaking\\?mode=${mode}&preferences=true`));
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('a partial Profile save stays open and requires optional-detail reconciliation', async ({ page }) => {
  const fixture = await wiringFixture(page);
  let attempts = 0;
  await page.route('**/api/**/profile-details', async route => {
    if (route.request().method() !== 'PUT') return route.fallback();
    attempts++;
    return route.fulfill({ status: 503, json: { code: 'provider', error: 'Save interrupted.' } });
  });
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click();
  await page.getByLabel('Display name', { exact: true }).fill('Saved main profile');
  await page.getByLabel('Education (optional)', { exact: true }).fill('Unconfirmed education');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'main profile is saved' })).toBeVisible();
  expect(fixture.getAccount().profile?.display_name).toBe('Saved main profile');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  expect(attempts).toBe(1);
  await page.getByRole('button', { name: 'Reload saved optional details to replace this draft', exact: true }).click();
  await expect(page.getByLabel('Education (optional)', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Display name', { exact: true })).toHaveValue('Saved main profile');
});

test('Discover portraits do not inherit generic mobile card padding', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await wiringFixture(page);
  await page.goto('/matchmaking');
  const photo = page.locator('.discovery-card-slot:not([hidden]) .discovery-photo');
  await expect(photo).toBeVisible();
  const bounds = (await photo.boundingBox())!;
  expect(bounds.x).toBe(20);
  expect(bounds.width).toBe(350);
});

test('event details use the demo header, cover and full-height mobile surface', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await wiringFixture(page);
  await page.goto('/events');
  await page.locator('.event-card').first().click();
  await expect(page.locator('.event-detail-header h1')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeHidden();
  const image = (await page.locator('.event-cover').boundingBox())!;
  expect(image.x).toBe(24);
  expect(image.height).toBe(180);
  await page.getByRole('link', { name: 'Close event', exact: true }).click();
  await expect(page).toHaveURL(/\/events$/);
});
