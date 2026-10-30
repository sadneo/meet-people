import { expect, test } from '@playwright/test'
import { wiringFixture } from './wiring-fixture'

for (const width of [320, 390, 630]) {
  test(`event directory matches the demo at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 980 })
    await wiringFixture(page)
    await page.goto('/events')
    await expect(page.getByRole('heading', { name: 'Events', exact: true })).toHaveCSS('color', 'rgb(40, 86, 64)')
    const card = page.locator('.event-card').first()
    await expect(card).toBeVisible()
    await expect(card).toHaveCSS('background-color', 'rgb(240, 233, 223)')
    await expect(card.locator('.event-cta')).toHaveText('See event & people')
    await expect(card.locator('.event-company')).toContainText('looking for company')
    await expect(page.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true')
    expect(await page.locator('.event-directory').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(width < 480 ? 1 : 2)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('button', { name: 'Filter events', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Filter events' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Filter events', exact: true })).toBeFocused()
  })
}
