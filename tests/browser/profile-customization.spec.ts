import { expect, test } from '@playwright/test'
import { peer, wiringFixture } from './wiring-fixture'

test('a top interest is saved with the profile and leads the preview', async ({ page }) => {
  const fixture = await wiringFixture(page)
  await page.goto('/profile?section=interests')
  await page.getByRole('button', { name: 'Make Music your top interest' }).click()
  await expect(page.getByText('Unsaved changes')).toBeVisible()
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Edit profile', exact: true })).toBeVisible()
  expect(fixture.getCustomization().customization.interestOrder[0]).toBe('Music')
  await page.getByRole('group', { name: 'Profile view' }).getByRole('button', { name: 'Preview', exact: true }).click()
  const preview = page.getByRole('region', { name: 'How others see your profile' })
  await expect(preview.locator('.dating-interest').first()).toHaveText('Music')
  await expect(preview.locator('.dating-interest.is-top')).toHaveCount(1)
})

test('details can be limited to one mode and a Garden item can be shown', async ({ page }) => {
  const fixture = await wiringFixture(page)
  await page.goto('/profile?section=basics')
  await page.getByLabel('Education (optional)').fill('Biology')
  await page.getByText('Show education', { exact: true }).click()
  await page.getByLabel('Show education to').selectOption('dating')
  await page.getByText('Your Pebble', { exact: true }).click()
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Edit profile', exact: true })).toBeVisible()
  expect(fixture.getCustomization().customization).toMatchObject({ audiences: { education: 'dating' }, gardenItem: 'pebble' })
  await page.getByRole('group', { name: 'Profile view' }).getByRole('button', { name: 'Preview', exact: true }).click()
  const preview = page.getByRole('region', { name: 'How others see your profile' })
  await expect(preview.locator('.card-garden-item')).toBeVisible()
  await expect(preview.getByText('Biology')).toHaveCount(0)
  await preview.getByRole('button', { name: 'In Dating' }).click()
  await expect(preview.getByText('Biology')).toBeVisible()
})

test('the finish card links straight to what is missing', async ({ page }) => {
  await wiringFixture(page)
  await page.goto('/profile')
  const card = page.getByRole('region', { name: 'Finish your profile' })
  await expect(card).toContainText('3 of 5 done')
  await card.getByRole('link', { name: 'Write a short bio' }).click()
  await expect(page).toHaveURL(/section=basics/)
  await expect(page.getByLabel('Bio')).toBeVisible()
})

test('Discover cards show the person’s top interest and Garden item', async ({ page }) => {
  await wiringFixture(page)
  await page.route(`**/api/matchmaking/profile-customization/${peer}`, route => route.fulfill({ json: { interestOrder: ['Coffee'], gardenItem: 'bench' } }))
  await page.goto('/matchmaking')
  const card = page.locator('.discovery-card-slot:not([hidden])')
  await expect(card.getByRole('img', { name: /^From Taylor's Garden/ })).toBeVisible()
  await expect(card.locator('.dating-interest.is-top')).toContainText('Coffee')
})
