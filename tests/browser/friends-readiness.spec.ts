import { expect, test } from '@playwright/test'
import { wiringFixture } from './wiring-fixture'

for (const [reason, title, link, destination] of [
  ['age', 'Friends discovery is for ages 18–99.', 'Review birthdate', '/profile?section=basics'],
  ['profile', 'Set up Friends matchmaking.', 'Set up Friends', null],
  ['discovery_off', 'Friends discovery is paused.', 'Discovery settings', '/profile?section=discovery'],
  ['preferences', 'Set up Friends matchmaking.', 'Set up Friends', null],
  ['location', 'Confirm your Friends search area.', 'Review Friends setup', null],
] as const) {
  test(`Friends explains ${reason} before requesting recommendations`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    const fixture = await wiringFixture(page)
    await page.route('**/api/matchmaking/friends/status', route => route.fulfill({ json: { available: true, eligible: false, reason } }))
    await page.goto('/matchmaking')
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
    if (destination) await expect(page.getByRole('link', { name: link, exact: true })).toHaveAttribute('href', destination)
    else await expect(page.getByRole('button', { name: link, exact: true })).toBeVisible()
    expect(fixture.calls.some(call => call.path.endsWith('/friends/recommendations'))).toBe(false)
    await expect(page.getByRole('button', { name: 'Connect', exact: true })).toHaveCount(0)
    await expect(page.getByRole('alert')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}

test('expiry between the setup check and scoring switches to search-area guidance', async ({ page }) => {
  await wiringFixture(page)
  let expired = false, reads = 0, batches = 0
  await page.route('**/api/matchmaking/friends/status', route => {
    reads++
    return route.fulfill({ json: { available: true, eligible: !expired, reason: expired ? 'location' : null } })
  })
  await page.route('**/api/matchmaking/friends/recommendations', route => {
    expired = true; batches++
    return route.fulfill({ status: 409, json: { code: 'friends_setup_required', error: 'Review your profile and Friends preferences.' } })
  })
  await page.goto('/matchmaking')
  await expect(page.getByRole('heading', { name: 'Confirm your Friends search area.', exact: true })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(reads).toBeGreaterThan(1)
  expect(batches).toBe(1)
})
