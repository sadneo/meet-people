import { expect, test, type Page } from '@playwright/test'
import { browserAccount, mockMatchingSession } from './matchmaking-fixture'
import { sharedProfileFixture } from './shared-profile-fixture'
import { chooseDistanceAndGroup, saveInterestChapter, saveSocialChapter } from './onboarding-fixture'
import { emptyAccount, type Account } from '../../shared/account'

const privatePaths = ['/home', '/events?source=access#anchor', '/community', '/prototype/yzcommunity', '/messages/chat', '/profile', '/settings', '/matchmaking?view=dating', '/downtime-matchmaking', '/intro', '/onboarding?returnTo=%2Fevents', '/free-time/plan', '/unknown?source=access#anchor']
for (const path of privatePaths) test(`signed-out app denial ${path} without private requests/context`, async ({ page }) => {
  const requests: string[] = []
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin !== 'http://127.0.0.1:3194') return route.abort()
    if (url.pathname.startsWith('/api/')) { requests.push(url.pathname); return route.fulfill({ status: 503, json: { error: 'Unexpected private request', code: 'unavailable' } }) }
    return route.continue()
  })
  await mockMatchingSession(page, false)
  await page.goto(path)
  await expect(page).toHaveURL(`/login?${new URLSearchParams({ returnTo: path.startsWith('/onboarding') ? '/events' : path })}`)
  await expect(page.getByRole('heading', { name: 'Welcome to Pebble', exact: true })).toBeVisible()
  await expect(page.locator('.pt-app, .pt-desktop-nav, .pt-bottom-nav')).toHaveCount(0)
  expect(requests).toEqual([])
  expect(await page.evaluate(() => localStorage.length)).toBe(0)
})

// Entirely test-supplied SDK module, not a production route bypass or auth flag.
async function mockHydratingSession(page: Page) {
  await page.route('**/src/supabase.ts', route => route.fulfill({ contentType: 'application/javascript', body: `
    let session = null, hydrated = false; const listeners = new Set();
    window.addEventListener('fixture:session', event => { hydrated = true; session = event.detail; for (const callback of listeners) callback(session ? 'SIGNED_IN' : 'SIGNED_OUT', session); });
    export const supabase = { auth: {
      onAuthStateChange(callback) { listeners.add(callback); if (hydrated) queueMicrotask(() => { if (listeners.has(callback)) callback('INITIAL_SESSION', session); }); return { data: { subscription: { unsubscribe() { listeners.delete(callback); } } } }; },
      signOut: async () => { session = null; for (const callback of listeners) callback('SIGNED_OUT', null); return { error: null }; }
    } };
  ` }))
}

test('hydration and canonical read both hold private mounts; expiry removes access immediately', async ({ page }) => {
  const requests: { path: string; method: string }[] = []
  let finish!: () => void
  const pending = new Promise<void>(resolve => { finish = resolve })
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin !== 'http://127.0.0.1:3194') return route.abort()
    if (url.pathname.startsWith('/api/')) {
      requests.push({ path: url.pathname, method: route.request().method() })
      if (url.pathname.endsWith('/account')) { await pending; return route.fulfill({ json: browserAccount() }) }
      return route.fulfill({ json: { notifications: [], unreadCount: 0 } })
    }
    return route.continue()
  })
  await mockHydratingSession(page)
  await page.goto('/')
  await expect(page.getByText('Loading session…')).toBeVisible()
  expect(requests).toEqual([])
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('fixture:session', { detail: { access_token: 'fixture-token', user: { id: 'fixture-owner' } } })))
  await expect(page.getByText('Checking your profile…')).toBeVisible()
  await expect(page.locator('.pt-app')).toHaveCount(0)
  expect(requests.length).toBeGreaterThan(0)
  expect(requests.every(request => request.path === '/api/matchmaking/account' && request.method === 'GET')).toBe(true)
  finish()
  await expect(page.getByRole('heading', { name: 'Who’s around?', exact: true })).toBeVisible()
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('fixture:session', { detail: null })))
  await expect(page).toHaveURL('/login?returnTo=%2F')
  await expect(page.locator('.pt-app')).toHaveCount(0)
})

