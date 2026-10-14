import { expect, test } from '@playwright/test'
import { browserProfile, mockMatchingApi, mockMatchingSession } from './matchmaking-fixture'

const path = '/downtime-matchmaking'
  for (const width of [320, 390, 800, 801, 1440]) {
    test(`dating isolated ${path} at ${width}: deep link, keyboard, history, refresh and no matching requests`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 320 ? 568 : 900 })
      await mockMatchingSession(page)
      const requests: string[] = []
      await page.route('**/api/matchmaking/**', route => { requests.push(route.request().url()); return route.fulfill({ status: 503, json: { code: 'unavailable', error: 'Should not be called by Dating.' } }) })
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
      expect(requests).toEqual([])
      await page.reload()
      await expect(page.getByRole('link', { name: 'Dating', exact: true })).toHaveAttribute('aria-current', 'page')
      expect(requests).toEqual([])
      await page.screenshot({ path: `/tmp/opencode/downtime-dating-mascot-${width}.png`, fullPage: true })
      await mockMatchingApi(page)
      const friends = page.getByRole('link', { name: 'Friends', exact: true })
      await friends.focus()
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(`${path}?source=home`)
      await expect(page.getByRole('button', { name: 'Turn on downtime matching', exact: true })).toBeEnabled()
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
  test(`active Friends only query fallback at ${width}: no toggle, Dating requests, queue mutations or automatic results`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 900 })
    await mockMatchingSession(page)
    await mockMatchingApi(page)
    const requests: { path: string; method: string }[] = []
    page.on('request', request => { if (request.url().includes('/api/')) requests.push({ path: new URL(request.url()).pathname, method: request.method() }) })
    for (const query of ['', '?view=dating&source=home']) {
      await page.goto(`/matchmaking${query}`)
      await expect(page.getByRole('button', { name: 'Start matching', exact: true })).toBeEnabled()
      await expect(page.getByRole('navigation', { name: 'Matching views', exact: true })).toHaveCount(0)
      await expect(page.getByRole('link', { name: 'Dating', exact: true })).toHaveCount(0)
      await expect(page.locator('.dating-view')).toHaveCount(0)
      await expect(page.locator('.match-mascot .pt-pixel-pebble')).toHaveAttribute('data-expression', 'happy')
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    }
    await page.reload()
    await expect(page.getByRole('button', { name: 'Start matching', exact: true })).toBeEnabled()
    expect(requests.every(request => request.method === 'GET' && !request.path.includes('dating') && !request.path.endsWith('/result') && !request.path.endsWith('/queue'))).toBe(true)
    await page.screenshot({ path: `/tmp/opencode/active-friends-only-${width}.png`, fullPage: true })
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
    if (endpoint.endsWith('/notifications')) return route.fulfill({ json: { notifications: [], unreadCount: 0 } })
    if (request.method() === 'POST') mode = request.postDataJSON().mode
    if (request.method() === 'DELETE') mode = null
    return route.fulfill({ json: { mode } })
  })
  await page.goto('/downtime-matchmaking')
  await page.getByRole('button', { name: 'Turn on downtime matching', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Pause downtime matching', exact: true })).toBeEnabled()
  await page.getByRole('link', { name: 'Dating', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Dating backend not connected')
  const previousReads = reads.length
  await page.reload()
  await expect(page.locator('.dating-mascot .pt-pixel-pebble')).toBeVisible()
  expect(reads).toHaveLength(previousReads)
  expect(mode).toBe('downtime')
  expect(writes).toEqual(['/api/matchmaking/queue'])
  await page.getByRole('link', { name: 'Friends', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Pause downtime matching', exact: true })).toBeEnabled()
  expect(writes).toEqual(['/api/matchmaking/queue'])
  expect(reads.some(endpoint => endpoint.endsWith('/result'))).toBe(false)
})
test('account browser canonical save, separated matching adapter and accessible dialog return', async ({ page }) => {
  await mockMatchingSession(page)
  await mockMatchingApi(page)
  const identity = { username: 'sam', display_name: 'Sam', bio: null, avatar_url: null }
  const accountWrites: unknown[] = [], matchingWrites: unknown[] = []
  let finishMatchingSave!: () => void
  const matchingSave = new Promise<void>(resolve => { finishMatchingSave = resolve })
  await page.route('**/api/matchmaking/account-profile', route => {
    if (route.request().method() === 'PUT') accountWrites.push(route.request().postDataJSON())
    return route.fulfill({ json: { profile: route.request().method() === 'PUT' ? route.request().postDataJSON() : identity } })
  })
  await page.route('**/api/matchmaking/profile', async route => {
    if (route.request().method() === 'PUT') {
      matchingWrites.push(route.request().postDataJSON())
      await matchingSave
    }
    return route.fulfill({ json: { profile: route.request().method() === 'PUT' ? route.request().postDataJSON() : browserProfile } })
  })
  await page.goto('/settings')
  await page.getByRole('link', { name: 'Account profile', exact: true }).click()
  await expect(page).toHaveURL('/profile/account')
  await expect(page.getByRole('heading', { name: 'Account profile', exact: true })).toBeFocused()
  await page.getByLabel('Display name', { exact: true }).fill('New Sam')
  await page.getByRole('button', { name: 'Save account profile' }).click()
  await expect(page.getByRole('status')).toHaveText('Account profile saved.')
  expect(accountWrites).toEqual([{ ...identity, display_name: 'New Sam' }])
  await page.screenshot({ path: '/tmp/opencode/account-profile.png', fullPage: true })
  await page.getByRole('link', { name: 'Matching preferences', exact: true }).click()
  await expect(page).toHaveURL('/matchmaking')
  const preferences = page.getByRole('button', { name: 'Preferences', exact: true })
  const dialog = page.getByRole('dialog', { name: 'Your preferences', exact: true })
  await preferences.click()
  await expect(page.getByText('Identity comes from your account profile.')).toBeVisible()
  await expect(page.getByLabel('Username', { exact: true })).toHaveCount(0)
  await dialog.getByLabel('City or campus area', { exact: true }).fill('Campus')
  await page.screenshot({ path: '/tmp/opencode/matching-canonical-preferences.png', fullPage: true })
  await dialog.getByRole('button', { name: 'Save preferences', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled()
  await expect(dialog.getByRole('button', { name: 'Close preferences', exact: true })).toBeDisabled()
  await expect(dialog).toBeVisible()
  await expect.poll(() => matchingWrites.length).toBe(1)
  expect(matchingWrites).toEqual([{ ...browserProfile, ...identity, location_city: 'Campus' }])
  finishMatchingSave()
  await expect(dialog).toHaveCount(0)
  await expect(preferences).toBeFocused()
  await preferences.click()
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(preferences).toBeFocused()
})
test('account browser unavailable and legacy compatibility never claim canonical persistence', async ({ page }) => {
  await mockMatchingSession(page)
  await mockMatchingApi(page)
  await page.route('**/api/matchmaking/account-profile', route => route.fulfill({ status: 503, json: { code: 'unavailable', error: 'Account RPC not installed.' } }))
  await page.goto('/profile/account')
  await expect(page.getByRole('alert')).toContainText('Account profile unavailable')
  await expect(page.getByLabel('Username')).toHaveCount(0)
  await page.goto('/matchmaking')
  await page.getByRole('button', { name: 'Preferences', exact: true }).click()
  await expect(page.getByText(/Account profile separation unavailable/)).toBeVisible()
  await expect(page.getByLabel('Username', { exact: true })).toHaveValue('sam')
  await page.screenshot({ path: '/tmp/opencode/matching-legacy-compatibility.png', fullPage: true })
  await page.getByRole('button', { name: 'Save preferences' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('Account profile saved.')).toHaveCount(0)
})
test('mascot browser never mixes expressions across active/downtime navigation and reload', async ({ page }) => {
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
  await page.getByRole('link', { name: 'Downtime matchmaking', exact: true }).click()
  await expect(page.locator('.match-mascot svg')).toHaveAttribute('data-expression', 'thinking')
  await page.reload()
  await expect(page.locator('.match-mascot svg')).toHaveAttribute('data-expression', 'thinking')
  await expect(page.locator('.match-mascot image')).toHaveCount(1)
  const frames = await page.evaluate(() => (window as unknown as { mascotFrames: string[][] }).mascotFrames)
  expect(frames.some(frame => frame.length === 1)).toBe(true)
  expect(frames.every(frame => frame.length <= 1 && frame.every(href => href.includes('pebble-thinking')))).toBe(true)
})
