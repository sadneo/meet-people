import { expect, test } from '@playwright/test'
import { browserProfile, mockMatchingApi, mockMatchingSession } from './matchmaking-fixture'

const path = '/downtime-matchmaking'
  for (const width of [320, 390, 800, 801, 1440]) {
    test(`dating isolated ${path} at ${width}: deep link, keyboard, history, refresh and no matching requests`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 320 ? 568 : 900 })
      await mockMatchingSession(page)
      const requests: { path: string; method: string }[] = []
      await page.route('**/api/matchmaking/**', route => {
        const request = route.request(), endpoint = new URL(request.url()).pathname
        requests.push({ path: endpoint, method: request.method() })
        if (endpoint.endsWith('/account-profile') && request.method() === 'GET') return route.fulfill({ json: { profile: { username: 'fixture', display_name: 'Fixture', bio: null, avatar_url: null } } })
        if (endpoint.endsWith('/profile') && request.method() === 'GET') return route.fulfill({ json: { profile: browserProfile } })
        return route.fulfill({ status: 503, json: { code: 'unavailable', error: 'Should not be called by Dating.' } })
      })
      await page.goto(`${path}?source=home&view=dating`)
      await expect(page.getByRole('heading', { name: 'Dating in your downtime' })).toBeVisible()
      await expect(page.getByRole('status')).toHaveText('Dating backend not connected')
      await expect(page.getByRole('region', { name: 'Dating in your downtime' }).getByRole('button')).toHaveCount(1)
      await expect(page.getByRole('button', { name: 'Find a date in your downtime', exact: true })).toBeDisabled()
      const mascot = page.locator('.dating-mascot .pt-pixel-pebble')
      await expect(mascot).toBeVisible()
      await expect(mascot).toHaveAttribute('data-expression', 'happy')
      await expect(mascot.locator('image')).toHaveCount(1)
      await expect(page.locator('.dating-heart-thought')).toHaveAttribute('aria-hidden', 'true')
      await expect(page.locator('.dating-romantic-card')).toHaveCount(0)
      const mascotBox = (await mascot.boundingBox())!, heartBox = (await page.locator('.dating-heart-thought').boundingBox())!
      expect(heartBox.width).toBeLessThan(mascotBox.width / 3)
      expect(mascotBox.height).toBeGreaterThan(150)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
      expect(requests.length).toBeGreaterThan(0)
      expect(requests.every(request => request.method === 'GET' && /^\/api\/matchmaking\/(account-profile|profile)$/.test(request.path))).toBe(true)
      await page.reload()
      await expect(page.getByRole('link', { name: 'Dating', exact: true })).toHaveAttribute('aria-current', 'page')
      expect(requests.every(request => request.method === 'GET' && /^\/api\/matchmaking\/(account-profile|profile)$/.test(request.path))).toBe(true)
      await page.screenshot({ path: `worktree/downtime-layout/downtime-dating-mascot-${width}.png`, fullPage: true })
      await mockMatchingApi(page)
      const friends = page.getByRole('link', { name: 'Friends', exact: true })
      await friends.focus()
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(`${path}?source=home`)
      await expect(page.getByRole('link', { name: 'Open matchmaking settings', exact: true })).toBeVisible()
      const dating = page.getByRole('link', { name: 'Dating', exact: true })
      await friends.focus()
      await page.keyboard.press('Tab')
      await expect(dating).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(page.getByRole('heading', { name: 'Dating in your downtime' })).toBeFocused()
      await page.goBack()
      await expect(friends).toHaveAttribute('aria-current', 'page')
      await page.goForward()
      await expect(page.getByRole('heading', { name: 'Dating in your downtime' })).toBeVisible()
    })
  }
