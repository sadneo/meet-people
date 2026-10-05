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
  await page.getByRole('button', { name: 'Account menu' }).click()
  await expect(page.locator('.pt-account-nav').getByRole('link', { name: 'Profile' })).toBeVisible()
  await expect(page.locator('.pt-account-nav').getByRole('link', { name: 'Settings' })).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.pt-app-header')).toBeHidden()
  await expect(page.locator('.pt-bottom-nav')).toBeVisible()
  await expect(page.locator('.pt-bottom-nav').getByRole('link')).toHaveCount(5)
  await page.locator('.pt-bottom-nav').getByRole('link', { name: 'Matchmaking' }).click()
  await expect(page).toHaveURL('/matchmaking')
})

for (const width of [801, 1280]) {
  test(`avatar dropdown navigates and dismisses at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/events')
    const trigger = page.getByRole('button', { name: 'Account menu' })
    const options = page.locator('.pt-account-options')
    await expect(options).toBeHidden()
    const avatar = await trigger.getByRole('img').boundingBox()
    expect(avatar!.width).toBe(44)
    expect(avatar!.height).toBe(44)

    await trigger.focus()
    await page.keyboard.press('Enter')
    await expect(options).toBeVisible()
    const bounds = await options.boundingBox()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
    await page.keyboard.press('Tab')
    await expect(options.getByRole('link', { name: 'Profile', exact: true })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(options).toBeHidden()
    await expect(trigger).toBeFocused()

    await trigger.click()
    await trigger.click()
    await expect(options).toBeHidden()
    await trigger.click()
    await page.getByRole('heading', { name: 'Events around campus' }).click()
    await expect(options).toBeHidden()

    await page.goto('/messages/chat')
    await trigger.click()
    expect(await options.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(255, 255, 255)')
    for (const link of await options.getByRole('link').all()) {
      expect(await link.evaluate(element => {
        const bounds = element.getBoundingClientRect()
        return element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2))
      })).toBe(true)
    }
    await trigger.click()

    for (const [name, route] of [['Profile', '/profile'], ['Settings', '/settings'], ['Log out', '/login']]) {
      await trigger.click()
      await options.getByRole('link', { name, exact: true }).click()
      await expect(page).toHaveURL(route)
      await expect(options).toBeHidden()
    }
  })
}
