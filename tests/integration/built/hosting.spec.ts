import { expect, test } from '@playwright/test'
import { EventsResponseSchema } from '../../../shared/events'

test('production shell supports deep-link refresh and same-origin API access', async ({ page, request }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Meet new friends/ })).toBeAttached()
  await expect(page.getByRole('link', { name: /Sign in/ })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Android — coming soon' })).toBeAttached()
  for (const route of ['/events', '/login', '/reset-password']) {
    await page.goto(route)
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  }
  const health = await request.get('/api/health')
  expect(await health.json()).toEqual({ status: 'ok' })
  expect(health.headers()['cache-control']).toContain('no-store')
  const events = await request.get('/api/events?limit=1')
  expect(events.status()).toBe(200)
  const listing = EventsResponseSchema.parse(await events.json())
  if (listing.events[0]) {
    const detail = await request.get(`/api/events/${listing.events[0].id}`)
    expect(detail.status()).toBe(200)
    expect((await detail.json()).id).toBe(listing.events[0].id)
  }
  expect((await request.get('/api/matchmaking/account')).status()).toBe(401)
  expect(errors).toEqual([])
})