for (const width of [320, 390, 800, 801, 1440]) {
  test(`main Friends/Dating views at ${width}: selector without Dating backend, queue mutations or automatic results`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 900 })
    await mockMatchingSession(page)
    await mockMatchingApi(page)
    const requests: { path: string; method: string }[] = []
    page.on('request', request => { if (request.url().includes('/api/')) requests.push({ path: new URL(request.url()).pathname, method: request.method() }) })
    for (const query of ['', '?view=dating&source=home']) {
      await page.goto(`/matchmaking${query}`)
      await expect(page.getByRole('navigation', { name: 'Matching views', exact: true })).toHaveCount(1)
      await expect(page.getByRole('link', { name: 'Dating', exact: true })).toBeVisible()
      if (!query) {
        await expect(page.getByRole('button', { name: 'Find Friends', exact: true })).toBeEnabled()
        await expect(page.locator('.dating-view')).toHaveCount(0)
        await expect(page.locator('.match-mascot .pt-pixel-pebble')).toHaveAttribute('data-expression', 'happy')
      } else {
        await expect(page.getByRole('heading', { name: 'Dating in your downtime', exact: true })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Find a date in your downtime', exact: true })).toBeDisabled()
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    }
    await page.reload()
    await expect(page.getByRole('button', { name: 'Find a date in your downtime', exact: true })).toBeDisabled()
    expect(requests.every(request => request.method === 'GET' && !request.path.includes('dating') && !request.path.endsWith('/result') && !request.path.endsWith('/queue'))).toBe(true)
    await page.screenshot({ path: `worktree/downtime-layout/active-friends-only-${width}.png`, fullPage: true })
  })
}
test('downtime Dating preserves an enrolled Friends queue across switching and reload without background requests', async ({ page }) => {
  await mockMatchingSession(page)
  await mockMatchingApi(page)
  let mode: string | null = null
  const writes: string[] = [], reads: string[] = []
  await page.route('**/api/matchmaking/**', route => {
    const request = route.request(), endpoint = new URL(request.url()).pathname
    if (request.method() === 'GET') reads.push(endpoint)
    else writes.push(endpoint)
    if (endpoint.endsWith('/profile')) return route.fulfill({ json: { profile: browserProfile } })
    if (endpoint.endsWith('/account-profile')) return route.fulfill({ json: { profile: { username: browserProfile.username, display_name: browserProfile.display_name, bio: browserProfile.bio, avatar_url: browserProfile.avatar_url } } })
    if (endpoint.endsWith('/notifications')) return route.fulfill({ json: { notifications: [], unreadCount: 0 } })
    if (request.method() === 'POST') mode = request.postDataJSON().mode
    if (request.method() === 'DELETE') mode = null
    return route.fulfill({ json: { mode } })
  })
  await page.goto('/settings')
  const downtime = page.getByRole('switch', { name: 'Allow downtime matching', exact: true })
  await expect(downtime).toBeEnabled(); await downtime.click()
  await expect(downtime).toHaveAttribute('aria-checked', 'true')
  await page.goto('/downtime-matchmaking?view=dating')
  await expect(page.getByRole('status')).toHaveText('Dating backend not connected')
  const previousReads = reads.length
  await page.reload()
  await expect(page.locator('.dating-mascot .pt-pixel-pebble')).toBeVisible()
  expect(reads.slice(previousReads).every(endpoint => /\/(account-profile|profile)$/.test(endpoint))).toBe(true)
  expect(mode).toBe('downtime')
  expect(writes).toEqual(['/api/matchmaking/queue'])
  await page.getByRole('link', { name: 'Friends', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Open matchmaking settings', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Open matchmaking settings', exact: true }).click()
  await expect(downtime).toHaveAttribute('aria-checked', 'true')
  expect(writes).toEqual(['/api/matchmaking/queue'])
  expect(reads.some(endpoint => endpoint.endsWith('/result'))).toBe(false)
})
test('Profile identity writes stay separate from authoritative matching saves and accessible dialog return', async ({ page }) => {
  await mockMatchingSession(page)
  await mockMatchingApi(page)
  let identity = { username: 'sam', display_name: 'Sam', bio: null, avatar_url: null }
  const accountWrites: unknown[] = [], matchingWrites: unknown[] = []
  let finishMatchingSave!: () => void
  const matchingSave = new Promise<void>(resolve => { finishMatchingSave = resolve })
  await page.route('**/api/matchmaking/account-profile', route => {
    if (route.request().method() === 'PUT') { identity = route.request().postDataJSON(); accountWrites.push(identity) }
    return route.fulfill({ json: { profile: identity } })
  })
  await page.route('**/api/matchmaking/profile', async route => {
    if (route.request().method() === 'PUT') {
      matchingWrites.push(route.request().postDataJSON())
      await matchingSave
    }
    return route.fulfill({ json: { profile: route.request().method() === 'PUT' ? route.request().postDataJSON() : browserProfile } })
  })
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Account menu', exact: true }).click()
  await page.locator('.pt-account-options').getByRole('link', { name: 'Profile', exact: true }).click()
  await expect(page).toHaveURL('/profile')
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click()
  await page.getByLabel('Display name', { exact: true }).fill('New Sam')
  await page.getByRole('button', { name: 'Save identity', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'New Sam', exact: true })).toBeVisible()
  expect(accountWrites).toEqual([{ username: 'sam', display_name: 'New Sam', bio: null, avatar_url: null }])
  await page.screenshot({ path: 'worktree/profile-unification/session-profile.png', fullPage: true })
  await page.getByRole('link', { name: 'Matchmaking', exact: true }).click()
  await expect(page).toHaveURL('/matchmaking')
  const preferences = page.getByRole('button', { name: 'Preferences', exact: true })
  const dialog = page.getByRole('dialog', { name: 'Your preferences', exact: true })
  await preferences.click()
  await expect(page.getByText(/Using your saved account identity/)).toBeVisible()
  await expect(page.getByLabel('Username', { exact: true })).toHaveCount(0)
  await expect(dialog.getByLabel('City or campus area', { exact: true })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Music', exact: true }).click()
  await page.screenshot({ path: 'worktree/profile-unification/matching-preferences.png', fullPage: true })
  await dialog.getByRole('button', { name: 'Save preferences', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled()
  await expect(dialog.getByRole('button', { name: 'Close preferences', exact: true })).toBeDisabled()
  await expect(dialog).toBeVisible()
  await expect.poll(() => matchingWrites.length).toBe(1)
  expect(matchingWrites).toEqual([{ ...browserProfile, ...identity, interests: [...browserProfile.interests, 'Music'] }])
  finishMatchingSave()
  await expect(dialog).toHaveCount(0)
  await expect(preferences).toBeFocused()
  await preferences.click()
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(preferences).toBeFocused()
})
test('account browser unavailable blocks private legacy views and never claims canonical persistence', async ({ page }) => {
  await mockMatchingSession(page)
  await mockMatchingApi(page)
  await page.route('**/api/matchmaking/account-profile', route => route.fulfill({ status: 503, json: { code: 'unavailable', error: 'Account RPC not installed.' } }))
  await page.goto('/profile/account')
  await expect(page).toHaveURL('/profile/account')
  await expect(page.getByRole('heading', { name: 'Profile unavailable', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit profile', exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Username')).toHaveCount(0)
  await page.goto('/matchmaking')
  await expect(page.getByRole('heading', { name: 'Profile unavailable', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Preferences', exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Username', { exact: true })).toHaveCount(0)
  await page.screenshot({ path: 'worktree/profile-unification/matching-legacy-compatibility.png', fullPage: true })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('Account profile saved.')).toHaveCount(0)
})
test('mascot browser never mixes expressions across Friends/Dating navigation and reload', async ({ page }) => {
  await mockMatchingSession(page)
  await mockMatchingApi(page)
  await page.route('**/api/matchmaking/status', route => route.fulfill({ json: { mode: 'downtime' } }))
  await page.addInitScript(() => {
    const frames: string[][] = []
    Object.assign(window, { mascotFrames: frames })
    const sample = () => {
      const images = [...document.querySelectorAll('.match-mascot image')]
      frames.push(images.filter(image => Number(getComputedStyle(image).opacity) > 0).map(image => image.getAttribute('href') ?? ''))
      requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })
  await page.goto('/matchmaking')
  await expect(page.locator('.match-mascot svg')).toHaveAttribute('data-expression', 'thinking')
  await page.getByRole('link', { name: 'Dating', exact: true }).click()
  await expect(page.locator('.dating-mascot .pt-pixel-pebble')).toHaveAttribute('data-expression', 'happy')
  await page.getByRole('link', { name: 'Friends', exact: true }).click()
  await expect(page.locator('.match-mascot svg')).toHaveAttribute('data-expression', 'thinking')
  await page.reload()
  await expect(page.locator('.match-mascot svg')).toHaveAttribute('data-expression', 'thinking')
  await expect(page.locator('.match-mascot image')).toHaveCount(1)
  const frames = await page.evaluate(() => (window as unknown as { mascotFrames: string[][] }).mascotFrames)
  expect(frames.some(frame => frame.length === 1)).toBe(true)
  expect(frames.every(frame => frame.length <= 1 && frame.every(href => href.includes('pebble-thinking')))).toBe(true)
})
