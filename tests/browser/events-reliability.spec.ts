import { expect, test, type Page } from '@playwright/test'
import { eventId, wiringFixture } from './wiring-fixture'

test.use({ viewport: { width: 390, height: 844 } })

const categories = ['Music', 'Food', 'Health Clinic/Screening', 'Info Session/Panel', 'Lecture', 'Worship/Religious Service', 'Arts', 'R&B + Friends']
const event = { id: eventId, title: 'Reliable event', description: null, category: 'Music', starts_at: '2099-11-04T17:00:00Z', ends_at: null, location_name: 'Campus', address: null, city: null, image_url: null, source: 'Campus', source_url: null, status: 'active', distance_miles: null }

async function fixture(page: Page, publicView = false) {
  if (publicView) await page.route('**/src/mobile/main.tsx*', route => route.fulfill({ contentType: 'application/javascript', body: 'import "/src/main.tsx"' }))
  const state = await wiringFixture(page, { guest: publicView })
  const requests: URL[] = []
  let failure = '', slow = false
  let release: (() => void) | undefined
  await page.route('**/api/events?*', async route => {
    const url = new URL(route.request().url())
    requests.push(url)
    if (slow && url.searchParams.get('category') === 'Lecture') await new Promise<void>(resolve => { release = resolve })
    if (failure && url.searchParams.get('category') === 'Lecture') {
      if (failure === 'network') return route.abort('failed')
      return route.fulfill({ status: 503, json: { error: 'Events are unavailable. Try again.' } })
    }
    return route.fulfill({ json: { events: [{ ...event, title: `${url.searchParams.get('category') || 'All'} page ${url.searchParams.get('page')}` }], categories, page: Number(url.searchParams.get('page')), hasMore: true } })
  })
  return { ...state, requests, fail: (value: string) => { failure = value }, delay: () => { slow = true }, release: () => release?.() }
}

async function choose(page: Page, category: string) {
  await page.getByRole('button', { name: 'Filter events', exact: true }).click()
  await page.getByLabel('Category', { exact: true }).selectOption(category)
  await page.getByRole('button', { name: 'Done', exact: true }).click()
}

for (const publicView of [false, true]) {
  test(`${publicView ? 'public explore' : 'private events'} keeps URL search through detail, Close and history`, async ({ page }) => {
    const state = await fixture(page, publicView)
    const root = publicView ? '/explore' : '/events'
    await page.goto(root)
    await expect(page.locator('.event-card')).toBeVisible()
    await choose(page, 'Health Clinic/Screening')
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page.getByText('Page 2', { exact: true })).toBeVisible()
    const search = new URL(page.url()).search
    await page.locator('.event-card').click()
    await page.getByRole('link', { name: 'Close event', exact: true }).waitFor()
    await page.goBack()
    await expect(page.locator('#event-filter-summary')).toHaveText('Category: Health Clinic/Screening')
    await expect(page.getByText('Page 2', { exact: true })).toBeVisible()
    await page.goForward()
    await page.getByRole('link', { name: 'Close event', exact: true }).click()
    expect(new URL(page.url()).search).toBe(search)
    await expect(page.getByText('Page 2', { exact: true })).toBeVisible()
    await choose(page, 'R&B + Friends')
    await expect(page.getByText('Page 1', { exact: true })).toBeVisible()
    expect(new URL(page.url()).searchParams.get('category')).toBe('R&B + Friends')
    await page.goBack()
    await expect(page.getByText('Page 2', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Filter events', exact: true }).click()
    await expect(page.getByLabel('Category', { exact: true })).toHaveValue('Health Clinic/Screening')
    await page.goForward()
    await expect(page.getByLabel('Category', { exact: true })).toHaveValue('R&B + Friends')
    await page.goBack()
    await expect(page.getByLabel('Category', { exact: true })).toHaveValue('Health Clinic/Screening')
    await page.getByRole('button', { name: 'Reset filters', exact: true }).click()
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await expect(page.getByText('Page 1', { exact: true })).toBeVisible()
    await expect(page.locator('#event-filter-summary')).toHaveCount(0)
    expect(state.calls.filter(call => ['POST', 'PUT', 'DELETE'].includes(call.method))).toHaveLength(0)
  })
}

for (const failure of ['http', 'network']) {
  test(`retains real catalog during ${failure} failure and explicit recovery`, async ({ page }) => {
    const state = await fixture(page)
    await page.goto('/events')
    await expect(page.locator('.event-card')).toBeVisible()
    state.fail(failure)
    await choose(page, 'Lecture')
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.locator('.event-card')).toHaveCount(0)
    await page.getByRole('button', { name: 'Filter events', exact: true }).click()
    await expect(page.getByLabel('Category', { exact: true }).locator('option[value="Health Clinic/Screening"]')).toHaveCount(1)
    await page.getByLabel('Category', { exact: true }).selectOption('Health Clinic/Screening')
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Health Clinic/Screening page 1', exact: true })).toBeVisible()
    await choose(page, 'Lecture')
    await expect(page.getByRole('alert')).toBeVisible()
    state.fail('')
    await page.getByRole('button', { name: 'Reload saved data', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Lecture page 1', exact: true })).toBeVisible()
  })
}

test('direct links validate pages and preserve raw category encoding', async ({ page }) => {
  const state = await fixture(page)
  for (const [input, expected] of [['2', 2], ['0', 1], ['-1', 1], ['101', 1], ['1.5', 1], ['garbage', 1], ['100', 100]] as const) {
    await page.goto(`/events?category=${encodeURIComponent('R&B + Friends')}&page=${input}`)
    await expect(page.getByRole('heading', { name: `R&B + Friends page ${expected}`, exact: true })).toBeVisible()
    expect(state.requests.some(url => url.searchParams.get('category') === 'R&B + Friends' && url.searchParams.get('page') === String(expected))).toBe(true)
    if (expected === 100) await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled()
  }
  await page.goto(`/events/${eventId}?category=${encodeURIComponent('R&B + Friends')}&page=2`)
  await page.getByRole('link', { name: 'Close event', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'R&B + Friends page 2', exact: true })).toBeVisible()
})

test('rapid category changes ignore out-of-order reads without losing the catalog', async ({ page }) => {
  const state = await fixture(page)
  await page.goto('/events')
  await expect(page.locator('.event-card')).toBeVisible()
  state.delay()
  await choose(page, 'Lecture')
  await expect.poll(() => state.requests.at(-1)?.searchParams.get('category')).toBe('Lecture')
  await choose(page, 'Info Session/Panel')
  await expect(page.getByRole('heading', { name: 'Info Session/Panel page 1', exact: true })).toBeVisible()
  state.release()
  await page.getByRole('button', { name: 'Filter events', exact: true }).click()
  await expect(page.getByLabel('Category', { exact: true })).toHaveValue('Info Session/Panel')
  await expect(page.getByLabel('Category', { exact: true }).locator('option[value="Worship/Religious Service"]')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('heading', { name: 'Info Session/Panel page 1', exact: true })).toBeVisible()
})
