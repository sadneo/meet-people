import { expect, test } from '@playwright/test'
import { conversationId, peer, wiringFixture } from './wiring-fixture'
import { mockLocationPicker } from './location-picker-fixture'

for (const width of [320, 390]) {
  test(`Friends fields save in place and cancel preserves the account at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 })
    const fixture = await wiringFixture(page)
    await page.goto('/matchmaking?mode=friends&preferences=true')
    const preferences = page.getByRole('dialog', { name: 'Friends preferences', exact: true })
    await preferences.getByRole('button', { name: 'Edit interests', exact: true }).click()
    const editor = page.getByRole('dialog', { name: 'Your interests', exact: true })
    await editor.getByRole('button', { name: 'Outdoors', exact: true }).click()
    await page.screenshot({ path: test.info().outputPath('friends-interest-editor.png'), animations: 'disabled' })
    await editor.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(editor).toHaveCount(0)
    await expect(preferences.locator('.friends-shared-interests')).toContainText('Outdoors')
    expect(fixture.getAccount().profile!.interests).toContain('Outdoors')
    await expect(page).toHaveURL(/matchmaking\?mode=friends&preferences=true/)
    await preferences.getByRole('button', { name: 'Edit availability', exact: true }).click()
    const schedule = page.getByRole('dialog', { name: 'Your availability', exact: true })
    await expect(schedule.getByRole('button', { name: 'Save changes' })).toBeEnabled()
    const before = structuredClone(fixture.getAccount().profile!.availability)
    await schedule.getByRole('button', { name: 'Add a time window' }).click()
    await schedule.getByRole('button', { name: 'Cancel', exact: true }).click()
    expect(fixture.getAccount().profile!.availability).toEqual(before)
    await expect(preferences).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}

test('area label opens the map directly, confirmation saves and returns to Discover', async ({ page }) => {
  const fixture = await wiringFixture(page)
  await mockLocationPicker(page)
  await page.goto('/matchmaking?mode=friends')
  await page.getByRole('button', { name: 'Search area & preferences' }).click()
  const search = page.getByRole('combobox', { name: 'Search city or neighborhood' })
  await expect(search).toBeVisible()
  await search.fill('Brooklyn')
  await page.getByRole('button', { name: 'Brooklyn, NY', exact: true }).click()
  await page.getByRole('button', { name: 'Set search area', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Search area & preferences' })).toContainText('Brooklyn, NY')
  expect(fixture.calls.filter(call => call.method === 'PUT' && call.path.endsWith('/friends-search-preferences'))).toHaveLength(1)
})

test('canceling the direct map leaves the saved area untouched', async ({ page }) => {
  const fixture = await wiringFixture(page)
  await mockLocationPicker(page)
  await page.goto('/matchmaking?mode=friends')
  await page.getByRole('button', { name: 'Search area & preferences' }).click()
  await expect(page.getByRole('combobox', { name: 'Search city or neighborhood' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(fixture.calls.filter(call => call.method === 'PUT')).toHaveLength(0)
})

test('Activity acceptance opens its confirmed conversation immediately', async ({ page }) => {
  await wiringFixture(page)
  await page.route('**/api/connections', route => route.fulfill({ json: {
    incoming: [{ id: peer, display_name: 'Taylor', avatar_url: null, mode: 'friends', requested_at: new Date().toISOString() }], sent: [], connected: [],
  } }))
  await page.route(`**/api/matchmaking/friends/requests/${peer}/accept`, route => route.fulfill({ json: { status: 'connected', conversationId } }))
  await page.goto('/activity')
  await page.getByRole('button', { name: 'Accept', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`messages/chat\\?conversation=${conversationId}`))
})

test('a failed automatic photo upload cannot be repeated before a readback', async ({ page }) => {
  await wiringFixture(page)
  let writes = 0
  await page.route('**/api/matchmaking/profile-photo/gallery**', route => {
    if (route.request().method() === 'PUT') { writes++; return route.abort() }
    if (/\/gallery\/[^/]+$/.test(new URL(route.request().url()).pathname)) return route.fulfill({ json: { revision: 1, count: 0 } })
    return route.fallback()
  })
  await page.goto('/profile')
  const gallery = page.getByRole('region', { name: 'Photos', exact: true })
  const [picker] = await Promise.all([page.waitForEvent('filechooser'), gallery.getByRole('button', { name: 'Add photo' }).click()])
  await picker.setFiles('public/pebble/maya.jpg')
  await expect(gallery.getByRole('alert')).toBeVisible()
  await expect(gallery.getByRole('button', { name: 'Upload photo' })).toHaveCount(0)
  expect(writes).toBe(1)
  await gallery.getByRole('button', { name: 'Reload photos' }).click()
  await expect(gallery.getByRole('button', { name: 'Add photo' })).toBeEnabled()
  expect(writes).toBe(1)
})

test('an unconfirmed in-place interest save keeps the editor and blocks another write until reload', async ({ page }) => {
  const fixture = await wiringFixture(page)
  let writes = 0
  await page.route('**/api/matchmaking/account', route => {
    if (route.request().method() === 'PUT') { writes++; return route.abort() }
    return route.fallback()
  })
  await page.goto('/matchmaking?mode=friends&preferences=true')
  await page.getByRole('button', { name: 'Edit interests', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Your interests', exact: true })
  await editor.getByRole('button', { name: 'Outdoors', exact: true }).click()
  await editor.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(editor.getByRole('alert')).toContainText('could not be confirmed')
  await expect(editor.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled()
  await expect(editor.getByRole('button', { name: 'Outdoors', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(fixture.getAccount().profile!.interests).not.toContain('Outdoors')
  expect(writes).toBe(1)
  await editor.getByRole('button', { name: 'Reload profile' }).click()
  await expect(editor.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled()
  expect(writes).toBe(1)
})

test('Dating can be paused inside preferences and an uncertain pause requires a readback', async ({ page }) => {
  await wiringFixture(page)
  await page.goto('/matchmaking?mode=dating')
  await page.getByRole('button', { name: 'Start Dating discovery', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Pause Dating', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Dating preferences', exact: true }).click()
  const preferences = page.getByRole('dialog', { name: 'Dating preferences', exact: true })
  let writes = 0
  await page.route('**/api/matchmaking/dating/enabled', route => { writes++; return route.abort() })
  await preferences.getByRole('button', { name: 'Pause Dating to edit', exact: true }).click()
  await expect(preferences.getByRole('button', { name: 'Reload Dating preferences', exact: true })).toBeVisible()
  await expect(preferences.getByRole('button', { name: 'Pause Dating to edit', exact: true })).toBeDisabled()
  expect(writes).toBe(1)
  await preferences.getByRole('button', { name: 'Reload Dating preferences', exact: true }).click()
  await expect(preferences.getByRole('button', { name: 'Pause Dating to edit', exact: true })).toBeEnabled()
  expect(writes).toBe(1)
  await page.unroute('**/api/matchmaking/dating/enabled')
  await preferences.getByRole('button', { name: 'Pause Dating to edit', exact: true }).click()
  await expect(preferences.getByRole('slider', { name: 'Distance', exact: true })).toBeEnabled()
  await expect(page).toHaveURL(/matchmaking\?mode=dating&preferences=true/)
})

test('Activity opened from Messages links back to Messages', async ({ page }) => {
  await wiringFixture(page)
  await page.goto('/messages')
  await page.getByRole('link', { name: 'Activity inbox' }).click()
  await page.getByRole('link', { name: 'Messages', exact: true }).and(page.locator('.account-back')).click()
  await expect(page).toHaveURL(/\/messages$/)
})
