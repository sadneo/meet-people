import { expect, test } from '@playwright/test';
import { wiringFixture } from './wiring-fixture';

test('overlapping availability is explained inline and cannot be saved', async ({ page }) => {
  const fixture = await wiringFixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/profile?section=interests');
  await expect(page.getByText(/Choose non-overlapping windows/)).toHaveCount(0);
  await expect(page.getByText('Your full schedule and birthdate are never part of your public profile.')).toHaveCount(0);
  await page.getByRole('button', { name: 'Add a time window', exact: true }).click();
  const firstDay = await page.getByRole('combobox', { name: 'Day', exact: true }).first().inputValue();
  await page.getByRole('combobox', { name: 'Day', exact: true }).nth(1).selectOption(firstDay);
  await page.getByLabel('Until', { exact: true }).nth(1).fill('23:00');
  await page.getByLabel('From', { exact: true }).nth(1).fill('22:00');
  await expect(page.getByRole('alert').filter({ hasText: /This time overlaps window/ })).toHaveCount(2);
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Availability windows must not overlap.' })).toBeVisible();
  expect(fixture.calls.filter(call => call.method === 'PUT' && call.path.endsWith('/account'))).toHaveLength(0);
  await page.getByRole('combobox', { name: 'Day', exact: true }).nth(1).selectOption(String((Number(firstDay) + 1) % 7));
  await expect(page.getByRole('alert').filter({ hasText: /This time overlaps window/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit profile', exact: true })).toBeVisible();
  expect(fixture.calls.filter(call => call.method === 'PUT' && call.path.endsWith('/account'))).toHaveLength(1);
});
