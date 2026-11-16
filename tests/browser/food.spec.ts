import { expect, test, type Page } from '@playwright/test'
import { wiringFixture } from './wiring-fixture'
import type { DiningItem, DiningMenu } from '../../shared/dining'

const today = '2026-11-06'
const dish = (name: string, station: string | null, overrides: Partial<DiningItem> = {}): DiningItem => ({
  external_id: name, name, station, description: null, ingredients: null, image_url: null, price: null,
  nutrition: null, serving_size: null, labels: [], ...overrides,
})
const menu = (id: number, overrides: Partial<DiningMenu> = {}): DiningMenu => ({
  id: `a0000000-0000-4000-8000-${String(id).padStart(12, '0')}`, source: 'nutrislice_sbu',
  location_slug: 'east-side-dining', location_name: 'East Side Dining', menu_slug: 'lunch', menu_name: 'Lunch', menu_date: today,
  source_url: 'https://stonybrook.nutrislice.com/menu/', last_synced_at: '2026-11-06T12:00:00Z', notices: [],
  items: [
    dish('Roasted vegetable bowl', 'Rooted', { description: 'Seasonal vegetables with brown rice.', labels: ['Vegan', 'Contains Soy'], ingredients: 'Brown rice, squash, broccoli, soy sauce.', nutrition: { calories: 420, protein_g: 12 }, serving_size: { amount: 1, unit: 'bowl' } }),
    dish('Tomato basil soup', 'Soup kettle', { labels: ['Vegetarian'] }),
    dish('Grilled chicken', 'The grill', { price: 6.5 }),
  ], ...overrides,
})
const menus = [menu(1), menu(2, { menu_slug: 'dinner', menu_name: 'Dinner', items: [dish('Lemon herb chicken', 'The grill')] }), menu(3, { location_slug: 'west-side-dining', location_name: 'West Side Dining', items: [] }), menu(4, { source: 'sbu_hospital', location_slug: 'market-place-cafe', location_name: 'Market Place Café', menu_slug: 'daily', menu_name: 'Daily menu', notices: ['Menu subject to change.'], items: [dish('Garden salad (V)', null)], source_url: 'https://www.stonybrookmedicine.edu/diningservices/locations' })]

async function fixture(page: Page) {
  await page.clock.setFixedTime(new Date('2026-11-07T01:00:00Z'))
  await wiringFixture(page)
  await page.route('**/api/dining?**', route => {
    const date = new URL(route.request().url()).searchParams.get('date')!
    return route.fulfill({ json: { date, menus: date === today ? menus : [] } })
  })
}