for (const width of [320, 1440]) test(`required four-chapter completion ${width}, safe return and no compatibility-profile/queue writes`, async ({ page }) => {
  const fixture = await sharedProfileFixture(page, { identity: 'missing', missingProfile: true })
  await page.setViewportSize({ width, height: width === 320 ? 568 : 900 })
  await page.goto('/?source=gate#anchor')
  await expect(page.getByRole('heading', { name: 'Complete onboarding', exact: true })).toBeVisible()
  const root = page.locator('.pt-access-root')
  await expect(root).toHaveCSS('animation-name', 'none')
  await expect(root).toHaveCSS('opacity', '1')
  const heading = page.getByRole('heading', { name: 'Complete onboarding', exact: true })
  const typography = await heading.evaluate(element => {
    const style = getComputedStyle(element)
    return { fontSize: Number.parseFloat(style.fontSize), lineHeight: Number.parseFloat(style.lineHeight) }
  })
  expect(typography.fontSize).toBeCloseTo(Math.max(25, Math.min(width * .03, 30)), 1)
  expect(typography.lineHeight).toBeCloseTo(typography.fontSize * 1.2, 1)
  await expect(page.locator('.pt-app')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Username', { exact: true })).toHaveValue('')
  await page.getByLabel('Username', { exact: true }).fill('explicit-gate-fixture')
  await page.getByLabel('Display name', { exact: true }).fill('Explicit gate fixture')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
  await expect(root).toHaveCSS('opacity', '1')
  await page.screenshot({ path: `worktree/app-access/completion-${width}.png`, fullPage: true })
  await page.getByRole('button', { name: 'Save identity and continue', exact: true }).click()
  await expect(page.locator('.pt-app')).toHaveCount(0)
  await saveInterestChapter(page); await saveSocialChapter(page)
  const finish = page.getByRole('button', { name: 'Finish onboarding', exact: true })
  await expect(finish).toBeEnabled()
  await chooseDistanceAndGroup(page)
  await page.getByLabel('Birthdate', { exact: true }).fill('2001-02-03')
  await page.getByLabel('City or campus area').fill('Explicit onboarding campus')
  await page.getByRole('button', { name: 'Sunday late, not available', exact: true }).click()
  await finish.click()
  await expect(page).toHaveURL('/?source=gate#anchor')
  await expect(page.getByRole('heading', { name: 'Who’s around?', exact: true })).toBeVisible()
  expect(fixture.calls.filter(call => call.method !== 'GET').map(call => call.path)).toEqual(Array(4).fill('/api/matchmaking/account'))
  expect((fixture.calls.filter(call => call.method === 'PUT')[0].body as Account).profile).toEqual({ username: 'explicit-gate-fixture', display_name: 'Explicit gate fixture', bio: null, avatar_url: null, birthdate: null, location_city: null, interests: [], availability: [] })
  expect(fixture.unified().completed).toEqual([0, 1, 2, 3])
  expect(fixture.profile()).toMatchObject({ interests: ['Music', 'Coffee', 'Art'], birthdate: '2001-02-03', location_city: 'Explicit onboarding campus', availability: [{ dow: 0, start_time: '21:00:00', end_time: '24:00:00' }] })
  expect(fixture.calls.some(call => /\/(queue|result)$/.test(call.path))).toBe(false)
  expect(fixture.external).toEqual([])
})

test('canonical service failure blocks app, keeps session classification, retry does not write', async ({ page }) => {
  const fixture = await sharedProfileFixture(page, { identity: 'unavailable' })
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Profile unavailable', exact: true })).toBeVisible()
  await expect(page).toHaveURL('/settings')
  await expect(page.locator('.pt-app')).toHaveCount(0)
  await page.getByRole('button', { name: 'Retry account', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Profile unavailable', exact: true })).toBeVisible()
  expect(fixture.calls.every(call => call.method === 'GET' && call.path === '/api/matchmaking/account')).toBe(true)
})

test('direct signed-in completion refresh retains its validated destination without creating any record', async ({ page }) => {
  const fixture = await sharedProfileFixture(page, { identity: 'missing', missingProfile: true })
  const path = `/onboarding?${new URLSearchParams({ returnTo: '/?source=refresh#anchor' })}`
  await page.goto(path)
  await expect(page.getByRole('heading', { name: 'Complete onboarding', exact: true })).toBeVisible()
  await page.reload()
  await expect(page).toHaveURL(path)
  await expect(page.getByLabel('Username', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('Display name', { exact: true })).toHaveValue('')
  await expect(page.locator('.pt-app')).toHaveCount(0)
  expect(fixture.calls.length).toBeGreaterThan(0)
  expect(fixture.calls.every(call => call.method === 'GET' && call.path === '/api/matchmaking/account')).toBe(true)
  expect(fixture.account()).toBeNull()
  expect(fixture.profile()).toBeNull()
})

for (const outcome of ['save-failure', 'readback-null', 'readback-failure'] as const) {
  test(`required completion ${outcome} stays blocked with draft; explicit GET retry reconciles without another write`, async ({ page }) => {
    const fixture = await sharedProfileFixture(page, { identity: 'missing', missingProfile: true })
    const account = { username: 'failure-fixture', display_name: 'Failure fixture', bio: null, avatar_url: null }
    let attempted = false, reconciled = false
    let stored: Account = structuredClone(emptyAccount)
    const calls: { method: string; body: unknown }[] = []
    await page.route('**/api/matchmaking/account', route => {
      const request = route.request(), method = request.method()
      calls.push({ method, body: method === 'PUT' ? request.postDataJSON() : null })
      if (method === 'PUT') {
        attempted = true
        stored = request.postDataJSON()
        return outcome === 'save-failure' ? route.fulfill({ status: 503, json: { code: 'provider', error: 'Fixture write outcome uncertain.' } }) : route.fulfill({ json: stored })
      }
      if (reconciled) return route.fulfill({ json: stored })
      if (attempted && outcome === 'readback-failure') return route.fulfill({ status: 503, json: { code: 'unavailable', error: 'Fixture readback unavailable.' } })
      return route.fulfill({ json: emptyAccount })
    })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Complete onboarding', exact: true })).toBeVisible()
    await page.getByLabel('Username', { exact: true }).fill(account.username)
    await page.getByLabel('Display name', { exact: true }).fill(account.display_name)
    await page.getByRole('button', { name: 'Save identity and continue', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Account save could not be confirmed')
    await expect(page.locator('.pt-app')).toHaveCount(0)
    await expect(page.getByLabel('Username', { exact: true })).toHaveValue(account.username)
    await expect(page.getByLabel('Display name', { exact: true })).toHaveValue(account.display_name)
    await expect(page.getByRole('button', { name: 'Save identity and continue', exact: true })).toBeDisabled()
    expect(calls.filter(call => call.method === 'PUT')).toHaveLength(1)
    expect((calls.find(call => call.method === 'PUT')!.body as Account).profile).toMatchObject(account)
    reconciled = true
    await page.getByRole('button', { name: 'Retry account', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Interests', level: 2, exact: true })).toBeVisible()
    await expect(page.locator('.pt-app')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Save interests and continue', exact: true })).toBeEnabled()
    expect(calls.filter(call => call.method === 'PUT')).toHaveLength(1)
    expect(fixture.calls.some(call => call.method !== 'GET' || /\/(queue|result)$/.test(call.path))).toBe(false)
    expect(fixture.external).toEqual([])
  })
}
