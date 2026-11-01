import { expect, test } from '@playwright/test'
import { wiringFixture } from './wiring-fixture'

test('development navigator switches views, closes after navigation and supports Escape on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await wiringFixture(page)
  await page.goto('/home')
  const navigator = page.getByRole('complementary', { name: 'Development navigation' })
  await navigator.locator('summary').click()
  await navigator.getByLabel('Jump to a view').selectOption('/profile')
  await expect(page).toHaveURL(/\/profile$/)
  await expect(navigator.locator('details')).not.toHaveAttribute('open')
  await navigator.locator('summary').click()
  await navigator.getByLabel('Jump to a view').focus()
  await page.keyboard.press('Escape')
  await expect(navigator.locator('details')).not.toHaveAttribute('open')
  await expect(navigator.locator('summary')).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('development navigator preserves private route sign-in gates', async ({ page }) => {
  await wiringFixture(page, { guest: true })
  await page.goto('/login')
  const navigator = page.getByRole('complementary', { name: 'Development navigation' })
  await navigator.locator('summary').click()
  await navigator.getByLabel('Jump to a view').selectOption('/messages')
  await expect(page).toHaveURL(/\/login\?returnTo=/)
  await expect(page.getByRole('heading', { name: 'Welcome to Pebble', exact: true })).toBeVisible()
})
