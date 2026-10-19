import { expect, type Page } from '@playwright/test'

// Explicit browser actions. Never injected product progress or seeded ordinary fields.
export async function saveInterestChapter(page: Page, labels = ['Music', 'Coffee', 'Art']) {
  const save = page.getByRole('button', { name: 'Save interests and continue', exact: true })
  await expect(save).toBeEnabled()
  for (const label of labels) await page.getByRole('button', { name: label, exact: true }).click()
  await save.click()
  await expect(page.getByRole('button', { name: 'Save social intent and continue', exact: true })).toBeEnabled()
}
export async function saveSocialChapter(page: Page) {
  await page.getByRole('button', { name: 'Meet new people', exact: true }).click()
  await page.getByRole('button', { name: 'Save social intent and continue', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Finish onboarding', exact: true })).toBeEnabled()
}
export async function chooseDistanceAndGroup(page: Page) {
  await page.getByRole('combobox', { name: 'Comfortable distance', exact: true }).selectOption('Nearby')
  await page.getByRole('combobox', { name: 'Group preference', exact: true }).selectOption('Either')
}
