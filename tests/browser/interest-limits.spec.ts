import { expect, test } from '@playwright/test';
import { wiringFixture } from './wiring-fixture';

test('Profile allows five interests with two custom slots and three provided choices', async ({ page }) => {
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
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Choose at least 3 interests from the provided list.' })).toBeVisible();
  expect(fixture.calls.filter(call => call.method === 'PUT' && call.path.endsWith('/account'))).toHaveLength(0);
  await page.getByRole('button', { name: 'Gaming', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit profile', exact: true })).toBeVisible();
  expect(fixture.getAccount().profile?.interests).toEqual(['Coffee', 'Art', 'Ceramics', 'Birdwatching', 'Gaming']);
});
