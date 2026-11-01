import { expect, test } from '@playwright/test'
import { peer, wiringFixture } from './wiring-fixture'

const availableAt = () => new Date(Date.now() + 3600000).toISOString()
const allowance = (used: number) => ({ limit: 10, used, remaining: Math.max(0, 10 - used), availableAt: used >= 10 ? availableAt() : null })
const limitHeading = 'You’ve reached today’s request limit.'

test('an exhausted allowance replaces both discovery decks, survives reload and fits mobile', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  const fixture = await wiringFixture(page)
  await page.route('**/api/connections/request-allowance', route => route.fulfill({ json: allowance(10) }))
  await page.goto('/matchmaking')
  await expect(page.getByRole('heading', { name: limitHeading })).toBeVisible()
  await expect(page.locator('.discovery-request-limit time')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Connect', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Dating', exact: true }).click()
  await expect(page.getByRole('heading', { name: limitHeading })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send Dating request' })).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: limitHeading })).toBeVisible()
  expect(fixture.calls.some(call => call.path.includes('/requests/') && call.method === 'POST')).toBe(false)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('link', { name: 'View incoming requests', exact: true }).click()
  await expect(page).toHaveURL(/\/messages\/requests$/)
})

for (const mode of ['Friends', 'Dating'] as const) {
  test(`${mode} shows the limit screen immediately after the tenth successful request`, async ({ page }) => {
    await wiringFixture(page)
    let used = 9, writes = 0
    await page.route('**/api/connections/request-allowance', route => route.fulfill({ json: allowance(used) }))
    await page.route(`**/api/matchmaking/${mode.toLowerCase()}/requests/${peer}`, route => {
      writes++; used++
      return route.fulfill({ json: { status: 'sent', conversationId: null } })
    })
    await page.goto('/matchmaking')
    if (mode === 'Dating') {
      await page.getByRole('button', { name: 'Dating', exact: true }).click()
      await page.getByRole('button', { name: 'Start Dating discovery' }).click()
    }
    await page.getByRole('button', { name: mode === 'Friends' ? 'Connect' : 'Send Dating request', exact: true }).click()
    await expect(page.getByRole('heading', { name: limitHeading })).toBeVisible()
    await expect(page.getByText(/request not sent|Daily request limit reached/)).toHaveCount(0)
    await page.getByRole('button', { name: mode === 'Friends' ? 'Dating' : 'Friends', exact: true }).click()
    await expect(page.getByRole('heading', { name: limitHeading })).toBeVisible()
    expect(writes).toBe(1)
  })
}

test('a failed allowance read blocks sending until it is reconciled, then reopening works when a slot returns', async ({ page }) => {
  await wiringFixture(page)
  let used = 10, failed = true
  await page.route('**/api/connections/request-allowance', route => failed
    ? route.fulfill({ status: 503, json: { error: 'Unavailable' } })
    : route.fulfill({ json: allowance(used) }))
  await page.goto('/matchmaking')
  await expect(page.getByText('Request availability could not be checked. Try again.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Connect', exact: true })).toBeDisabled()
  failed = false
  await page.getByRole('button', { name: 'Reload saved data', exact: true }).click()
  await expect(page.getByRole('heading', { name: limitHeading })).toBeVisible()
  used = 9
  await page.getByRole('button', { name: 'Check availability', exact: true }).click()
  await expect(page.getByRole('heading', { name: limitHeading })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Connect', exact: true })).toBeEnabled()
})

test('the next profile cannot send while the previous request allowance is being refreshed', async ({ page }) => {
  await wiringFixture(page)
  let release: () => void = () => {}, writes = 0
  const held = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/connections/request-allowance', async route => {
    if (writes > 0) await held
    return route.fulfill({ json: allowance(9) })
  })
  await page.route('**/api/matchmaking/friends/recommendations', route => route.fulfill({ json: {
    algorithmVersion: 'friends-rules-v1', candidates: [peer, 'a0000000-0000-4000-8000-000000000003'].map((id, index) => ({ id, name: index ? 'Jordan' : 'Taylor', age: 23, city: null, bio: null, avatar: null, photoRevision: 0, interests: ['Coffee'], areaDistanceMiles: 2 })),
  } }))
  await page.route(`**/api/matchmaking/friends/requests/${peer}`, route => { writes++; return route.fulfill({ json: { status: 'sent', conversationId: null } }) })
  try {
    await page.goto('/matchmaking')
    await page.getByRole('button', { name: 'Connect', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Jordan, 23' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Connect', exact: true })).toBeDisabled()
    expect(writes).toBe(1)
  } finally { release() }
  await expect(page.getByRole('button', { name: 'Connect', exact: true })).toBeEnabled()
})
