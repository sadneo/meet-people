import { expect, test } from '@playwright/test'
import { mockMatchingApi, mockMatchingSession } from './matchmaking-fixture'
import { mockCurrentEvents } from './current-events-fixture'

for (const signedIn of [false, true]) {
  test(`Show all events preserves a successful empty result (${signedIn ? 'member' : 'guest'})`, async ({ page }) => {
    await mockMatchingSession(page, signedIn)
    if (signedIn) await mockMatchingApi(page)
    await page.route('**/api/events?**', route => route.fulfill({ json: { events: [], categories: [], page: 1, hasMore: false } }))
    await page.goto('/events')
    const empty = page.getByRole('heading', { name: 'A quiet calendar' })
    await expect(empty).toBeVisible()
    // Already on All/page 1: resetting the URL does not trigger a new fetch.
    for (let click = 0; click < 2; click++) {
      await page.getByRole('button', { name: 'Show all events', exact: true }).click()
      await expect(empty).toBeVisible()
      await expect(page.getByRole('status').filter({ hasText: 'Loading events' })).toHaveCount(0)
    }
    await page.getByRole('button', { name: 'All', exact: true }).click()
    await expect(empty).toBeVisible()
    // A genuine filter change still fetches and resolves, even when it is empty.
    await page.getByRole('button', { name: 'Outdoors', exact: true }).click()
    await expect(page.getByText('No events in this category right now.')).toBeVisible()
    await page.getByRole('button', { name: 'Show all events', exact: true }).click()
    await expect(page.getByText('No upcoming events are listed right now. Check back soon.')).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: 'Loading events' })).toHaveCount(0)
  })

  test(`filter reset resolves populated and failed responses (${signedIn ? 'member' : 'guest'})`, async ({ page }) => {
    await mockMatchingSession(page, signedIn)
    if (signedIn) await mockMatchingApi(page)
    await mockCurrentEvents(page)
    await page.goto('/events?category=Outdoors')
    await expect(page.getByRole('heading', { name: 'A quiet calendar' })).toBeVisible()
    await page.getByRole('button', { name: 'Show all events', exact: true }).click()
    await expect(page.locator('.ev-event-card')).toHaveCount(1)
    await page.getByRole('button', { name: 'All', exact: true }).click()
    await expect(page.locator('.ev-event-card')).toHaveCount(1)
    await page.getByRole('button', { name: 'Outdoors', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'A quiet calendar' })).toBeVisible()
    await page.route('**/api/events?page=1', route => route.fulfill({ status: 503, json: { error: 'Unavailable' } }))
    await page.getByRole('button', { name: 'Show all events', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Events unavailable' })).toBeVisible()
    await page.getByRole('button', { name: 'All', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Events unavailable' })).toBeVisible()
    await page.unroute('**/api/events?page=1')
    await page.getByRole('button', { name: 'Retry', exact: true }).click()
    await expect(page.locator('.ev-event-card')).toHaveCount(1)
    await expect(page.getByRole('status').filter({ hasText: 'Loading events' })).toHaveCount(0)
  })
}
