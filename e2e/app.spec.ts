import { expect, test } from '@playwright/test'

test('renders home, fallback routes, and API health', async ({ page, request }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Your Pebble community' })).toBeAttached()

  await page.goto('/events')
  await expect(page.getByRole('heading', { name: 'Events around campus' })).toBeVisible()

  for (const removed of ['/prototype', '/prototype?scene=events', '/community']) {
    await page.goto(removed)
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  }

  await page.goto('/missing', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()

  const response = await request.get('/api/health')
  await expect(response).toBeOK()
  await expect(response.json()).resolves.toEqual({ status: 'ok' })
})

for (const viewport of [{ width: 375, height: 667 }, { width: 1280, height: 800 }]) {
  test(`fits the app shell at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/')

    const navigation = page.locator(viewport.width <= 800 ? '.pt-bottom-nav' : '.pt-desktop-nav')
    await expect(navigation).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width)
    expect((await navigation.getByRole('link', { name: 'Home' }).boundingBox())?.height).toBeGreaterThanOrEqual(44)
  })
}
test('app shell switches between desktop and mobile navigation', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 })
  await page.goto('/events')
  await expect(page.locator('.pt-app-header')).toBeVisible()
  await expect(page.locator('.pt-bottom-nav')).toBeHidden()
  await expect(page.locator('.pt-account-nav').getByRole('link', { name: 'Profile' })).toBeVisible()
  await expect(page.locator('.pt-account-nav').getByRole('link', { name: 'Settings' })).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.pt-app-header')).toBeHidden()
  await expect(page.locator('.pt-bottom-nav')).toBeVisible()
  await expect(page.locator('.pt-bottom-nav').getByRole('link')).toHaveCount(5)
  await page.locator('.pt-bottom-nav').getByRole('link', { name: 'Matchmaking' }).click()
  await expect(page).toHaveURL('/matchmaking')
})
