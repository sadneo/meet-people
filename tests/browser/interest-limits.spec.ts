import { expect, test } from '@playwright/test';
import { wiringFixture } from './wiring-fixture';

test('Profile retains the five-total/two-custom caps without requiring three provided choices', async ({ page }) => {
  const fixture = await wiringFixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/profile?section=interests');
  await expect(page.getByRole('heading', { name: 'Interests 3/5', exact: true })).toBeVisible();
  for (const interest of ['Ceramics', 'Birdwatching']) {
    await page.getByLabel('Add your own', { exact: true }).fill(interest);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: 'Interests 5/5', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gaming', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Add your own', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Music', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Gaming', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Add your own', { exact: true })).toBeDisabled();
  expect(fixture.calls.filter(call => call.method === 'PUT' && call.path.endsWith('/account'))).toHaveLength(0);
  await page.getByRole('button', { name: 'Gaming', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit profile', exact: true })).toBeVisible();
  expect(fixture.getAccount().profile?.interests).toEqual(['Coffee', 'Art', 'Ceramics', 'Birdwatching', 'Gaming']);
});

for (const interest of ['Coffee', 'Ceramics']) test(`a single ${interest === 'Coffee' ? 'premade' : 'custom'} interest saves and survives reload`, async ({ page }) => {
  const fixture = await wiringFixture(page);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/profile?section=interests');
  for (const label of ['Coffee', 'Art', 'Music']) await page.getByRole('button', { name: label, exact: true }).click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Choose at least one interest.' })).toBeVisible();
  if (interest === 'Coffee') await page.getByRole('button', { name: 'Coffee', exact: true }).click();
  else {
    await page.getByLabel('Add your own', { exact: true }).fill(interest);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit profile', exact: true })).toBeVisible();
  expect(fixture.getAccount().profile?.interests).toEqual([interest]);
  await page.reload();
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click();
  await page.getByRole('button', { name: 'Interests & Availability', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Interests 1/5', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: interest, exact: true })).toHaveAttribute('aria-pressed', 'true');
});
