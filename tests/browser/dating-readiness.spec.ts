import { expect, test } from '@playwright/test'
import { emptyDatingProfile } from '../../shared/dating'
import type { DatingRuntime } from '../../shared/dating-live'
import { locationId, wiringFixture } from './wiring-fixture'

function ready(enabled = false): DatingRuntime {
  return { available: true, canStart: true, globalDiscovery: true, datingDiscovery: true, aggregate: {
    profileRevision: 1, searchRevision: 1,
    profile: { ...emptyDatingProfile(), gender: 'Man', sexuality: 'Straight', intent: 'Long-term relationship', style: 'Monogamy', clarifiedTargets: ['Woman'], enabled },
    search: { ageMin: 18, ageMax: 99, radiusMiles: 15, searchArea: { source: 'home', resolvedLocationRef: locationId } },
    eligibility: { asOf: '2026-10-30', adult: true, locationResolved: true }, effectiveEnabled: enabled,
  } }
}

for (const [reason, title, link] of [
  ['age', 'Dating is for adults 18 and older.', 'Review birthdate'],
  ['discovery_off', 'Dating discovery is off.', 'Discovery settings'],
  ['profile', 'Complete your Dating profile.', 'Edit Dating profile'],
  ['preferences', 'Set up your Dating search.', 'Set up Dating preferences'],
  ['location', 'Confirm your Dating search area again.', 'Review Dating preferences'],
  ['unavailable', 'Review your Dating setup.', 'Review Dating preferences'],
] as const) {
  test(`Dating explains ${reason} before starting discovery`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    const fixture = await wiringFixture(page), value = ready()
    value.canStart = false
    if (reason === 'age') value.aggregate.eligibility.adult = false
    if (reason === 'discovery_off') value.datingDiscovery = false
    if (reason === 'profile') value.aggregate.profile = emptyDatingProfile()
    if (reason === 'preferences') { value.aggregate.search = null; value.aggregate.eligibility.locationResolved = false }
    if (reason === 'location') value.aggregate.eligibility.locationResolved = false
    await page.route('**/api/matchmaking/dating/status', route => route.fulfill({ json: value }))
    await page.goto('/matchmaking?mode=dating')
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: link, exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Start Dating discovery', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Send Dating request', exact: true })).toHaveCount(0)
    expect(fixture.calls.some(call => call.path.endsWith('/dating/recommendations') || call.path.endsWith('/dating/enabled'))).toBe(false)
    await expect(page.getByRole('alert')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}

test('expiry during Dating scoring switches to area guidance while Pause remains available', async ({ page }) => {
  await wiringFixture(page)
  const value = ready(true); let batches = 0
  await page.route('**/api/matchmaking/dating/status', route => route.fulfill({ json: value }))
  await page.route('**/api/matchmaking/dating/recommendations', route => {
    batches++; value.canStart = false; value.aggregate.eligibility.locationResolved = false; value.aggregate.effectiveEnabled = false
    return route.fulfill({ status: 409, json: { code: 'dating_setup_required', error: 'Review your Dating setup.' } })
  })
  await page.goto('/matchmaking?mode=dating')
  await expect(page.getByRole('heading', { name: 'Confirm your Dating search area again.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pause Dating', exact: true })).toBeEnabled()
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(batches).toBe(1)
})

test('inconsistent Dating eligibility responses cause one status recheck without a retry loop', async ({ page }) => {
  await wiringFixture(page)
  await page.route('**/api/matchmaking/dating/status', route => route.fulfill({ json: ready(true) }))
  let batches = 0
  await page.route('**/api/matchmaking/dating/recommendations', route => {
    batches++
    return route.fulfill({ status: 409, json: { code: 'dating_setup_required', error: 'Review your Dating setup.' } })
  })
  await page.goto('/matchmaking?mode=dating')
  await expect.poll(() => batches).toBe(2)
  await expect(page.getByRole('alert')).toHaveText('Review your Dating setup.')
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
})

test('a rejected Dating opt-in refreshes setup without claiming the write is unconfirmed', async ({ page }) => {
  await wiringFixture(page)
  const value = ready(); let writes = 0
  await page.route('**/api/matchmaking/dating/status', route => route.fulfill({ json: value }))
  await page.route('**/api/matchmaking/dating/enabled', route => {
    writes++; value.canStart = false; value.aggregate.eligibility.locationResolved = false
    return route.fulfill({ status: 409, json: { code: 'dating_setup_required', error: 'Confirm your Dating search area.' } })
  })
  await page.goto('/matchmaking?mode=dating')
  await page.getByRole('button', { name: 'Start Dating discovery', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Confirm your Dating search area again.' })).toBeVisible()
  await expect(page.getByText(/Participation is unconfirmed/)).toHaveCount(0)
  expect(writes).toBe(1)
})

test('an interrupted Dating opt-in still requires an explicit status read before another write', async ({ page }) => {
  await wiringFixture(page)
  await page.route('**/api/matchmaking/dating/status', route => route.fulfill({ json: ready() }))
  let writes = 0
  await page.route('**/api/matchmaking/dating/enabled', route => { writes++; return route.abort() })
  await page.goto('/matchmaking?mode=dating')
  await page.getByRole('button', { name: 'Start Dating discovery', exact: true }).click()
  await expect(page.getByText(/Participation is unconfirmed/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start Dating discovery', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Refresh Dating status', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Start Dating discovery', exact: true })).toBeEnabled()
  expect(writes).toBe(1)
})
