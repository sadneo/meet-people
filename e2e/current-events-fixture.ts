import type { Page } from '@playwright/test'

export const testEventId = 'e0000000-0000-4000-8000-000000000001'
export async function mockCurrentEvents(page: Page) {
  const event = { id: testEventId, title: 'Campus concert', description: 'Test event.', category: 'Music', starts_at: '2099-10-02T15:00:00Z', ends_at: null, location_name: 'Student Union', address: null, city: 'Stony Brook', image_url: null, source: 'test', source_url: null, status: 'active', distance_miles: null, interested_count: 0 }
  await page.route('**/api/events**', route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/events') return route.fulfill({ json: { events: url.searchParams.get('category') === 'Outdoors' ? [] : [event], categories: ['Music', 'Outdoors'], page: 1, hasMore: false } })
    if (url.pathname === `/api/events/${testEventId}`) return route.fulfill({ json: event })
    return route.fulfill({ status: 404, json: { error: 'This event is no longer available.' } })
  })
}
