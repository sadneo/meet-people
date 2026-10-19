import { expect, test } from '@playwright/test'
import { mockMatchingApi, mockMatchingSession } from './matchmaking-fixture'

for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [1280, 720], [2560, 1440]]) {
  test(`pixel assets and village at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await expect(page.locator('.pt-pebble-refresh .pt-pixel-pebble')).toHaveAttribute('data-expression', 'happy')
    await expect(page.locator('.pt-home-focus .pt-mascot-ground')).toHaveCount(0)
    const homeCurrency = await page.locator('.pt-currency-art').evaluate(el => ({ html: el.innerHTML, width: getComputedStyle(el).width, height: getComputedStyle(el).height }))
    await page.clock.install()
    await page.getByRole('button', { name: 'Refresh people who are available now' }).click()
    await expect(page.locator('.pt-pebble-refresh .pt-pixel-pebble')).toHaveAttribute('data-expression', 'thinking')
    await page.screenshot({ path: `/tmp/pebble-assets-${width}-thinking.png`, fullPage: true })
    await page.clock.fastForward(1750)
    await expect(page.locator('.pt-pebble-refresh .pt-pixel-pebble')).toHaveAttribute('data-expression', 'happy')
    await page.screenshot({ path: `/tmp/pebble-assets-${width}-home.png`, fullPage: true })
    await page.clock.resume()
    await page.getByRole('link', { name: 'Community', exact: true }).click()
    await expect(page.locator('.pt-community-page .pt-calm-balance .pt-currency-art')).toBeVisible()
    expect(await page.locator('.pt-calm-balance .pt-currency-art').evaluate(el => ({ html: el.innerHTML, width: getComputedStyle(el).width, height: getComputedStyle(el).height }))).toEqual(homeCurrency)
    await expect(page.locator('.pt-build-control image')).toHaveAttribute('href', /build-icon/)
    await page.screenshot({ path: `/tmp/pebble-assets-${width}-village.png`, fullPage: true })
    await expect(page.getByRole('button', { name: /museum/i })).toHaveCount(0)
    await expect(page.locator('.pt-museum-case')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    await page.getByRole('button', { name: 'Build your community', exact: true }).click()
    await expect(page.locator('.pt-build-dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Build your community', exact: true })).toBeFocused()
  })
}

test('matching artwork follows the existing queue state', async ({ page }) => {
  await mockMatchingSession(page)
  await mockMatchingApi(page)
  await page.goto('/matchmaking')
  await expect(page.locator('.match-mascot .pt-pixel-pebble')).toHaveAttribute('data-expression', 'happy')
  await page.screenshot({ path: '/tmp/pebble-assets-matching-idle.png' })
  await page.getByRole('button', { name: 'Start matching', exact: true }).click()
  await expect(page.locator('.match-mascot .pt-pixel-pebble')).toHaveAttribute('data-expression', 'thinking')
  await page.screenshot({ path: '/tmp/pebble-assets-matching-searching.png' })
})
