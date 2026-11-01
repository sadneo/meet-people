import { expect, test } from '@playwright/test';
import { wiringFixture } from './wiring-fixture';

for (const width of [320, 626]) test(`Dating preferences use the focused search layout at ${width}px`, async ({ page }, testInfo) => {
  const fixture = await wiringFixture(page);
  await page.setViewportSize({ width, height: 844 });
  await page.goto('/matchmaking?mode=dating&preferences=true');
  const dialog = page.getByRole('dialog', { name: 'Dating preferences', exact: true });
  await expect(dialog.getByRole('slider', { name: 'Minimum age', exact: true })).toBeVisible();
  await expect(dialog.getByRole('slider', { name: 'Distance', exact: true })).toBeVisible();
  const ageTrack = await dialog.locator('.friends-age-track').boundingBox();
  const distanceTrack = await dialog.locator('.distance-track').boundingBox();
  expect(Math.abs(ageTrack!.x - distanceTrack!.x)).toBeLessThan(1);
  expect(Math.abs(ageTrack!.width - distanceTrack!.width)).toBeLessThan(1);
  await expect(dialog.getByRole('combobox', { name: 'Interested in', exact: true })).toHaveCount(0);
  await expect(dialog.getByText(/Preferences apply immediately/)).toHaveCount(0);
  await expect(dialog.getByRole('combobox', { name: 'Gender', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('heading', { name: 'Your Dating profile', exact: true })).toBeVisible();
  await expect(dialog.getByText('Long-term relationship', { exact: true })).toBeVisible();
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('dating-preferences.png') });
  const writes = () => fixture.calls.filter(call => call.method === 'PUT' && call.path.endsWith('/dating-preferences'));
  expect(writes()).toHaveLength(0);
  await dialog.getByRole('slider', { name: 'Minimum age', exact: true }).press('ArrowRight');
  await expect.poll(() => writes().length).toBe(1);
  await expect(dialog.getByRole('slider', { name: 'Distance', exact: true })).toBeEnabled();
  await dialog.getByRole('slider', { name: 'Distance', exact: true }).press('End');
  await expect.poll(() => writes().length).toBe(2);
  await expect(dialog.locator('.dating-distance output')).toHaveText('100+ miles');
  await expect(dialog.getByRole('slider', { name: 'Distance', exact: true })).toHaveAttribute('aria-valuetext', '100+ miles');
  await expect(dialog.getByRole('button', { name: 'Done', exact: true })).toBeEnabled();
  expect(writes().at(-1)?.body).toMatchObject({ search: { radiusMiles: 100, ageMin: 19 }, profile: { enabled: false, gender: 'Man', sexuality: 'Straight', clarifiedTargets: [] } });
  expect(fixture.calls.filter(call => call.path.endsWith('/dating/enabled'))).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Dating preferences', exact: true }).click();
  await expect(dialog.getByRole('slider', { name: 'Distance', exact: true })).toHaveValue('100');
  await dialog.getByRole('link', { name: 'Edit profile details', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Dating Profile', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('Dating preferences require read-only recovery after a conflicting auto-save', async ({ page }) => {
  const fixture = await wiringFixture(page);
  let writes = 0;
  await page.route('**/api/matchmaking/dating-preferences', route => {
    if (route.request().method() !== 'PUT') return route.fallback();
    writes++;
    return route.fulfill({ status: 409, json: { code: 'conflict', error: 'Preferences changed.' } });
  });
  await page.goto('/matchmaking?mode=dating&preferences=true');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('slider', { name: 'Distance', exact: true }).press('End');
  await expect(dialog.getByText(/Dating preferences changed/)).toBeVisible();
  await expect(dialog.getByRole('slider', { name: 'Distance', exact: true })).toBeDisabled();
  expect(writes).toBe(1);
  await dialog.getByRole('button', { name: 'Reload saved data', exact: true }).click();
  await expect(dialog.getByRole('slider', { name: 'Distance', exact: true })).toHaveValue('15');
  expect(writes).toBe(1);
  expect(fixture.calls.filter(call => call.path.endsWith('/dating/enabled'))).toHaveLength(0);
});

for (const identity of [{ gender: 'Nonbinary', sexuality: 'Bisexual' }, { gender: 'Woman', sexuality: 'Queer' }])
  test(`Dating asks for clarification only for ${identity.gender} / ${identity.sexuality}`, async ({ page }) => {
    const fixture = await wiringFixture(page);
    await page.goto('/profile?section=dating');
    await expect(page.getByRole('group', { name: 'Who would you like to meet?', exact: true })).toHaveCount(0);
    await page.getByRole('combobox', { name: 'Gender', exact: true }).selectOption(identity.gender);
    await page.getByRole('combobox', { name: 'Sexuality', exact: true }).selectOption(identity.sexuality);
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await page.getByRole('button', { name: 'Edit profile', exact: true }).click();
    await page.getByRole('button', { name: 'Dating Profile', exact: true }).click();
    const clarification = page.getByRole('group', { name: 'Who would you like to meet?', exact: true });
    await expect(clarification).toBeVisible();
    await clarification.getByRole('checkbox', { name: 'Woman', exact: true }).check();
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Edit profile', exact: true })).toBeVisible();
    const writes = fixture.calls.filter(call => call.method === 'PUT' && call.path.endsWith('/dating-preferences'));
    expect(writes.at(-1)?.body).toMatchObject({ profile: { ...identity, clarifiedTargets: ['Woman'], enabled: false } });
    expect(fixture.calls.filter(call => call.path.endsWith('/dating/enabled'))).toHaveLength(0);
  });
