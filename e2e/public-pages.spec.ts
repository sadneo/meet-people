import { expect, test } from '@playwright/test'
import { mockCurrentEvents, testEventId } from './current-events-fixture'
import { mockMatchingSession } from './matchmaking-fixture'
import { mkdir } from 'node:fs/promises'

const shots = 'output/public-review'
test.beforeAll(async () => { await mkdir(shots, { recursive: true }) })

for (const width of [320, 390, 800, 1280, 1440, 2560]) {
  test(`public visitor at ${width}px: hero, events, footer and readable legal pages`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 801 ? 844 : 900 })
    await mockCurrentEvents(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Find a little time in common.' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Public navigation' }).getByRole('link', { name: 'Get started' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Developer controls' })).toHaveCount(0)
    await expect(page.locator('.pt-bottom-nav')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    expect(await page.evaluate(() => localStorage.getItem('pebble:full-ui:community:v1'))).toBeNull()
    await page.screenshot({ path: `${shots}/landing-${width}.png`, fullPage: true })
    await page.getByRole('navigation', { name: 'Public navigation' }).getByRole('link', { name: 'Explore events' }).click()
    await expect(page.locator('.ev-event-card')).toHaveCount(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: `${shots}/events-fixture-${width}.png`, fullPage: true })
    await page.goto(`/events/${testEventId}`)
    await expect(page.getByRole('link', { name: 'Sign up to find company' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: `${shots}/event-detail-fixture-${width}.png`, fullPage: true })
    for (const [title, route] of [['Terms of Service', '/terms'], ['Privacy Policy', '/privacy'], ['Cookie Policy', '/cookies']]) {
      await page.getByRole('navigation', { name: 'Footer navigation' }).getByRole('link', { name: title, exact: true }).click()
      await expect(page).toHaveURL(new RegExp(`${route}$`))
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
      await expect(page.getByText('[TO BE CONFIRMED BEFORE PUBLICATION]', { exact: true })).toHaveCount(2)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    }
    await page.screenshot({ path: `${shots}/cookies-${width}.png`, fullPage: true })
  })
}

test('event action hands off safely to existing signup/login with the event preserved', async ({ page }) => {
  await mockMatchingSession(page, false)
  await mockCurrentEvents(page)
  const privateRequests: string[] = []
  page.on('request', request => { if (request.url().includes('/api/matchmaking/')) privateRequests.push(request.url()) })
  await page.goto(`/events/${testEventId}`)
  await expect(page.getByRole('heading', { name: 'Campus concert', exact: true })).toBeVisible()
  const signUp = page.getByRole('link', { name: 'Sign up to find company' })
  await expect(signUp).toHaveAttribute('href', `/register?returnTo=%2Fevents%2F${testEventId}`)
  await signUp.click()
  await expect(page.getByRole('heading', { name: 'Create an account', exact: true })).toBeVisible()
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Already have an account? Sign in' }).click()
  await expect(page).toHaveURL(new RegExp(`/login\\?returnTo=%2Fevents%2F${testEventId}$`))
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
  expect(privateRequests).toEqual([])
})

for (const status of [429, 503]) {
  test(`public Events handles ${status} without inventing listings`, async ({ page }) => {
    await page.route('**/api/events**', route => route.fulfill({ status, contentType: 'text/html', body: '<h1>Unavailable</h1>' }))
    await page.goto('/events')
    await expect(page.getByRole('heading', { name: 'Events unavailable' })).toBeVisible()
    await expect(page.locator('.ev-event-card')).toHaveCount(0)
    await page.goto(`/events/${testEventId}`)
    await expect(page.getByRole('alert')).toContainText('Events are unavailable. Try again.')
    await expect(page.getByRole('link', { name: 'Sign up to find company' })).toHaveCount(0)
  })
}

test('public Events has truthful errors, retry, filters, pagination and unavailable detail', async ({ page }) => {
  await page.route('**/api/events**', route => route.fulfill({ status: 401, json: { error: 'Authentication required' } }))
  await page.goto('/events')
  await expect(page.getByRole('heading', { name: 'Events unavailable' })).toBeVisible()
  await expect(page.locator('.ev-event-card')).toHaveCount(0)
  await page.screenshot({ path: `${shots}/events-unavailable.png`, fullPage: true })
  await page.unroute('**/api/events**')
  await mockCurrentEvents(page)
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.locator('.ev-event-card')).toHaveCount(1)
  await page.getByRole('button', { name: 'Outdoors', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'A quiet calendar' })).toBeVisible()
  await page.getByRole('button', { name: 'Show all events' }).click()
  await expect(page.locator('.ev-event-card')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled()
  await page.goto('/events/e0000000-0000-4000-8000-000000000099')
  await expect(page.getByRole('alert')).toContainText('This event is no longer available.')
  await page.getByRole('link', { name: 'Back to events' }).click()
  await expect(page.getByRole('heading', { name: 'Events', exact: true })).toBeVisible()
})

test('root signup CTA, keyboard navigation and reduced motion work without marketing storage', async ({ page }) => {
  await mockMatchingSession(page, false)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('link', { name: 'Skip to content' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('main')).toBeFocused()
  const animated = await page.locator('.public-site *').evaluateAll(elements => elements.some(element => getComputedStyle(element).animationName !== 'none'))
  expect(animated).toBe(false)
  await page.getByRole('main').getByRole('link', { name: 'Get started', exact: true }).click()
  await expect(page).toHaveURL(/\/register\?returnTo=%2F$/)
  await expect(page.getByRole('heading', { name: 'Create an account', exact: true })).toBeVisible()
})

test('signed-in root retains Home, while legal pages bypass failed account loading', async ({ page }) => {
  await mockMatchingSession(page)
  const account = { profile: { username: 'sam', display_name: 'Sam', bio: 'Coffee', birthdate: null, location_city: 'Campus', avatar_url: null, interests: ['Coffee'], availability: [] }, preferences: { intents: ['Friends'], usual: ['Afternoons'], distance: '5 miles', group: 'Either' }, settings: { notifications: true, availability: true, discoverable: true, location: false }, completed: [0, 1, 2, 3] }
  await page.route('**/api/matchmaking/account', route => route.fulfill({ json: account }))
  await page.route('**/api/matchmaking/notifications', route => route.fulfill({ json: { notifications: [], unreadCount: 0 } }))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Who’s around?' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Public navigation' })).toHaveCount(0)
  await mockCurrentEvents(page)
  // Keep the existing account/workspace mounted between signed-in app routes.
  let accountReloads = 0
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/matchmaking/account') accountReloads++ })
  await page.getByRole('link', { name: 'Events', exact: true }).first().click()
  await expect(page.locator('.ev-event-card')).toHaveCount(1)
  await page.getByRole('link', { name: 'Home', exact: true }).first().click()
  await expect(page.getByRole('heading', { name: 'Who’s around?' })).toBeVisible()
  expect(accountReloads).toBe(0)
  await page.route('**/api/matchmaking/account', route => route.fulfill({ status: 503, json: { error: 'Unavailable' } }))
  await page.goto('/privacy')
  await expect(page.getByRole('heading', { name: 'Privacy Policy', exact: true })).toBeVisible()
})
