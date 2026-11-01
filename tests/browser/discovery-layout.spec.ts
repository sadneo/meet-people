import { expect, test } from '@playwright/test'
import { peer, wiringFixture } from './wiring-fixture'

for (const width of [320, 390, 590]) {
  test(`Discover profile and actions match mobile reference at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await wiringFixture(page)
    await page.goto('/matchmaking')
    const profile = page.locator('.discovery-profile:visible')
    await expect(profile.getByRole('heading', { name: 'Taylor, 23' })).toBeVisible()
    await expect(profile.locator('.phototext h2')).toHaveCSS('color', 'rgb(255, 255, 255)')
    await expect(profile.getByRole('heading', { name: 'Interests', exact: true })).toBeAttached()
    const strip = profile.locator('.dating-actions')
    await expect(strip).toHaveCSS('position', 'fixed')
    await expect(profile.getByRole('button', { name: 'Undo skip' })).toBeDisabled()
    await expect(profile.getByRole('button', { name: 'Connect', exact: true })).toHaveCSS('background-color', 'rgb(183, 126, 96)')
    const before = (await strip.boundingBox())!
    await profile.locator('.dating-interest-list').scrollIntoViewIfNeeded()
    const after = (await strip.boundingBox())!
    expect(after.y).toBe(before.y)
    const navigation = (await page.getByRole('navigation', { name: 'Main navigation' }).boundingBox())!
    expect(after.y + after.height).toBeLessThanOrEqual(navigation.y + 1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await profile.getByRole('button', { name: 'Block or report' }).click()
    await expect(page.getByRole('dialog', { name: /Safety/ })).toBeVisible()
  })
}

test('Undo restores only the most recent skipped profile and never sends a request', async ({ page }) => {
  const fixture = await wiringFixture(page)
  await page.route('**/api/matchmaking/friends/recommendations', route => route.fulfill({ json: {
    algorithmVersion: 'friends-rules-v1', candidates: [peer, 'a0000000-0000-4000-8000-000000000003'].map((id, index) => ({ id, name: index ? 'Jordan' : 'Taylor', age: 23, city: null, bio: null, avatar: null, photoRevision: 0, interests: ['Coffee'], areaDistanceMiles: 2 })),
  } }))
  await page.goto('/matchmaking')
  await expect(page.getByRole('heading', { name: 'Taylor, 23' })).toBeVisible()
  await page.getByRole('button', { name: 'Pass', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Jordan, 23' })).toBeVisible()
  await page.getByRole('button', { name: 'Undo skip', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Taylor, 23' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Undo skip', exact: true })).toBeDisabled()
  expect(fixture.calls.some(call => call.path.includes('/requests/') && call.method === 'POST')).toBe(false)
})

test('Dating uses a plum tab, filled heart and real relationship details', async ({ page }) => {
  await wiringFixture(page)
  await page.goto('/matchmaking')
  const dating = page.getByRole('button', { name: 'Dating', exact: true })
  await dating.click()
  await expect(dating).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Start Dating discovery' }).click()
  const profile = page.locator('.dating-profile:visible')
  await expect(profile.getByRole('heading', { name: 'Taylor, 23' })).toBeVisible()
  await expect(profile.getByRole('button', { name: 'Send Dating request' }).locator('svg')).toHaveCSS('fill', 'rgb(255, 255, 255)')
  await expect(profile.getByRole('region', { name: 'Dating details' })).toBeVisible()
})

test('Discover renders public facts and consented coarse availability, with no fixture facts', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await wiringFixture(page)
  await page.route('**/api/matchmaking/friends/recommendations', route => route.fulfill({ json: {
    algorithmVersion: 'friends-rules-v1', candidates: [{ id: peer, name: 'Taylor', age: 23, city: 'Campus area', bio: 'Real API biography', avatar: null, photoRevision: 0, interests: ['Coffee'], areaDistanceMiles: 2,
      details: { education: 'Synthetic college', languages: ['English', 'Spanish'] },
      sharedAvailability: { dayOfWeek: 3, period: 'afternoon', timeZone: 'America/New_York' },
    }],
  } }))
  await page.goto('/matchmaking')
  const profile = page.locator('.discovery-profile:visible')
  await profile.getByText('Time in common', { exact: true }).scrollIntoViewIfNeeded()
  await expect(profile.getByText('Wednesday afternoon · Shared availability', { exact: true })).toBeVisible()
  await profile.getByText('Synthetic college', { exact: true }).scrollIntoViewIfNeeded()
  await expect(profile.getByText('Education', { exact: true })).toBeVisible()
  await expect(profile.getByText('English, Spanish', { exact: true })).toBeVisible()
  await expect(profile.getByText('University of Michigan', { exact: true })).toHaveCount(0)
})

test('profile decision animation guards repeated taps and sends one request', async ({ page }) => {
  const fixture = await wiringFixture(page)
  await page.goto('/matchmaking')
  const connect = page.getByRole('button', { name: 'Connect', exact: true })
  await expect(connect).toBeVisible()
  await connect.evaluate((button: HTMLButtonElement) => { button.click(); button.click() })
  await expect(page.getByText('Request sent to Taylor.', { exact: true })).toBeVisible()
  expect(fixture.calls.filter(call => call.path === `/api/matchmaking/friends/requests/${peer}` && call.method === 'POST')).toHaveLength(1)
})

test('profile transitions respect reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await wiringFixture(page)
  await page.goto('/matchmaking')
  const content = page.locator('.discovery-card-slot:not([hidden]) .discovery-profile-content')
  await expect(content).toBeVisible()
  await expect(content).toHaveCSS('animation-name', 'none')
  await page.getByRole('button', { name: 'Pass', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'You’re all caught up.' })).toBeVisible()
  await page.getByRole('button', { name: 'Undo skip', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Taylor, 23' })).toBeVisible()
  await expect(content).toHaveCSS('animation-name', 'none')
})

test('switching profiles never fades the visible card to a blank frame', async ({ page }) => {
  await wiringFixture(page)
  await page.route('**/api/matchmaking/friends/recommendations', route => route.fulfill({ json: {
    algorithmVersion: 'friends-rules-v1', candidates: [peer, 'a0000000-0000-4000-8000-000000000003'].map((id, index) => ({ id, name: index ? 'Jordan' : 'Taylor', age: 23, city: null, bio: null, avatar: null, photoRevision: 0, interests: ['Coffee'], areaDistanceMiles: 2 })),
  } }))
  await page.goto('/matchmaking')
  await expect(page.getByRole('heading', { name: 'Taylor, 23' })).toBeVisible()
  const minimumOpacity = await page.evaluate(async () => {
    const button = document.querySelector<HTMLButtonElement>('.discovery-card-slot:not([hidden]) button[aria-label="Pass"]')!
    const start = performance.now()
    let minimum = 1
    button.click()
    await new Promise<void>(resolve => {
      function frame() {
        const content = document.querySelector('.discovery-card-slot:not([hidden]) .discovery-profile-content')
        minimum = Math.min(minimum, content ? Number(getComputedStyle(content).opacity) : 0)
        if (performance.now() - start < 450) requestAnimationFrame(frame)
        else resolve()
      }
      requestAnimationFrame(frame)
    })
    return minimum
  })
  expect(minimumOpacity).toBe(1)
  await expect(page.getByRole('heading', { name: 'Jordan, 23' })).toBeVisible()
})
