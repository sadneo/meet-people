import { expect, test } from '@playwright/test'
import { wiringFixture } from './wiring-fixture'

for (const width of [320, 390, 714]) {
  test(`login follows the demo layout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await wiringFixture(page, { guest: true })
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Welcome to Pebble', exact: true })).toBeVisible()
    await expect(page.locator('.auth-page')).toHaveCSS('background-color', 'rgb(241, 230, 218)')
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible()
    const email = page.getByRole('button', { name: 'Continue with email', exact: true })
    const google = page.getByRole('button', { name: 'Continue with Google', exact: true })
    await expect(email).toHaveCSS('background-color', 'rgb(157, 80, 61)')
    await expect(google).toBeVisible()
    await expect(page.getByRole('link', { name: 'Back to home', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Email me a sign-in link' })).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const emailBox = (await email.boundingBox())!
    const googleBox = (await google.boundingBox())!
    expect(emailBox.height).toBeGreaterThanOrEqual(49)
    expect(googleBox.x).toBe(emailBox.x)
    expect(googleBox.width).toBe(emailBox.width)
    expect(googleBox.y).toBeGreaterThan(emailBox.y + emailBox.height)
  })
}
