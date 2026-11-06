import { expect, test } from '@playwright/test'
import { eventId, wiringFixture } from './wiring-fixture'

for (const width of [320, 390, 630]) {
  test(`event directory matches the demo at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 980 })
    await wiringFixture(page)
    await page.goto('/events')
    await expect(page.getByRole('heading', { name: 'Events', exact: true })).toHaveCSS('color', 'rgb(40, 86, 64)')
    const card = page.locator('.event-card').first()
    await expect(card).toBeVisible()
    await expect(card).toHaveCSS('background-color', 'rgb(240, 233, 223)')
    await expect(card.locator('.event-cta')).toHaveText('See event & people')
    await expect(card.locator('.event-company')).toContainText('looking for company')
    await expect(page.getByRole('group', { name: 'Event categories' })).toHaveCount(0)
    await expect(page.getByLabel('Category', { exact: true })).toHaveCount(0)
    expect(await page.locator('.event-directory').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(width < 480 ? 1 : 2)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('button', { name: 'Filter events', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Filter events' })).toBeVisible()
    await expect(page.getByLabel('Category', { exact: true })).toHaveValue('')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Filter events', exact: true })).toBeFocused()
  })
}

const hostedCategories = [
  'Music', 'Food', 'Outdoors', 'Creative', 'Social', 'Workshops', 'Dinner/Gala',
  'Drop-in/Open Space', 'Fundraiser', 'Health Clinic/Screening', 'Info Session/Panel',
  'Lecture', 'Meeting', 'Rehearsal/Practice', 'Screening', 'Study Session/Group',
  'Tabling', 'Tour', 'Training', 'Trip/Excursion', 'Workshop', 'Worship/Religious Service',
]

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  test(`large category catalog stays in Filters at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await wiringFixture(page)
    const requests: URL[] = []
    await page.route('**/api/events?*', route => {
      const url = new URL(route.request().url())
      requests.push(url)
      return route.fulfill({ json: {
        events: [{ id: eventId, title: url.searchParams.has('category') ? 'Filtered campus concert' : 'Campus concert', description: null, category: 'Music', starts_at: '2099-11-04T17:00:00Z', ends_at: null, location_name: 'Campus', address: null, city: null, image_url: null, source: 'Campus', source_url: null, status: 'active', distance_miles: null }],
        categories: hostedCategories, page: Number(url.searchParams.get('page')), hasMore: true,
      } })
    })
    await page.goto('/events')
    const card = page.locator('.event-card').first()
    await expect(card).toBeVisible()
    const heading = (await page.locator('.events-page .pagehead').boundingBox())!
    expect((await card.boundingBox())!.y - heading.y - heading.height).toBeLessThanOrEqual(20)
    await expect(page.getByRole('group', { name: 'Event categories' })).toHaveCount(0)
    await expect(page.getByLabel('Category', { exact: true })).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

    await page.screenshot({ path: test.info().outputPath('events-collapsed.png') })
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page.getByText('Page 2', { exact: true })).toBeVisible()
    const filters = page.getByRole('button', { name: 'Filter events', exact: true })
    const target = (await filters.boundingBox())!
    expect(target.width).toBeGreaterThanOrEqual(44)
    expect(target.height).toBeGreaterThanOrEqual(44)
    await filters.click()
    const category = page.getByLabel('Category', { exact: true })
    await expect(category.locator('option')).toHaveCount(hostedCategories.length + 1)
    await page.screenshot({ path: test.info().outputPath('events-filters.png') })
    await category.selectOption('Health Clinic/Screening')
    await expect.poll(() => requests.at(-1)?.searchParams.get('category')).toBe('Health Clinic/Screening')
    expect(requests.at(-1)?.searchParams.get('page')).toBe('1')
    await expect(page.getByRole('heading', { name: 'Filtered campus concert', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await expect(page.getByText('Page 1', { exact: true })).toBeVisible()
    await expect(page.locator('#event-filter-summary')).toHaveText('Category: Health Clinic/Screening')

    await filters.click()
    await expect(category).toHaveValue('Health Clinic/Screening')
    await page.keyboard.press('Escape')
    await expect(filters).toBeFocused()
    await expect(page.locator('#event-filter-summary')).toBeVisible()
    await filters.click()
    await page.getByRole('button', { name: 'Reset filters', exact: true }).click()
    await expect(category).toHaveValue('')
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await expect(page.locator('#event-filter-summary')).toHaveCount(0)
    // Reset can restore the fresh unfiltered cache without another network read.
    await expect(page.getByRole('heading', { name: 'Campus concert', exact: true })).toBeVisible()
    await expect(page.getByText('Page 1', { exact: true })).toBeVisible()
  })
}
