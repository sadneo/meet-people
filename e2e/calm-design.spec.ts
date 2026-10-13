import { expect, test } from '@playwright/test'

for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080], [2560, 1440], [768, 1024], [390, 844], [320, 568]]) {
  test(`calm compositions scale and remain reachable at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    for (const route of ['/', '/community', '/matchmaking', '/events', '/messages/chat']) {
      await page.goto(route)
      await expect(page.locator('.pt-main')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth), route).toBe(width)
      if (width > 800) {
        expect(await page.locator('.pt-app-header').evaluate(el => getComputedStyle(el).backgroundColor)).toBe(await page.locator('.pt-app').evaluate(el => getComputedStyle(el).backgroundColor))
      }
      await expect(page.getByLabel('Review scene')).toBeHidden()
      if (route === '/') {
        const visual = (await page.locator('.pt-pebble-refresh > .pt-pebble').boundingBox())!
        expect(visual.width).toBeGreaterThan(width >= 1920 ? 360 : 160)
        const action = (await page.getByRole('link', { name: 'Find people' }).boundingBox())!
        expect(action.y + action.height).toBeLessThanOrEqual(height - (width <= 800 ? 72 : 0))
        await expect(page.locator('.pt-community-world')).toHaveCount(0)
      }
      if (route === '/community') {
        const diorama = (await page.locator('.pt-diorama').boundingBox())!
        expect(diorama.width).toBeGreaterThan(width >= 1920 ? 1000 : 300)
        const chart = (await page.locator('.pt-community-history').boundingBox())!
        expect(chart.y).toBeGreaterThan(diorama.y)
        expect(chart.y + chart.height).toBeLessThanOrEqual(height - (width <= 800 ? 72 : 0))
        await expect(page.getByText('Demo history', { exact: true })).toHaveCount(0)
      }
      await page.screenshot({ path: `/tmp/pebble-review/${width}-${route === '/' ? 'home' : route.replaceAll('/', '-')}.png`, fullPage: true })
    }
  })
}

test('history selection changes the scene without spending or granting Pebbles', async ({ page }) => {
  await page.goto('/community')
  const balance = await page.getByLabel('Pebble balance', { exact: true }).textContent()
  const bars = page.getByRole('group', { name: 'Select a day' }).getByRole('button')
  await bars.first().click()
  await expect(bars.first()).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.pt-diorama')).toHaveAttribute('data-stage', '0')
  await bars.last().focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.pt-diorama')).toHaveAttribute('data-stage', '6')
  await page.getByRole('button', { name: 'Previous week' }).click()
  await expect(page.locator('.pt-diorama')).toHaveAttribute('data-stage', '6')
  await expect(page.getByLabel('Pebble balance', { exact: true })).toHaveText(balance!)
  await page.getByRole('button', { name: 'Build your community', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Build Wildflower Patch', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Build your community', exact: true })).toBeFocused()
})
