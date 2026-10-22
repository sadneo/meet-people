import { expect, test } from '@playwright/test'
import { mockMatchingSession } from './matchmaking-fixture'

const id = 'e0000000-0000-4000-8000-000000000001'
const event = { id, title: 'Acoustic afternoon', description: 'Live music from campus artists.', category: 'Music', starts_at: '2099-10-02T19:00:00Z', ends_at: null, location_name: 'Student Union courtyard', address: null, city: null, image_url: null, source: 'sbengaged', source_url: 'https://example.test/event', status: 'active', distance_miles: null, interested_count: 2 }

for (const [width, expectedRows] of [[1440, [3]], [1920, [2, 1]], [390, [1, 1, 1]]] as const) {
  test(`event card actions align within actual rows at ${width}px without clipping copy`, async ({ page }) => {
    const cards = [
      { ...event, title: 'Music', category: 'Music', location_name: 'Courtyard' },
      { ...event, id: 'e0000000-0000-4000-8000-000000000002', title: 'An afternoon of acoustic music and conversations with campus artists and friends', category: 'Student arts and cultural community gatherings', location_name: 'Student Union courtyard beside the east entrance and outdoor performance stage', ends_at: '2099-10-02T22:00:00Z' },
      { ...event, id: 'e0000000-0000-4000-8000-000000000003', title: 'Meet the campus performers', category: 'Live performances and student activities', location_name: 'Performing arts center lobby near the student exhibition hall' },
    ]
    await mockMatchingSession(page, false)
    await page.route('**/api/events**', route => {
      const path = new URL(route.request().url()).pathname
      return route.fulfill({ json: path === '/api/events' ? { events: cards, categories: ['Music'], page: 1, hasMore: false } : cards.find(card => path === `/api/events/${card.id}`) ?? event })
    })
    await page.setViewportSize({ width, height: 1080 })
    await page.goto('/events')
    const rendered = page.locator('.ev-event-grid .ev-event-card')
    await expect(rendered).toHaveCount(3)
    await expect(rendered.locator('h2')).toHaveText(cards.map(card => card.title))
    const geometry = await rendered.evaluateAll(elements => elements.map(card => {
      const copy = card.querySelector<HTMLElement>('.ev-event-copy')!
      const action = copy.querySelector<HTMLElement>('.ev-button')!
      const title = copy.querySelector<HTMLElement>('h2')!
      const location = copy.querySelector<HTMLElement>('p:not(.ev-event-date)')!
      const social = copy.querySelector<HTMLElement>('.ev-social-context')!
      const image = card.querySelector<HTMLElement>('.ev-event-image')!
      const bounds = card.getBoundingClientRect(), button = action.getBoundingClientRect()
      return {
        row: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right,
        buttonTop: button.top, buttonBottom: button.bottom, buttonLeft: button.left, buttonRight: button.right,
        inset: bounds.bottom - button.bottom,
        expectedInset: parseFloat(getComputedStyle(copy).paddingBottom) + parseFloat(getComputedStyle(card).borderBottomWidth),
        titleFits: title.scrollHeight <= title.clientHeight + 1,
        locationFits: location.scrollHeight <= location.clientHeight + 1,
        copyEndsBeforeFooter: location.getBoundingClientRect().bottom <= social.getBoundingClientRect().top + 2,
        imageHeight: image.getBoundingClientRect().height, expectedImageHeight: parseFloat(getComputedStyle(image).height),
      }
    }))
    const rows: typeof geometry[] = []
    for (const card of geometry) {
      const row = rows.find(items => Math.abs(items[0].row - card.row) <= 2)
      if (row) row.push(card)
      else rows.push([card])
      expect(Math.abs(card.inset - card.expectedInset)).toBeLessThanOrEqual(2)
      expect(card.buttonLeft).toBeGreaterThanOrEqual(card.left)
      expect(card.buttonRight).toBeLessThanOrEqual(card.right)
      expect(card.buttonBottom).toBeLessThanOrEqual(card.bottom)
      expect(card.titleFits && card.locationFits && card.copyEndsBeforeFooter).toBe(true)
      expect(Math.abs(card.imageHeight - card.expectedImageHeight)).toBeLessThanOrEqual(2)
    }
    expect(rows.map(row => row.length)).toEqual(expectedRows)
    for (const row of rows) {
      for (const field of ['buttonTop', 'buttonBottom', 'inset'] as const) {
        expect(Math.max(...row.map(card => card[field])) - Math.min(...row.map(card => card[field]))).toBeLessThanOrEqual(2)
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    if (width === 1920) await expect(page.locator('.ev-event-preview').getByRole('heading', { name: 'Selected event' })).toBeVisible()
    else await expect(page.locator('.ev-event-preview')).toBeHidden()
  })
}

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

for (const imageState of ['missing', 'invalid', 'failed', 'valid']) {
  test(`event image ${imageState} has accurate artwork and disclosure`, async ({ page }) => {
    await mockMatchingSession(page, false)
    const remote = 'https://event-images.example.test/photo.svg'
    const imageUrl = imageState === 'missing' ? null : imageState === 'invalid' ? 'https://' : remote
    let remoteRequests = 0
    await page.route(remote, route => {
      remoteRequests++
      return imageState === 'failed' ? route.abort() : route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#63705b"/></svg>' })
    })
    await page.route(`**/api/events/${id}`, route => route.fulfill({ json: { ...event, image_url: imageUrl } }))
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/events/${id}`)
    const photo = page.locator('.ev-detail-hero')
    const placeholderLabel = 'Pebble placeholder illustration (not an event photo)'
    if (imageState === 'valid') {
      await expect(photo).toHaveAttribute('src', remote)
      await expect(photo).toHaveAttribute('alt', `${event.title} event image`)
      await expect(page.getByText(/Pebble placeholder illustration/)).toHaveCount(0)
    } else {
      await expect(page.getByRole('img', { name: placeholderLabel, exact: true })).toBeVisible()
      await expect(photo).toHaveAttribute('src', '/images/event-placeholder.svg')
      await expect(page.getByText(`Source: sbengaged · ${placeholderLabel}`, { exact: true })).toBeVisible()
      await expect(page.getByRole('img', { name: /concert photography/i })).toHaveCount(0)
      await photo.evaluate(image => { image.dispatchEvent(new Event('error')); image.dispatchEvent(new Event('error')) })
      await expect(photo).toHaveAttribute('src', '/images/event-placeholder.svg')
    }
    await expect.poll(() => photo.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
    expect(remoteRequests).toBe(imageState === 'failed' || imageState === 'valid' ? 1 : 0)
    expect(await photo.evaluate(image => Math.round(image.getBoundingClientRect().height))).toBe(280)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
}

test('failed event photo and failed local placeholder never enter an image retry loop', async ({ page }) => {
  await mockMatchingSession(page, false)
  const remote = 'https://event-images.example.test/unavailable.jpg'
  let remoteRequests = 0, placeholderRequests = 0
  await page.route(remote, route => { remoteRequests++; return route.abort() })
  await page.route('**/images/event-placeholder.svg', route => { placeholderRequests++; return route.abort() })
  await page.route(`**/api/events/${id}`, route => route.fulfill({ json: { ...event, image_url: remote } }))
  await page.goto(`/events/${id}`)
  const photo = page.getByRole('img', { name: 'Pebble placeholder illustration (not an event photo)', exact: true })
  await expect(photo).toHaveAttribute('src', '/images/event-placeholder.svg')
  await expect.poll(() => placeholderRequests).toBe(1)
  await photo.evaluate(image => { for (let i = 0; i < 5; i++) image.dispatchEvent(new Event('error')) })
  await expect(page.getByText(/Source: sbengaged · Pebble placeholder illustration/)).toBeVisible()
  expect(remoteRequests).toBe(1)
  expect(placeholderRequests).toBe(1)
})

test('mobile cards, real empty categories, and shareable details', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/events')
  await expect(page.getByRole('heading', { name: 'Events', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Acoustic afternoon' }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Outdoors', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'A quiet calendar' })).toBeVisible()
  await page.getByRole('button', { name: 'Show all events' }).click()
  await page.getByRole('link', { name: 'See event & people' }).click()
  await expect(page).toHaveURL(new RegExp(`/events/${id}$`))
  await expect(page.getByRole('heading', { name: 'Acoustic afternoon' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Find a group to go with', exact: true })).toBeVisible()
  await expect(page.getByLabel('Email', { exact: true })).toHaveCount(0)
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
  await expect(page.getByRole('heading', { name: 'Events unavailable' })).toBeVisible()
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
