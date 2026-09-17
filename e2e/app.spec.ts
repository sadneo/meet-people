import { expect, test } from '@playwright/test'

test('renders home, fallback routes, and API health', async ({ page, request }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Meet People' })).toBeVisible()

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

    await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width)
    expect((await page.getByRole('link', { name: 'Home' }).boundingBox())?.height).toBeGreaterThanOrEqual(44)
  })
}
