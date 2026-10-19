import { expect, test } from '@playwright/test'
import { browserProfile, mockMatchingApi, mockMatchingSession } from './matchmaking-fixture'

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 860 }]) {
  test(`invalid matching preferences reveal their feedback at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await mockMatchingSession(page)
    await mockMatchingApi(page)
    let saves = 0
    await page.route('**/api/matchmaking/profile', route => {
      if (route.request().method() === 'PUT') saves++
      return route.fallback()
    })
    await page.goto('/matchmaking')
    await page.getByRole('button', { name: 'Preferences', exact: true }).click()
    await page.getByRole('button', { name: 'Add time window' }).click()
    await page.getByLabel('Start 1', { exact: true }).fill('17:00')
    await page.getByLabel('End 1', { exact: true }).fill('21:00')
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.getByRole('button', { name: 'Save preferences' }).click()
      const alert = page.getByRole('dialog').getByRole('alert')
      await expect(alert).toBeFocused()
      await expect.poll(() => alert.evaluate(element => {
        const body = element.closest('.match-preferences-body')!.getBoundingClientRect()
        const bounds = element.getBoundingClientRect()
        return bounds.top >= body.top && bounds.bottom <= body.bottom
      })).toBe(true)
      await expect(page.getByLabel('Start 1', { exact: true })).toHaveValue('17:00')
    }
    expect(saves).toBe(0)
  })
}

for (const origin of ['shell', 'settings']) {
  test(`mocked ${origin} logout failure stays signed in; retry signs out through auth notifications`, async ({ page }) => {
    await mockMatchingSession(page, true, 1)
    await mockMatchingApi(page)
    const path = origin === 'shell' ? '/matchmaking' : '/settings'
    await page.goto(path)
    if (origin === 'shell') await page.getByRole('button', { name: 'Account menu' }).click()
    const controls = origin === 'shell' ? page.locator('.pt-account-options') : page.getByRole('region', { name: 'Account actions' })
    await controls.getByRole('button', { name: 'Log out', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Could not log out')
    await expect(page).toHaveURL(path)
    if (origin === 'shell') await page.getByRole('button', { name: 'Account menu' }).click()
    await expect(controls.getByRole('button', { name: 'Log out', exact: true })).toBeEnabled()
    await controls.getByRole('button', { name: 'Log out', exact: true }).click()
    await expect(page).toHaveURL('/login')
    await expect(page.getByRole('heading', { name: 'Sign in to match' })).toBeVisible()
    await page.getByRole('link', { name: 'Back to home preview' }).click()
    await page.getByRole('link', { name: 'Matchmaking', exact: true }).first().click()
    await expect(page).toHaveURL('/matchmaking')
    await expect(page.getByRole('heading', { name: 'Sign in to match' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Start matching' })).toHaveCount(0)
  })
}

for (const mode of ['active', 'downtime']) {
  const startName = mode === 'active' ? 'Start matching' : 'Turn on downtime matching'
  const leaveName = mode === 'active' ? 'Cancel search' : 'Pause downtime matching'
  test(`mocked ${mode} queue, explicit lookup and cancellation failure`, async ({ page }) => {
    await mockMatchingSession(page)
    await mockMatchingApi(page)
    let checks = 0
    await page.route('**/api/matchmaking/result', route => {
      checks++
      expect(route.request().headers().authorization).toBe('Bearer browser-user-jwt')
      return route.fulfill({ json: { candidate: { id: 'a0000000-0000-4000-8000-000000000002', name: 'Taylor', avatar: null, interests: ['Coffee'], overlap: 'some', mode, meetup: null } } })
    })
    await page.goto(mode === 'active' ? '/matchmaking' : '/downtime-matchmaking')
    await expect(page.getByRole('button', { name: startName, exact: true })).toBeEnabled()
    expect(checks).toBe(0)
    await page.getByRole('button', { name: startName, exact: true }).click()
    await expect(page.getByRole('status')).toContainText(`${mode} queue`)
    expect(checks).toBe(0)
    await page.getByRole('button', { name: 'Check for a match' }).click()
    await expect(page.getByRole('heading', { name: 'Taylor' })).toBeVisible()
    expect(checks).toBe(1)
    await page.route('**/api/matchmaking/queue', route => route.request().method() === 'DELETE' ? route.fulfill({ status: 503, json: { code: 'provider', error: 'Matching service failed. Please try again.' } }) : route.fallback())
    await page.getByRole('button', { name: leaveName, exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Matching service failed')
    await expect(page.getByRole('status')).toContainText(`${mode} queue`)
    await page.unroute('**/api/matchmaking/queue')
    await page.getByRole('button', { name: leaveName, exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Ready when you are')
  })
  test(`mocked ${mode} enrollment requires a saved profile; failed save cannot unlock it`, async ({ page }) => {
    await mockMatchingSession(page)
    await mockMatchingApi(page)
    let savesFail = true
    let joins = 0
    await page.route('**/api/matchmaking/queue', route => {
      if (route.request().method() === 'POST') joins++
      return route.fallback()
    })
    await page.route('**/api/matchmaking/profile', route => {
      if (route.request().method() === 'GET') return route.fulfill({ json: { profile: null } })
      return savesFail ? route.fulfill({ status: 503, json: { code: 'unavailable', error: 'Profile save unavailable.' } }) : route.fulfill({ json: { profile: route.request().postDataJSON() } })
    })
    await page.goto(mode === 'active' ? '/matchmaking' : '/downtime-matchmaking')
    await expect(page.getByText('No matching profile saved yet.')).toBeVisible()
    const start = page.getByRole('button', { name: startName, exact: true })
    await expect(start).toBeDisabled()
    await page.getByRole('button', { name: 'Preferences' }).click()
    await page.getByLabel('Username', { exact: true }).fill('sam')
    await page.getByLabel('Display name', { exact: true }).fill('Sam')
    await page.getByRole('button', { name: 'Save preferences' }).click()
    await expect(page.getByRole('alert')).toContainText('Profile save unavailable')
    await page.keyboard.press('Escape')
    await expect(start).toBeDisabled()
    expect(joins).toBe(0)
    savesFail = false
    await page.getByRole('button', { name: 'Preferences' }).click()
    await page.getByLabel('Username', { exact: true }).fill('sam')
    await page.getByLabel('Display name', { exact: true }).fill('Sam')
    await page.getByRole('button', { name: 'Save preferences' }).click()
    await expect(start).toBeEnabled()
    await start.click()
    await expect(page.getByRole('button', { name: leaveName, exact: true })).toBeEnabled()
    expect(joins).toBe(1)
  })
  test(`mocked ${mode} profile failure prevents enrollment until a successful retry`, async ({ page }) => {
    await mockMatchingSession(page)
    await mockMatchingApi(page)
    let fails = true
    let joins = 0
    await page.route('**/api/matchmaking/queue', route => {
      if (route.request().method() === 'POST') joins++
      return route.fallback()
    })
    await page.route('**/api/matchmaking/profile', route => fails ? route.fulfill({ status: 503, json: { code: 'unavailable', error: 'Profile load unavailable.' } }) : route.fulfill({ json: { profile: browserProfile } }))
    await page.goto(mode === 'active' ? '/matchmaking' : '/downtime-matchmaking')
    await expect(page.getByRole('alert')).toContainText('Profile load unavailable')
    const start = page.getByRole('button', { name: startName, exact: true })
    await expect(start).toBeDisabled()
    await page.getByRole('button', { name: 'Refresh status' }).click()
    await expect(start).toBeDisabled()
    expect(joins).toBe(0)
    fails = false
    await page.getByRole('button', { name: 'Retry profile' }).click()
    await expect(start).toBeEnabled()
  })
  test(`mocked ${mode} existing queue can refresh and leave despite profile failure`, async ({ page }) => {
    await mockMatchingSession(page)
    await mockMatchingApi(page)
    let queued: string | null = mode === 'active' ? 'downtime' : 'active'
    let leaves = 0
    let joins = 0
    await page.route('**/api/matchmaking/profile', route => route.fulfill({ status: 503, json: { code: 'unavailable', error: 'Profile load unavailable.' } }))
    await page.route('**/api/matchmaking/status', route => route.fulfill({ json: { mode: queued } }))
    await page.route('**/api/matchmaking/queue', route => {
      if (route.request().method() === 'POST') joins++
      if (route.request().method() === 'DELETE') { leaves++; queued = null }
      return route.fulfill({ json: { mode: queued } })
    })
    await page.goto(mode === 'active' ? '/matchmaking' : '/downtime-matchmaking')
    await expect(page.getByRole('alert')).toContainText('Profile load unavailable')
    await expect(page.getByRole('button', { name: `Switch to ${mode} queue`, exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Refresh status' }).click()
    await expect(page.getByRole('status')).toContainText(`${queued} queue`)
    await page.getByRole('button', { name: leaveName, exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Ready when you are')
    await expect(page.getByRole('button', { name: startName, exact: true })).toBeDisabled()
    expect(leaves).toBe(1)
    expect(joins).toBe(0)
  })
}
test('mocked sign-in gating and atomic profile failure are honest', async ({ page }) => {
  await mockMatchingSession(page, false)
  await page.goto('/matchmaking')
  await expect(page.getByRole('heading', { name: 'Sign in to match' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start matching' })).toHaveCount(0)
  await page.getByRole('link', { name: 'Sign in', exact: true }).click()
  await page.getByLabel('Email').fill('student@example.test')
  await page.getByRole('button', { name: 'Send sign-in link' }).click()
  await expect(page.getByRole('status')).toContainText('Check your email')
  await page.unroute('**/src/supabase.ts')
  await mockMatchingSession(page)
  await mockMatchingApi(page)
  await page.goto('/matchmaking')
  await page.getByRole('button', { name: 'Preferences' }).click()
  await page.route('**/api/matchmaking/profile', route => route.request().method() === 'PUT' ? route.fulfill({ status: 503, json: { code: 'unavailable', error: 'Matching RPC is not available yet.' } }) : route.fallback())
  await page.getByRole('button', { name: 'Save preferences' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('not available yet')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Preferences' })).toBeFocused()
})
