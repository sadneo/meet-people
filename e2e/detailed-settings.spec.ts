import { expect, test } from '@playwright/test'
import { sharedProfileFixture } from './shared-profile-fixture'

for (const width of [320, 390, 1440]) {
  test(`Detailed preferences canonical pending/readback/master masking at ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 })
    const fixture = await sharedProfileFixture(page)
    let wrote = false, release!: () => void
    const readback = new Promise<void>(done => { release = done })
    await page.route('**/api/matchmaking/detailed-settings', async route => {
      if (route.request().method() === 'PUT') wrote = true
      else if (wrote) await readback
      await route.fallback()
    })
    await page.goto('/settings')
    const region = page.getByRole('region', { name: 'Detailed notification and discovery preferences' })
    await region.getByText('Notification & discovery details', { exact: true }).click()
    await expect(region.getByRole('checkbox')).toHaveCount(5)
    for (const checkbox of await region.getByRole('checkbox').all()) await expect(checkbox).not.toBeChecked()
    expect(fixture.calls.some(call => call.method !== 'GET')).toBe(false)
    await region.getByRole('checkbox', { name: 'New messages', exact: true }).check()
    await region.getByRole('checkbox', { name: 'Friends discovery preference' }).check()
    await page.screenshot({ path: testInfo.outputPath('detailed-preferences-draft.png') })
    await region.getByRole('button', { name: 'Save detailed preferences' }).click()
    await expect(region.getByText('Saving and confirming detailed preferences…')).toBeVisible()
    await expect(region.getByRole('button', { name: 'Cancel detail changes' })).toBeDisabled()
    await expect(region.getByRole('button', { name: 'Reload saved preferences' })).toBeDisabled()
    await expect(region.getByText('Detailed preferences saved and reloaded.')).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath('detailed-preferences-pending.png') })
    release()
    await expect(region.getByText('Detailed preferences saved and reloaded.', { exact: true })).toBeVisible()
    await expect(region.getByText(/do not verify delivery or live discovery/)).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('detailed-preferences-saved.png') })
    await page.reload()
    await region.getByText('Notification & discovery details', { exact: true }).click()
    await expect(region.getByRole('checkbox', { name: 'New messages', exact: true })).toBeChecked()
    const notifications = page.getByRole('switch', { name: 'Plan & message notifications', exact: true })
    await expect(notifications).toBeChecked()
    const beforeToggle = fixture.calls.length
    const offReadback = page.waitForResponse(response => new URL(response.url()).pathname === '/api/matchmaking/detailed-settings' && response.request().method() === 'GET')
    // This controlled switch changes only after the account writer's GET/PUT/GET,
    // not synchronously at click dispatch as Playwright uncheck() requires.
    await notifications.click()
    await expect(notifications).not.toBeChecked()
    await expect(notifications).toBeEnabled()
    const accountAndDetails = (start: number) => fixture.calls.slice(start).filter(call => /\/(account|detailed-settings)$/.test(call.path)).map(call => `${call.method} ${call.path}`)
    await expect.poll(() => accountAndDetails(beforeToggle)).toEqual([
      'GET /api/matchmaking/account', 'PUT /api/matchmaking/account',
      'GET /api/matchmaking/account', 'GET /api/matchmaking/detailed-settings',
    ])
    expect(fixture.unified().settings.notifications).toBe(false)
    expect(await (await offReadback).json()).toMatchObject({ settings: { messages: true }, masters: { notifications: false }, effective: { messages: false } })
    await expect(region.getByRole('checkbox', { name: 'New messages', exact: true })).toBeDisabled()
    await expect(region.getByRole('checkbox', { name: 'New messages', exact: true })).toBeChecked()
    await expect(region.getByText(/Notification preferences are suppressed/)).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('detailed-preferences-master-off.png') })
    // Re-enable must also invalidate the canonical detail masters, not simply
    // reuse the old pre-toggle snapshot or rely on an off-only UI mask.
    const beforeEnable = fixture.calls.length
    const onReadback = page.waitForResponse(response => new URL(response.url()).pathname === '/api/matchmaking/detailed-settings' && response.request().method() === 'GET')
    await notifications.click()
    await expect(notifications).toBeChecked()
    await expect(notifications).toBeEnabled()
    await expect.poll(() => accountAndDetails(beforeEnable)).toEqual([
      'GET /api/matchmaking/account', 'PUT /api/matchmaking/account',
      'GET /api/matchmaking/account', 'GET /api/matchmaking/detailed-settings',
    ])
    await expect(region.getByRole('checkbox', { name: 'New messages', exact: true })).toBeEnabled()
    await expect(region.getByRole('checkbox', { name: 'New messages', exact: true })).toBeChecked()
    expect(await (await onReadback).json()).toMatchObject({ settings: { messages: true }, masters: { notifications: true }, effective: { messages: true } })
    expect(fixture.calls.filter(call => call.path.endsWith('/detailed-settings') && call.method === 'PUT')).toEqual([{ path: '/api/matchmaking/detailed-settings', method: 'PUT', body: { expectedRevision: 0, settings: { messages: true, plans: false, matches: false, friendsDiscovery: true, datingDiscovery: false } } }])
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    expect(fixture.external).toEqual([])
  })
}
for (const width of [320, 1440]) {
  test(`Detailed preferences unavailable does not expose fake defaults at ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 })
    const fixture = await sharedProfileFixture(page, { detailedSettings: 'unavailable' })
    await page.goto('/settings')
    const region = page.getByRole('region', { name: 'Detailed notification and discovery preferences' })
    await region.getByText('Notification & discovery details', { exact: true }).click()
    await expect(region.getByRole('alert')).toContainText('Detailed preferences are unavailable')
    await expect(region.getByRole('checkbox')).toHaveCount(0)
    await expect(region.getByRole('button', { name: 'Save detailed preferences' })).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath('detailed-preferences-unavailable.png') })
    await page.getByRole('button', { name: /Blocked users/ }).click()
    await expect(page.getByRole('dialog', { name: 'Blocked users' }).getByRole('alert')).toContainText('not connected')
    expect(fixture.calls.some(call => call.method !== 'GET')).toBe(false)
    expect(fixture.external).toEqual([])
  })
}
test('Detailed preferences conflict requires authoritative reload and never resubmits a write', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 844 })
  const fixture = await sharedProfileFixture(page)
  let attempts = 0
  await page.route('**/api/matchmaking/detailed-settings', route => {
    if (route.request().method() === 'PUT') { attempts++; return route.fulfill({ status: 409, json: { code: 'conflict', error: 'Synthetic conflict' } }) }
    return route.fallback()
  })
  await page.goto('/settings')
  const region = page.getByRole('region', { name: 'Detailed notification and discovery preferences' })
  await region.getByText('Notification & discovery details', { exact: true }).click()
  await region.getByRole('checkbox', { name: 'New messages', exact: true }).check()
  await region.getByRole('button', { name: 'Save detailed preferences' }).click()
  await expect(region.getByRole('alert')).toContainText('Saved preferences changed')
  await expect(region.getByRole('button', { name: 'Save detailed preferences' })).toBeDisabled()
  await page.screenshot({ path: testInfo.outputPath('detailed-preferences-conflict.png') })
  await region.getByRole('button', { name: 'Reload saved preferences' }).click()
  await expect(region.getByRole('checkbox', { name: 'New messages', exact: true })).not.toBeChecked()
  expect(attempts).toBe(1)
  expect(fixture.external).toEqual([])
})
