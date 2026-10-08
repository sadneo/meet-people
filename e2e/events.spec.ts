import { expect, test } from '@playwright/test'

const id = 'e0000000-0000-4000-8000-000000000001'
const event = { id, title: 'Acoustic afternoon', description: 'Live music from campus artists.', category: 'Music', starts_at: '2099-10-02T19:00:00Z', ends_at: null, location_name: 'Student Union courtyard', address: null, city: null, image_url: null, source: 'sbengaged', source_url: 'https://example.test/event', status: 'active', distance_miles: null, interested_count: 2 }

test.beforeEach(async ({ page }) => {
  await page.route('**/api/events**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/events') {
      const empty = url.searchParams.get('category') === 'Outdoors'
      await route.fulfill({ json: { events: empty ? [] : [event], categories: ['Music', 'Food', 'Outdoors'], page: 1, hasMore: false } })
    } else if (url.pathname === `/api/events/${id}`) await route.fulfill({ json: event })
    else await route.fulfill({ status: 404, json: { error: 'This event is no longer available.' } })
  })
})

test('mobile cards, real empty categories, and shareable details', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/events')
  await expect(page.getByRole('heading', { name: 'Events around campus' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Acoustic afternoon' }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Outdoors', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'A quiet calendar' })).toBeVisible()
  await page.getByRole('button', { name: 'Show all events' }).click()
  await page.getByRole('link', { name: 'See event & people' }).click()
  await expect(page).toHaveURL(new RegExp(`/events/${id}$`))
  await expect(page.getByRole('heading', { name: 'Acoustic afternoon' })).toBeVisible()
  await expect(page.getByText('Sign in to see interested people and find company.')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Acoustic afternoon' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('wide desktop retains the prototype side preview', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/events')
  await expect(page.getByRole('heading', { name: 'Selected event' })).toBeVisible()
  await page.getByRole('link', { name: 'See event & people' }).click()
  await expect(page).toHaveURL(new RegExp(`selected=${id}`))
  await expect(page.locator('.ev-event-preview').getByRole('heading', { name: 'Acoustic afternoon' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('failed requests can be retried and unavailable details are explained', async ({ page }) => {
  let fail = true
  await page.route('**/api/events?**', route => route.fulfill(fail ? { status: 503, json: { error: 'Events are temporarily unavailable. Please try again.' } } : { json: { events: [event], categories: ['Music'], page: 1, hasMore: false } }))
  await page.goto('/events')
  await expect(page.getByRole('heading', { name: 'Could not load events' })).toBeVisible()
  fail = false
  await page.getByRole('button', { name: 'Retry' }).click()
  await expect(page.getByRole('heading', { name: 'Acoustic afternoon' }).first()).toBeVisible()
  await page.goto('/events/e0000000-0000-4000-8000-000000000099')
  await expect(page.getByRole('alert')).toContainText('This event is no longer available.')
})

test('feature styles preserve host prototype controls and layout', async ({ page }) => {
  await page.goto('/events')
  await expect(page.getByRole('heading', { name: 'Acoustic afternoon' }).first()).toBeVisible()
  const hostStyles = await page.evaluate(() => {
    const host = document.createElement('div')
    host.className = 'pt-app'
    const button = document.createElement('button')
    button.className = 'pt-button'
    button.style.color = 'rgb(17, 34, 51)'
    button.style.padding = '2px'
    host.appendChild(button)
    document.body.appendChild(host)
    const read = () => ({ color: getComputedStyle(button).color, padding: getComputedStyle(button).padding, hostMinHeight: getComputedStyle(host).minHeight })
    const before = read()
    const feature = document.createElement('div')
    feature.className = 'ev-feature'
    feature.innerHTML = '<button class="ev-button">Feature control</button>'
    host.appendChild(feature)
    const after = read()
    host.remove()
    return { before, after }
  })
  expect(hostStyles.after).toEqual(hostStyles.before)
  await expect(page.locator('main')).toHaveCount(1)
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toHaveCount(1)
  await expect(page.locator('.ev-feature main, .ev-feature nav')).toHaveCount(0)
  await expect(page.locator('.ev-feature .ev-price')).toHaveCount(0)
})
