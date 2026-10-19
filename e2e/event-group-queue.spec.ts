import { expect, test, type Page } from '@playwright/test'
import { browserAccount, browserProfile, mockMatchingSession } from './matchmaking-fixture'

const id = 'e0000000-0000-4000-8000-000000000001'
const me = 'a0000000-0000-4000-8000-000000000001'
const other = 'a0000000-0000-4000-8000-000000000002'
const event = { id, title: 'Acoustic afternoon', description: 'Campus music.', category: 'Music', starts_at: '2099-10-02T19:00:00Z', ends_at: null, location_name: 'Student Union', address: null, city: null, image_url: null, source: 'sbengaged', source_url: null, status: 'active', distance_miles: null, interested_count: 7 }
const proposal = { id: other, eventId: id, members: [{ id: me, name: 'Sam', avatar: null }, { id: other, name: 'Taylor', avatar: null }] }
const notification = { id: other, eventId: id, proposalId: other, title: 'Group proposal to review', readAt: null as string | null, createdAt: '2026-10-09T01:00:00Z' }
async function fixture(page: Page, signedIn = true) {
  await mockMatchingSession(page, signedIn)
  const state = { queue: 'idle', profile: true, missingRpc: false, failLeave: false, writes: 0, reads: 0, notices: [] as typeof notification[], paths: [] as string[], queueReadGate: null as Promise<void> | null, profileReadGate: null as Promise<void> | null, feedReadGate: null as Promise<void> | null }
  await page.route('**/api/events**', route => {
    const path = new URL(route.request().url()).pathname
    state.paths.push(path)
    if (path === '/api/events') return route.fulfill({ json: { events: [event], categories: ['Music'], page: 1, hasMore: false } })
    expect(path).toBe(`/api/events/${id}`) // No Company reads or writes.
    return route.fulfill({ json: event })
  })
  await page.route('**/api/matchmaking/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    state.paths.push(path)
    expect(request.headers().authorization).toBe('Bearer browser-user-jwt')
    if (path.endsWith('/account')) return route.fulfill({ json: browserAccount() })
    if (path.endsWith('/profile')) { if (state.profileReadGate) await state.profileReadGate; return route.fulfill({ json: { profile: state.profile ? browserProfile : null } }) }
    if (path.endsWith('/notifications') || path.endsWith('/read')) {
      if (request.method() === 'GET' && state.feedReadGate) await state.feedReadGate
      if (path.endsWith('/read')) { state.reads++; state.notices = state.notices.map(item => ({ ...item, readAt: '2026-10-09T02:00:00Z' })) }
      return route.fulfill({ json: { notifications: state.notices, unreadCount: state.notices.filter(item => !item.readAt).length } })
    }
    expect(path).toBe(`/api/matchmaking/events/${id}/group-queue`)
    if (request.method() === 'GET' && state.queueReadGate) await state.queueReadGate
    if (state.missingRpc) return route.fulfill({ status: 503, json: { code: 'unavailable', error: 'Matching RPC is not available yet.' } })
    if (request.method() !== 'GET') {
      state.writes++
      if (request.method() === 'POST') { expect(request.postDataJSON()).toEqual({}); state.queue = 'waiting' }
      if (request.method() === 'DELETE') {
        if (state.failLeave) return route.fulfill({ status: 503, json: { code: 'provider', error: 'Leave failed.' } })
        state.queue = 'idle'
      }
    }
    return route.fulfill({ json: { state: state.queue, proposal: state.queue === 'proposal' ? proposal : null } })
  })
  return state
}
test('mocked event queue persists across reload; no old consent, Company, scoring or group-found claim', async ({ page }) => {
  const state = await fixture(page)
  await page.goto(`/events/${id}`)
  const panel = page.getByRole('region', { name: 'Event group queue' })
  await expect(panel.getByRole('button', { name: 'Find a group to go with', exact: true })).toBeEnabled()
  await expect(page.getByLabel('Email', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Event compatibility', exact: true })).toHaveCount(0)
  await panel.getByRole('button', { name: 'Find a group to go with' }).click()
  await expect(panel.getByRole('button', { name: 'Leave queue' })).toBeEnabled()
  await expect(panel.getByText(/Background processing is not enabled/)).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Review proposal' })).toHaveCount(0)
  await page.reload()
  await expect(panel.getByRole('button', { name: 'Leave queue' })).toBeEnabled()
  state.failLeave = true
  await panel.getByRole('button', { name: 'Leave queue' }).click()
  await expect(panel.getByRole('alert')).toContainText('Leave failed')
  await expect(panel.getByText('You are in this event queue.')).toBeVisible()
  state.failLeave = false
  await panel.getByRole('button', { name: 'Leave queue' }).click()
  await expect(panel.getByText('Not in this event queue.')).toBeVisible()
  expect(state.paths.every(path => !/company|matches|interest|result/.test(path))).toBe(true)
})
test('mocked missing RPC and unsaved profile block enrollment but existing queue can leave', async ({ page }) => {
  const state = await fixture(page)
  state.missingRpc = true
  await page.goto(`/events/${id}`)
  const panel = page.getByRole('region', { name: 'Event group queue' })
  await expect(panel.getByRole('alert')).toContainText('Matching RPC is not available yet')
  await expect(panel.getByRole('button', { name: 'Find a group to go with' })).toBeDisabled()
  state.missingRpc = false; state.profile = false
  await panel.getByRole('button', { name: 'Refresh queue' }).click()
  await expect(panel.getByText('Not in this event queue.')).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Find a group to go with' })).toBeDisabled()
  state.queue = 'waiting'
  await panel.getByRole('button', { name: 'Refresh queue' }).click()
  await expect(panel.getByRole('button', { name: 'Leave queue' })).toBeEnabled()
  await panel.getByRole('button', { name: 'Leave queue' }).click()
  await expect(panel.getByText('Not in this event queue.')).toBeVisible()
  expect(state.writes).toBe(1)
})
for (const width of [390, 1440]) test(`mocked persistent inbox keyboard/read lifecycle and proposal at ${width}px`, async ({ page }) => {
  const state = await fixture(page)
  state.queue = 'proposal'; state.notices = [{ ...notification }]
  await page.setViewportSize({ width, height: 900 })
  await page.goto('/profile')
  const bell = page.getByRole('button', { name: 'Matching notifications, 1 unread', exact: true })
  await expect(bell).toBeVisible()
  await bell.focus(); await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Matching notifications' })
  await expect(dialog).toBeVisible()
  expect(state.reads).toBe(0)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(bell).toBeFocused()
  await bell.click()
  const link = dialog.getByRole('link', { name: 'View proposal' })
  await expect(link).toHaveAttribute('href', `/events/${id}`)
  await link.click()
  await expect(page).toHaveURL(`/events/${id}`)
  await expect(page.getByRole('button', { name: 'Matching notifications, 0 unread', exact: true })).toBeVisible()
  const panel = page.getByRole('region', { name: 'Event group queue' })
  await panel.getByRole('button', { name: 'Review proposal' }).click()
  await expect(panel.getByRole('heading', { name: 'Suggested group · 2 people' })).toBeVisible()
  await expect(panel.getByText('Taylor', { exact: true })).toBeVisible()
  await expect(panel.getByText(/not a confirmed group/)).toBeVisible()
  expect(state.reads).toBe(1)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Matching notifications, 0 unread', exact: true })).toBeVisible()
})
test('signed-out queue goes to central sign-in with encoded canonical event return', async ({ page }) => {
  const state = await fixture(page, false)
  await page.goto(`/events/${id}`)
  await page.getByRole('button', { name: 'Find a group to go with' }).click()
  await expect(page).toHaveURL(`/login?returnTo=${encodeURIComponent(`/events/${id}`)}`)
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible()
  expect(state.paths.some(path => path.startsWith('/api/matchmaking'))).toBe(false)
})
test('signed-in central callback recovers validated return, but never an external destination', async ({ page }) => {
  await fixture(page)
  await page.goto(`/login?returnTo=${encodeURIComponent(`/events/${id}`)}`)
  await expect(page).toHaveURL(`/events/${id}`)
  await expect(page.getByRole('button', { name: 'Find a group to go with' })).toBeEnabled()
  await page.goto('/login?returnTo=%2F%2Fevil.test')
  await expect(page.getByText('You are signed in.')).toBeVisible()
  await expect(page).toHaveURL('/login?returnTo=%2F%2Fevil.test')
})
test('mocked wide event preview mounts the same queue without scoring or enrollment', async ({ page }) => {
  const state = await fixture(page)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/events')
  const panel = page.locator('.ev-event-preview').getByRole('region', { name: 'Event group queue' })
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Find a group to go with' })).toBeEnabled()
  expect(state.writes).toBe(0)
})
test('mocked slow profile never locks Leave; conflicting queue/feed reads visibly disable controls then recover', async ({ page }) => {
  const state = await fixture(page)
  state.queue = 'waiting'; state.notices = [{ ...notification }]
  let releaseProfile!: () => void, releaseQueue!: () => void, releaseFeed!: () => void
  state.profileReadGate = new Promise(resolve => { releaseProfile = resolve })
  await page.goto(`/events/${id}`)
  const panel = page.getByRole('region', { name: 'Event group queue' })
  await expect(panel.getByRole('button', { name: 'Leave queue' })).toBeEnabled()
  await expect(panel.getByRole('button', { name: 'Refresh queue' })).toBeEnabled()
  state.queueReadGate = new Promise(resolve => { releaseQueue = resolve })
  await panel.getByRole('button', { name: 'Refresh queue' }).click()
  await expect(panel.getByRole('button', { name: 'Leave queue' })).toBeDisabled()
  await expect(panel.getByRole('button', { name: 'Refresh queue' })).toBeDisabled()
  state.queueReadGate = null; releaseQueue()
  await expect(panel.getByRole('button', { name: 'Leave queue' })).toBeEnabled()
  await page.getByRole('button', { name: 'Matching notifications, 1 unread', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Matching notifications' })
  state.feedReadGate = new Promise(resolve => { releaseFeed = resolve })
  await dialog.getByRole('button', { name: 'Refresh notifications' }).click()
  await expect(dialog.getByRole('link', { name: 'View proposal' })).toHaveAttribute('aria-disabled', 'true')
  await expect(dialog.getByRole('button', { name: 'Refresh notifications' })).toBeDisabled()
  expect(state.reads).toBe(0)
  state.feedReadGate = null; releaseFeed()
  await expect(dialog.getByRole('link', { name: 'View proposal' })).toHaveAttribute('aria-disabled', 'false')
  await dialog.getByRole('link', { name: 'View proposal' }).click()
  await expect(dialog).toHaveCount(0)
  await panel.getByRole('button', { name: 'Leave queue' }).click()
  await expect(panel.getByText('Not in this event queue.')).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Find a group to go with' })).toBeDisabled()
  state.profileReadGate = null; releaseProfile()
  await expect(panel.getByRole('button', { name: 'Find a group to go with' })).toBeEnabled()
  expect(state.reads).toBe(1)
  expect(state.writes).toBe(1)
  expect(state.paths.every(path => !/company|matches|interest|result/.test(path))).toBe(true)
})
