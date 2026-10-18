import { expect, test } from '@playwright/test'

test('production shell supports deep-link refresh and same-origin API access', async ({ page, request }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Who’s around?' })).toBeAttached()
  await expect(page.locator('.pt-account-nav').getByRole('link', { name: 'Sign in', exact: true })).toBeVisible()
  for (const route of ['/events', '/login', '/reset-password']) {
    await page.goto(route)
    await page.reload()
    await expect(page.getByRole('main')).toBeVisible()
  }
  const health = await request.get('/api/health')
  expect(await health.json()).toEqual({ status: 'ok' })
  expect(health.headers()['cache-control']).toContain('no-store')
  expect((await request.get('/api/matchmaking/account')).status()).toBe(401)
  expect(errors).toEqual([])
})
