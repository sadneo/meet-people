import { expect, test } from '@playwright/test'
import { conversationId, wiringFixture } from './wiring-fixture'

function gate() {
  let release!: () => void
  const promise = new Promise<void>(resolve => { release = resolve })
  return { promise, release }
}

test('mobile has a real pre-JavaScript startup fallback with no forced display duration', async ({ page }) => {
  const scripts = gate()
  await page.route('**/src/mobile/main.tsx*', async route => { await scripts.promise; await route.continue() })
  try {
    await page.goto('/', { waitUntil: 'commit' })
    await expect(page.getByLabel('Pebble loading screen')).toBeVisible()
    await expect(page.getByText('Loading your little world')).toBeVisible()
    await expect(page.locator('.boot-recovery')).toBeHidden()
    await page.locator('.boot-recovery').evaluate(element => element.getAnimations().forEach(animation => animation.finish()))
    await expect(page.getByRole('link', { name: 'Reload Pebble' })).toBeVisible()
    scripts.release()
    await expect(page.getByRole('button', { name: 'Continue with email' })).toBeVisible()
    await expect(page.locator('.pebble-boot')).toHaveCount(0)
  } finally { scripts.release() }
})

test('account initialization uses branded startup, then page navigation uses skeletons and keeps the shell', async ({ page }) => {
  const account = gate(), events = gate()
  await wiringFixture(page)
  await page.route('**/api/matchmaking/account', async route => { await account.promise; await route.fallback() })
  await page.route('**/api/events?**', async route => { await events.promise; await route.fallback() })
  try {
    await page.goto('/profile')
    await expect(page.getByLabel('Pebble loading screen')).toBeVisible()
    account.release()
    await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible()
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Events', exact: true }).click()
    await expect(page.locator('[data-skeleton=events]')).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
    await expect(page.locator('.pebble-boot')).toHaveCount(0)
    events.release()
    await expect(page.locator('.event-card').first()).toBeVisible()
    await expect(page.locator('[data-skeleton=events]')).toHaveCount(0)
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Profile', exact: true }).click()
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Events', exact: true }).click()
    await expect(page.locator('.event-card').first()).toBeVisible()
    await expect(page.locator('[data-skeleton=events]')).toHaveCount(0)
  } finally { account.release(); events.release() }
})

test('a failed account read exposes recovery rather than an endless startup animation', async ({ page }) => {
  await wiringFixture(page)
  await page.route('**/api/matchmaking/account', route => route.fulfill({ status: 503, json: { code: 'provider', error: 'Unavailable' } }))
  await page.goto('/events')
  await expect(page.getByRole('alert')).toContainText('Your saved account could not be read')
  await expect(page.getByRole('button', { name: 'Reload saved data' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible()
  await expect(page.locator('.pebble-boot')).toHaveCount(0)
})

test('leaving a pending destination cannot reveal its skeleton or data over the new view', async ({ page }) => {
  const events = gate()
  await wiringFixture(page)
  await page.route('**/api/events?**', async route => { await events.promise; await route.fallback() })
  try {
    await page.goto('/events')
    await expect(page.locator('[data-skeleton=events]')).toBeVisible()
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Profile', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible()
    events.release()
    await expect(page.locator('[data-skeleton=events]')).toHaveCount(0)
    await expect(page.locator('.event-card')).toHaveCount(0)
    await expect(page.locator('.pebble-boot')).toHaveCount(0)
  } finally { events.release() }
})

test('event read errors replace skeletons with explicit recovery', async ({ page }) => {
  const events = gate()
  await wiringFixture(page)
  await page.route('**/api/events?**', async route => { await events.promise; await route.fulfill({ status: 503, json: { error: 'Events temporarily unavailable.' } }) })
  try {
    await page.goto('/events')
    await expect(page.locator('[data-skeleton=events]')).toBeVisible()
    events.release()
    await expect(page.getByRole('alert')).toContainText('Events temporarily unavailable')
    await expect(page.locator('[data-skeleton=events]')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Reload saved data' })).toBeVisible()
  } finally { events.release() }
})

test('conversation skeleton never grants send permission while history is unresolved', async ({ page }) => {
  const history = gate()
  await wiringFixture(page)
  await page.route(`**/api/conversations/${conversationId}/messages*`, async route => { await history.promise; await route.fallback() })
  try {
    await page.goto(`/messages/chat?conversation=${conversationId}`)
    await expect(page.locator('[data-skeleton=chat]')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled()
    history.release()
    await expect(page.getByRole('log', { name: 'Message history' }).getByText('A real saved hello')).toBeVisible()
    await expect(page.locator('[data-skeleton=chat]')).toHaveCount(0)
  } finally { history.release() }
})

test('Garden waits for required artwork and its first frame, without replacing navigation', async ({ page }) => {
  const art = gate()
  await wiringFixture(page)
  await page.route('**/garden/legacy-garden/village-empty.png', async route => { await art.promise; await route.continue() })
  try {
    await page.goto('/')
    await expect(page.locator('[data-skeleton=garden]')).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open Garden inventory' })).toBeDisabled()
    art.release()
    await expect(page.locator('[data-skeleton=garden]')).toHaveCount(0)
    await expect(page.locator('.garden-canvas')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open Garden inventory' })).toBeEnabled()
  } finally { art.release() }
})

test('Garden artwork failure replaces its skeleton with an explicit asset-only retry', async ({ page }) => {
  await wiringFixture(page)
  let fail = true
  await page.route('**/garden/legacy-garden/village-empty.png', route => fail ? route.abort() : route.continue())
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('Garden artwork could not load')
  await expect(page.locator('[data-skeleton=garden]')).toHaveCount(0)
  fail = false
  await page.getByRole('button', { name: 'Retry Garden artwork' }).click()
  await expect(page.locator('.garden-canvas')).toBeVisible()
})

test('pending image regions do not hide loaded event text and failure falls back locally', async ({ page }) => {
  const image = gate()
  await wiringFixture(page)
  await page.route('**/images/event-placeholder.svg', async route => { await image.promise; await route.abort() })
  try {
    await page.goto('/events')
    await expect(page.locator('.event-card h3').first()).toBeVisible()
    await expect(page.locator('.event-image[data-media-pending]').first()).toBeVisible()
    await expect(page.locator('[data-skeleton=events]')).toHaveCount(0)
    image.release()
    await expect(page.locator('.event-image[data-media-pending]')).toHaveCount(0)
    await expect(page.locator('.event-card h3').first()).toBeVisible()
  } finally { image.release() }
})

test('reduced motion stops startup and skeleton animation without changing loading decisions', async ({ page }) => {
  const account = gate()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await wiringFixture(page)
  await page.route('**/api/matchmaking/account', async route => { await account.promise; await route.fallback() })
  try {
    await page.goto('/events')
    await expect(page.locator('.pebble-boot')).toBeVisible()
    expect(await page.locator('.boot-roller').evaluate(element => getComputedStyle(element).animationName)).toBe('none')
    // Only the delayed recovery visibility timer may remain; mascot/clouds are static.
    expect(await page.locator('.boot-cloud').first().evaluate(element => getComputedStyle(element).animationName)).toBe('none')
  } finally { account.release() }
})
