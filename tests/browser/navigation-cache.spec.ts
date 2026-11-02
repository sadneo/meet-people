import { expect, test } from '@playwright/test'
import { conversationId, peer, wiringFixture } from './wiring-fixture'

test('tab navigation reuses the account loader and recent event and inbox reads', async ({ page }) => {
  const fixture = await wiringFixture(page)
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Main navigation' })
  await expect.poll(() => fixture.calls.some(call => call.path === '/api/events')).toBe(true)
  await expect.poll(() => fixture.calls.some(call => call.path === '/api/conversations')).toBe(true)
  await nav.getByRole('link', { name: 'Events', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Campus coffee walk', exact: true })).toBeVisible()
  await nav.getByRole('link', { name: /^Messages/ }).click()
  await expect(page.getByText('Taylor', { exact: true })).toBeVisible()
  await nav.getByRole('link', { name: 'Garden', exact: true }).click()
  const accountReads = fixture.calls.filter(call => call.path === '/api/matchmaking/account').length
  const eventReads = fixture.calls.filter(call => call.path === '/api/events').length
  const inboxReads = fixture.calls.filter(call => call.path === '/api/conversations').length
  await nav.getByRole('link', { name: 'Events', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Campus coffee walk', exact: true })).toBeVisible()
  await nav.getByRole('link', { name: /^Messages/ }).click()
  await expect(page.getByText('Taylor', { exact: true })).toBeVisible()
  expect(fixture.calls.filter(call => call.path === '/api/matchmaking/account')).toHaveLength(accountReads)
  expect(fixture.calls.filter(call => call.path === '/api/events')).toHaveLength(eventReads)
  expect(fixture.calls.filter(call => call.path === '/api/conversations')).toHaveLength(inboxReads)
})

test('stale events stay visible while a deliberately held background refresh updates them', async ({ page }) => {
  await wiringFixture(page)
  const now = Date.now()
  await page.clock.install({ time: now })
  await page.goto('/events')
  await expect(page.getByRole('heading', { name: 'Campus coffee walk', exact: true })).toBeVisible()
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Profile', exact: true }).click()
  let release: () => void = () => {}, started = false
  const held = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/events?**', async route => {
    started = true
    await held
    // Pass through to the fixture after the simulated slow network finishes.
    await route.fallback()
  })
  await page.clock.setFixedTime(now + 31_000)
  try {
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Events', exact: true }).click()
    await expect.poll(() => started).toBe(true)
    await expect(page.getByRole('heading', { name: 'Campus coffee walk', exact: true })).toBeVisible()
    await expect(page.getByText('Loading…', { exact: true })).toHaveCount(0)
  } finally { release() }
})

test('cached request lists stay visible but actions wait for the current connection read', async ({ page }) => {
  await wiringFixture(page)
  let hold = false, release: () => void = () => {}, reads = 0, writes = 0
  const held = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/connections', async route => {
    reads++
    if (hold) await held
    return route.fulfill({ json: { incoming: [{ id: peer, display_name: 'Taylor', avatar_url: null, mode: 'friends', requested_at: new Date().toISOString() }], sent: [], connected: [] } })
  })
  await page.route(`**/api/matchmaking/friends/requests/${peer}/accept`, route => { writes++; return route.fulfill({ json: { status: 'connected', conversationId } }) })
  await page.goto('/activity')
  await expect(page.getByRole('button', { name: 'Accept', exact: true })).toBeEnabled()
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Events', exact: true }).click()
  const before = reads; hold = true
  try {
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Activity', exact: true }).click()
    await expect.poll(() => reads > before).toBe(true)
    await expect(page.getByText('Taylor', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Accept', exact: true })).toBeDisabled()
    expect(writes).toBe(0)
  } finally { release() }
  await expect(page.getByRole('button', { name: 'Accept', exact: true })).toBeEnabled()
})

test('cached chat history displays immediately but sending waits for fresh permissions', async ({ page }) => {
  const fixture = await wiringFixture(page)
  await page.goto(`/messages/chat?conversation=${conversationId}`)
  await expect(page.getByLabel('Message', { exact: true })).toBeEnabled()
  const text = await page.getByLabel('Message history').locator('.live-message p').first().textContent()
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Events', exact: true }).click()
  let release: () => void = () => {}, started = false
  const held = new Promise<void>(resolve => { release = resolve })
  await page.route(`**/api/conversations/${conversationId}/messages`, async route => { started = true; await held; return route.fallback() })
  try {
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: /^Messages/ }).click()
    await page.locator('.conversation-row').first().click()
    await expect.poll(() => started).toBe(true)
    await expect(page.getByLabel('Message history').getByText(text!, { exact: true })).toBeVisible()
    const composer = page.getByLabel('Message', { exact: true })
    await expect(composer).toBeEnabled()
    await composer.fill('Draft while permissions refresh')
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled()
    await composer.press('Enter')
    expect(fixture.calls.filter(call => call.path.endsWith('/messages') && call.method === 'POST')).toHaveLength(0)
  } finally { release() }
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeEnabled()
  await expect(page.getByLabel('Message', { exact: true })).toHaveValue('Draft while permissions refresh')
})

test('sign-out clears private reads before signing into the account again', async ({ page }) => {
  await wiringFixture(page)
  await page.goto('/messages')
  await expect(page.getByText('Taylor', { exact: true })).toBeVisible()
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Profile', exact: true }).click()
  await page.locator('.pagehead').getByRole('link', { name: 'Settings', exact: true }).click()
  await page.getByRole('link', { name: 'Sign out of Pebble', exact: true }).click()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  let release: () => void = () => {}, started = false
  const held = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/conversations?page=1', async route => { started = true; await held; return route.fallback() })
  try {
    await page.getByLabel('Email', { exact: true }).fill('development-fixture@example.test')
    await page.getByRole('button', { name: 'Continue with email', exact: true }).click()
    await page.getByLabel('Password', { exact: true }).fill('Synthetic-fixture-password-1!')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    const nav = page.getByRole('navigation', { name: 'Main navigation' })
    await nav.getByRole('link', { name: /^Messages/ }).click()
    await expect.poll(() => started).toBe(true)
    await expect(page.getByText('Taylor', { exact: true })).toHaveCount(0)
  } finally { release() }
  await expect(page.getByText('Taylor', { exact: true })).toBeVisible()
})
