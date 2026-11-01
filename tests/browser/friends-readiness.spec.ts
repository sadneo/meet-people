import { expect, test } from '@playwright/test'
import { wiringFixture } from './wiring-fixture'

for (const [reason, title, link, destination] of [
  ['age', 'Friends discovery is for ages 18–99.', 'Review birthdate', '/profile?section=basics'],
  ['profile', 'Finish your profile first.', 'Edit profile', '/profile?section=basics'],
  ['discovery_off', 'Friends, at your pace.', 'Discovery settings', '/profile?section=discovery'],
  ['preferences', 'Set up Friends discovery.', 'Set up Friends preferences', '/matchmaking?mode=friends&preferences=true'],
  ['location', 'Confirm your search area again.', 'Review Friends preferences', '/matchmaking?mode=friends&preferences=true'],
] as const) {
  test(`Friends explains ${reason} before requesting recommendations`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    const fixture = await wiringFixture(page)
    await page.route('**/api/matchmaking/friends/status', route => route.fulfill({ json: { available: true, eligible: false, reason } }))
    await page.goto('/matchmaking')
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: link, exact: true })).toHaveAttribute('href', destination)
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
  await expect(page.getByRole('heading', { name: 'Confirm your search area again.', exact: true })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(reads).toBeGreaterThan(1)
  expect(batches).toBe(1)
})
