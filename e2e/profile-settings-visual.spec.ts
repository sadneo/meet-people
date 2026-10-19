import { expect, test } from '@playwright/test'
import { sharedProfileFixture } from './shared-profile-fixture'

const evidence = 'worktree/profile-comparison-correction'
for (const [width, height] of [[320, 568], [375, 812], [390, 844], [390, 420], [430, 932], [700, 900], [701, 900], [760, 1440], [800, 900], [801, 900], [1440, 900]]) {
  test(`Profile handoff ${width}x${height}: real account, navigation and responsive viewports`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const fixture = await sharedProfileFixture(page)
    await page.goto('/profile')
    await expect(page.getByRole('heading', { name: 'Canonical Sam', exact: true })).toBeVisible()
    const profile = page.locator('.account-profile-page')
    for (const image of await profile.locator('img').all()) await image.evaluate(element => (element as HTMLImageElement).decode())
    await expect(profile.getByRole('table', { name: 'Weekly availability', exact: true }).getByRole('button')).toHaveCount(28)
    await expect(profile.getByRole('button', { name: 'Tuesday morning, partially available' })).toHaveAttribute('aria-pressed', 'mixed')
    await expect(profile.getByRole('img', { name: 'Profile picture not set' })).toBeVisible()
    await expect(profile).not.toContainText('2000-01-01')
    await expect(page.getByRole('tab')).toHaveCount(0)
    await expect(profile.getByRole('link', { name: 'Settings', exact: true })).toHaveCount(0)
    const facts = (await profile.locator('.account-facts').boundingBox())!
    const interests = (await profile.locator('.account-usual-interests').boundingBox())!
    if (width > 700) {
      expect(Math.abs(facts.y - interests.y)).toBeLessThan(1)
      expect(interests.x).toBeGreaterThan(facts.x + facts.width)
      await expect(profile.locator('.account-reward-art')).toHaveCSS('width', '132px')
      await expect(profile.locator('.account-plan-empty > img')).toHaveCSS('width', '82px')
    } else expect(interests.y).toBeGreaterThan(facts.y + facts.height)
    if (width >= 520) {
      const monday = (await profile.getByRole('button', { name: 'Monday morning, not available', exact: true }).boundingBox())!
      const label = (await profile.locator('th[scope="row"]').first().boundingBox())!
      expect(Math.abs(label.y - monday.y)).toBeLessThan(6)
      expect(label.x + label.width).toBeLessThanOrEqual(monday.x)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    await page.screenshot({ path: `${evidence}/profile-${width}x${height}.png` })
    await page.screenshot({ path: `${evidence}/profile-full-${width}x${height}.png`, fullPage: true })
    const table = profile.getByRole('table', { name: 'Weekly availability', exact: true })
    for (const button of await table.getByRole('button').all()) {
      const box = (await button.boundingBox())!
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(44)
    }
    await table.evaluate(element => element.scrollIntoView({ block: 'center' }))
    if (height === 420) {
      const grid = (await table.boundingBox())!, nav = (await page.locator('.pt-bottom-nav').boundingBox())!
      expect(grid.y).toBeGreaterThanOrEqual(0)
      expect(grid.y + grid.height).toBeLessThanOrEqual(nav.y)
    }
    await page.screenshot({ path: `${evidence}/week-${width}x${height}.png` })
    const settings = profile.getByRole('link', { name: 'Settings & privacy Make Pebble feel right for you.' })
    await settings.scrollIntoViewIfNeeded()
    const visibleTarget = await settings.evaluate(element => { const r = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) })
    expect(visibleTarget).toBe(true)
    await page.screenshot({ path: `${evidence}/profile-footer-${width}x${height}.png` })
    expect(fixture.calls.some(call => call.method !== 'GET' || /\/(queue|result)$/.test(call.path))).toBe(false)
    await settings.click()
    await expect(page).toHaveURL('/settings')
    await expect(page.getByRole('heading', { name: 'A little peace of mind.' })).toBeVisible()
    const downtime = page.getByRole('switch', { name: 'Allow downtime matching' })
    await expect(downtime).toHaveAttribute('aria-checked', 'false')
    await expect(page.getByLabel('Comfortable distance')).toHaveCount(0)
    await expect(page.getByLabel('Group preference')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    await page.screenshot({ path: `${evidence}/settings-${width}x${height}.png` })
    await page.screenshot({ path: `${evidence}/settings-full-${width}x${height}.png`, fullPage: true })
    for (const toggle of await page.getByRole('switch').all()) {
      const box = (await toggle.boundingBox())!
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(44)
    }
    await page.getByRole('link', { name: 'Back to profile', exact: true }).click()
    await expect(page).toHaveURL('/profile')
    expect(fixture.calls.some(call => call.method !== 'GET')).toBe(false)
    expect(fixture.external).toEqual([])
  })
}