for (const width of [320, 390, 1280]) test(`Discover opens food menus with usable controls at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 900 })
  await fixture(page)
  await page.goto('/matchmaking?mode=dating')
  const entry = page.getByRole('link', { name: 'Food menus', exact: true })
  await expect(entry).toBeVisible()
  await entry.click()
  await expect(page.getByRole('heading', { name: 'Food menus', exact: true })).toBeVisible()
  await expect(page.getByLabel('Menu date')).toHaveValue(today)
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Discover', exact: true })).toHaveAttribute('aria-current', 'page')
  const firstDish = page.getByRole('button', { name: 'Details for Roasted vegetable bowl', exact: true })
  await expect(firstDish).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const targets = await page.locator('.food-days button, .food-meals button, .food-filters input, .food-filters select').evaluateAll(elements => elements.map(element => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })))
  expect(targets.every(target => target.width >= 44 && target.height >= 44)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath(`food-${width}.png`), fullPage: true })
  await firstDish.click()
  const dialog = page.getByRole('dialog', { name: 'Roasted vegetable bowl' })
  await expect(dialog.getByText('Brown rice, squash, broccoli, soy sauce.')).toBeVisible()
  await expect(dialog.getByText('420', { exact: true })).toBeVisible()
  await expect(dialog.getByText('Contains Soy', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(firstDish).toBeFocused()
  await page.getByRole('group', { name: 'Meal', exact: true }).getByRole('button', { name: 'Dinner', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Details for Lemon herb chicken' })).toBeVisible()
  await page.getByLabel('Dining location').selectOption('sbu_hospital:market-place-cafe')
  await expect(page.getByText('Menu subject to change.', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'On the menu' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Provider menu' })).toHaveAttribute('href', 'https://www.stonybrookmedicine.edu/diningservices/locations')
  await page.locator('.food-page').getByRole('link', { name: 'Discover', exact: true }).click()
  await expect(page).toHaveURL(/\/matchmaking\?mode=dating$/)
})

test('search, unpublished dates and explicitly empty menus remain distinct', async ({ page }) => {
  await fixture(page)
  await page.goto(`/matchmaking/food?date=${today}&location=nutrislice_sbu:east-side-dining&meal=dinner`)
  await expect(page.getByRole('button', { name: 'Details for Lemon herb chicken' })).toBeVisible()
  await page.getByLabel('Find a dish').fill('not on this menu')
  await expect(page.getByRole('heading', { name: 'No dishes match “not on this menu”.' })).toBeVisible()
  await page.getByRole('button', { name: 'Clear search', exact: true }).click()
  await page.getByLabel('Dining location').selectOption('nutrislice_sbu:west-side-dining')
  await expect(page.getByRole('heading', { name: 'No dishes listed for this menu.' })).toBeVisible()
  await page.getByLabel('Menu date').fill('2026-11-07')
  await expect(page.getByRole('heading', { name: 'No menus published for this day.' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'No dishes listed for this menu.' })).toHaveCount(0)
  await page.reload()
  await expect(page.getByLabel('Menu date')).toHaveValue('2026-11-07')
})

test('loading, failure, retry and background-refresh errors retain honest state', async ({ page }) => {
  await fixture(page)
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  let fail = true
  await page.route('**/api/dining?**', async route => {
    await gate
    return route.fulfill(fail ? { status: 503, json: { error: 'Unavailable' } } : { json: { date: today, menus } })
  })
  await page.goto('/matchmaking/food')
  await expect(page.getByRole('status', { name: '' }).filter({ hasText: 'Loading food menus' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'No menus published for this day.' })).toHaveCount(0)
  release()
  await expect(page.getByRole('alert')).toContainText('Food menus couldn’t be loaded.')
  fail = false
  await page.getByRole('button', { name: 'Reload saved data' }).click()
  await expect(page.getByRole('button', { name: 'Details for Roasted vegetable bowl' })).toBeVisible()
  fail = true
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Details for Roasted vegetable bowl' })).toBeVisible()
  await expect(page.getByText('Last updated', { exact: false })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'No menus published for this day.' })).toHaveCount(0)
})

test('calendar boundary dates never crash the menu screen', async ({ page }) => {
  await fixture(page)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  for (const date of ['9999-12-31', '0000-01-01', 'not-a-date', '2026-02-30']) {
    await page.goto(`/matchmaking/food?date=${date}`)
    await expect(page.getByRole('heading', { name: 'Food menus', exact: true })).toBeVisible()
    await expect(page.getByLabel('Menu date')).toHaveValue(['9999-12-31'].includes(date) ? date : today)
    await expect(page.getByRole('group', { name: 'Menu days' }).getByRole('button')).toHaveCount(7)
    await expect(page.getByRole('button', { name: /Invalid Date/i })).toHaveCount(0)
    const labels = await page.getByRole('group', { name: 'Menu days' }).getByRole('button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label')))
    expect(new Set(labels).size).toBe(7)
  }
  expect(errors).toEqual([])
})

test('returning after campus midnight updates an implicit Today selection', async ({ page }) => {
  await fixture(page)
  await page.goto('/matchmaking/food')
  await expect(page.getByLabel('Menu date')).toHaveValue(today)
  await expect(page.getByRole('button', { name: 'Details for Roasted vegetable bowl' })).toBeVisible()
  await page.waitForLoadState('networkidle')
  await page.clock.setFixedTime(new Date('2026-11-07T13:00:00Z'))
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByLabel('Menu date')).toHaveValue('2026-11-07')
  await expect(page.getByRole('heading', { name: 'No menus published for this day.' })).toBeVisible()
})

test('returning after midnight preserves a deliberately selected date', async ({ page }) => {
  await fixture(page)
  await page.goto(`/matchmaking/food?date=${today}`)
  await expect(page.getByRole('button', { name: 'Details for Roasted vegetable bowl' })).toBeVisible()
  await page.waitForLoadState('networkidle')
  await page.clock.setFixedTime(new Date('2026-11-07T13:00:00Z'))
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect(page.getByLabel('Menu date')).toHaveValue(today)
  await expect(page.locator('.food-date-heading h2')).toContainText('Friday')
  await expect(page.getByRole('button', { name: 'Details for Roasted vegetable bowl' })).toBeVisible()
})

test('food controls remain readable with large text on a short 320px screen', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 480 })
  await fixture(page)
  await page.goto('/matchmaking/food')
  await expect(page.getByRole('button', { name: 'Details for Roasted vegetable bowl' })).toBeVisible()
  await page.evaluate(() => {
    const elements = [...document.querySelectorAll<HTMLElement>('body *')].filter(element => !element.closest('svg'))
    const sizes = elements.map(element => ({ font: parseFloat(getComputedStyle(element).fontSize) * 2, line: parseFloat(getComputedStyle(element).lineHeight) * 2 }))
    elements.forEach((element, index) => {
      element.style.fontSize = `${sizes[index].font}px`
      if (Number.isFinite(sizes[index].line)) element.style.lineHeight = `${sizes[index].line}px`
    })
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const days = page.getByRole('group', { name: 'Menu days' })
  const bounds = await days.locator('button').evaluateAll(buttons => buttons.map(button => {
    const target = button.getBoundingClientRect()
    return [...button.querySelectorAll('span, strong')].flatMap(element => {
      const range = document.createRange()
      range.selectNodeContents(element)
      return [...range.getClientRects()].map(rect => ({ left: rect.left, right: rect.right, targetLeft: target.left, targetRight: target.right }))
    })
  }).flat())
  await page.screenshot({ path: testInfo.outputPath('food-large-text.png'), fullPage: true })
  for (const bound of bounds) {
    expect(bound.left).toBeGreaterThanOrEqual(bound.targetLeft)
    expect(bound.right).toBeLessThanOrEqual(bound.targetRight)
  }
  const dish = page.getByRole('button', { name: 'Details for Roasted vegetable bowl' })
  await dish.click()
  const dialog = page.getByRole('dialog', { name: 'Roasted vegetable bowl' })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(dish).toBeFocused()
})

test('a slow response for the previous date never replaces the selected day', async ({ page }) => {
  await fixture(page)
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/dining?**', async route => {
    const date = new URL(route.request().url()).searchParams.get('date')!
    if (date === today) await gate
    await route.fulfill({ json: { date, menus: date === today ? menus : [] } })
  })
  await page.goto('/matchmaking/food')
  await expect(page.locator('[data-skeleton="dining"]')).toBeVisible()
  await page.getByLabel('Menu date').fill('2026-11-07')
  await expect(page.getByRole('heading', { name: 'No menus published for this day.' })).toBeVisible()
  release()
  await page.waitForLoadState('networkidle')
  await expect(page.getByLabel('Menu date')).toHaveValue('2026-11-07')
  await expect(page.getByRole('heading', { name: 'No menus published for this day.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Details for Roasted vegetable bowl' })).toHaveCount(0)
})

test('a full dining catalog uses a compact menu picker instead of a wall of buttons', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await fixture(page)
  const catalog = [menu(1), ...['Breakfast Specials', "Chef’s Table", 'Deli', 'Grill', 'Pasta Specials', 'Salad Bar'].map((name, index) => menu(index + 10, {
    menu_name: name, menu_slug: `station-${index}`, items: [dish(`${name} dish`, name)],
  }))]
  await page.route('**/api/dining?**', route => route.fulfill({ json: { date: today, menus: catalog } }))
  await page.goto('/matchmaking/food')
  const picker = page.getByRole('combobox', { name: 'Menu', exact: true })
  await expect(picker).toBeVisible()
  await expect(picker.getByRole('option')).toHaveCount(catalog.length)
  await expect(page.getByRole('group', { name: 'Meal', exact: true })).toHaveCount(0)
  await picker.selectOption('station-1')
  await expect(page.locator('#food-menu-title')).toHaveText('Chef’s Table')
  await expect(page.getByRole('button', { name: 'Details for Chef’s Table dish' })).toBeVisible()
  await page.reload()
  await expect(picker).toHaveValue('station-1')
})
