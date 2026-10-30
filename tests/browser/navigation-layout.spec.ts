import { expect, test } from '@playwright/test'
import { wiringFixture } from './wiring-fixture'

for (const width of [320, 390, 800]) {
  test(`mobile navigation matches demo order and palette at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await wiringFixture(page)
    await page.goto('/matchmaking')
    const navigation = page.getByRole('navigation', { name: 'Main navigation' })
    const visibleLinks = navigation.locator(':scope > a:visible')
    await expect(visibleLinks).toHaveText(['Garden', 'Events', 'Discover', 'Messages', 'Profile'])
    await expect(visibleLinks.nth(2)).toHaveAttribute('aria-current', 'page')
    await expect(navigation).toHaveCSS('background-color', 'rgb(255, 253, 249)')
    await expect(visibleLinks.nth(2)).toHaveCSS('background-color', 'rgb(237, 223, 209)')
    await expect(visibleLinks.nth(2)).toHaveCSS('color', 'rgb(133, 69, 47)')
  })
}