test('usual inline changes stage, cancel, persist, and preserve exact windows without queue writes', async ({ page }) => {
  const fixture = await sharedProfileFixture(page)
  await page.goto('/profile')
  const interests = page.getByRole('group', { name: 'Usual interests' })
  await expect(interests.getByRole('button', { name: 'Coffee', exact: true })).toBeEnabled()
  const original = structuredClone(fixture.profile()!)
  await interests.getByRole('button', { name: 'Coffee', exact: true }).click()
  expect(fixture.calls.some(call => call.method !== 'GET')).toBe(false)
  await page.getByRole('button', { name: 'Cancel interests' }).click()
  await expect(interests.getByRole('button', { name: 'Coffee', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await interests.getByRole('button', { name: 'Coffee', exact: true }).click()
  await page.getByRole('button', { name: 'Save usual interests' }).click()
  await expect(page.getByRole('button', { name: 'Save usual interests' })).toHaveCount(0)
  expect(fixture.profile()!.availability).toEqual(original.availability)
  await page.getByRole('button', { name: 'Monday morning, not available', exact: true }).click()
  await page.getByRole('button', { name: 'Save usual availability' }).click()
  await expect(page.getByRole('button', { name: 'Save usual availability' })).toHaveCount(0)
  expect(fixture.profile()!.availability).toEqual([...original.availability, { dow: 1, start_time: '08:00:00', end_time: '12:00:00' }])
  await page.reload()
  await expect(interests.getByRole('button', { name: 'Coffee', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('button', { name: 'Monday morning, available', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(fixture.calls.filter(call => call.method !== 'GET').map(call => call.path)).toEqual(['/api/matchmaking/profile', '/api/matchmaking/profile'])
  expect(fixture.calls.some(call => /\/(queue|result)$/.test(call.path))).toBe(false)
  expect(await page.evaluate(() => localStorage.getItem('pebble.account-design.v1'))).toBeNull()
  expect(fixture.external).toEqual([])
})

test('inline save failure keeps draft and last confirmed profile until read-only reload', async ({ page }) => {
  const fixture = await sharedProfileFixture(page)
  await page.goto('/profile')
  const interests = page.getByRole('group', { name: 'Usual interests' })
  await expect(interests.getByRole('button', { name: 'Coffee', exact: true })).toBeEnabled()
  await page.route('**/api/matchmaking/profile', route => route.request().method() === 'PUT' ? route.fulfill({ status: 503, json: { code: 'unavailable', error: 'Save unavailable.' } }) : route.fulfill({ json: { profile: fixture.profile() } }))
  await interests.getByRole('button', { name: 'Coffee', exact: true }).click()
  await page.getByRole('button', { name: 'Save usual interests' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save usual interests' })).toBeDisabled()
  expect(fixture.profile()!.interests).toContain('Coffee')
  await page.getByRole('button', { name: 'Reload shared profile' }).click()
  await expect(page.getByRole('button', { name: 'Save usual interests' })).toBeEnabled()
  await expect(interests.getByRole('button', { name: 'Coffee', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await page.getByRole('button', { name: 'Cancel interests' }).click()
  await expect(interests.getByRole('button', { name: 'Coffee', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(fixture.external).toEqual([])
})


test('settings persistence and failed-write recovery retain newly saved usual profile values', async ({ page }) => {
  const fixture = await sharedProfileFixture(page)
  await page.goto('/profile')
  const interests = page.getByRole('group', { name: 'Usual interests' })
  await interests.getByRole('button', { name: 'Coffee', exact: true }).click()
  await page.getByRole('button', { name: 'Save usual interests' }).click()
  await expect(page.getByRole('button', { name: 'Save usual interests' })).toHaveCount(0)
  await page.goto('/settings')
  const notifications = page.getByRole('switch', { name: 'Plan & message notifications' })
  await expect(notifications).toBeChecked()
  await notifications.click()
  await expect(notifications).not.toBeChecked()
  expect(fixture.unified().profile!.interests).not.toContain('Coffee')
  expect(fixture.unified().settings.notifications).toBe(false)
  await page.reload()
  await expect(notifications).not.toBeChecked()
  await page.route('**/api/matchmaking/account', route => route.request().method() === 'PUT'
    ? route.fulfill({ status: 503, json: { code: 'unavailable', error: 'Settings save unavailable.' } })
    : route.fulfill({ json: fixture.unified() }))
  await notifications.click()
  await expect(page.getByRole('heading', { name: 'Profile unavailable', exact: true })).toBeVisible()
  expect(fixture.unified().settings.notifications).toBe(false)
  await page.getByRole('button', { name: 'Retry account', exact: true }).click()
  await expect(notifications).not.toBeChecked()
  expect(fixture.unified().profile!.interests).not.toContain('Coffee')
  expect(fixture.external).toEqual([])
})

for (const size of [{ width: 390, height: 844 }, { width: 760, height: 1440 }, { width: 1440, height: 900 }]) test(`handoff comparison with local fictional account ${size.width}`, async ({ page }) => {
  await page.setViewportSize(size)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const fixture = await sharedProfileFixture(page, { interests: ['Coffee', 'Art', 'Music'] })
  const identity = { ...fixture.account()!, display_name: 'Ari', bio: 'Art walks, coffee stops, and taking the scenic route home.', avatar_url: 'https://profile-fixture.invalid/reference-portrait.jpg' }
  const profile = { ...fixture.profile()!, ...identity, birthdate: '2002-02-03', location_city: 'Brooklyn, NY', availability: [{ dow: 1, start_time: '12:00:00', end_time: '17:00:00' }, { dow: 3, start_time: '17:00:00', end_time: '21:00:00' }, { dow: 5, start_time: '17:00:00', end_time: '21:00:00' }] }
  await page.route('https://profile-fixture.invalid/reference-portrait.jpg', route => route.fulfill({ path: 'worktree/profile-settings-reference/profile-settings-handoff/assets/portrait.jpg' }))
  await page.route('**/api/matchmaking/account', route => route.fulfill({ json: { ...fixture.unified(), profile } }))
  await page.route('**/api/matchmaking/account-profile', route => route.fulfill({ json: { profile: identity } }))
  await page.route('**/api/matchmaking/profile', route => route.fulfill({ json: { profile } }))
  await page.goto('/profile')
  await expect(page.getByRole('heading', { name: 'Ari', exact: true })).toBeVisible()
  for (const image of await page.locator('.account-profile-page img').all()) await image.evaluate(element => (element as HTMLImageElement).decode())
  console.log(`Profile comparison ${size.width}: ${JSON.stringify(await page.locator('.account-identity, .account-facts, .account-usual-interests, .account-usual-week, .account-plans, .account-community, .account-spotlight').evaluateAll(elements => elements.map(element => ({ section: element.className, y: element.getBoundingClientRect().y, height: element.getBoundingClientRect().height }))))}`)
  await page.screenshot({ path: `${evidence}/comparison-${size.width}x${size.height}.png` })
  await page.screenshot({ path: `${evidence}/comparison-full-${size.width}x${size.height}.png`, fullPage: true })
  expect(fixture.external).toEqual([])
})
