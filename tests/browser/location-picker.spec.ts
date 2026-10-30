import { expect, test } from '@playwright/test'
import { wiringFixture } from './wiring-fixture'
import { mockLocationPicker } from './location-picker-fixture'

for (const mode of ['friends', 'dating'] as const) for (const width of [320, 390, 1440])
  test(`${mode} map picker confirms a general area at ${width}px without changing Profile or participation`, async ({ page }, testInfo) => {
    const fixture = await wiringFixture(page), maps = await mockLocationPicker(page)
    await page.setViewportSize({ width, height: 844 })
    await page.goto(`/matchmaking?mode=${mode}&preferences=true`)
    await page.getByRole('button', { name: /Search area Campus/ }).click()
    const picker = page.getByRole('region', { name: 'Choose search area' })
    await expect(picker.getByRole('button', { name: 'Use my current location' })).toBeVisible()
    await expect(picker.getByRole('button', { name: 'Set search area' })).toBeDisabled()
    const input = picker.getByRole('combobox', { name: 'Search city or neighborhood' })
    await input.fill('Upper Manhattan')
    await expect(picker.getByRole('option')).toHaveCount(1)
    await input.press('ArrowDown'); await input.press('Enter')
    await expect(picker.locator('.location-chosen')).toHaveText('Upper Manhattan, NY')
    expect(maps.calls.filter(call => call.path.endsWith('/map/confirm'))).toHaveLength(0)
    expect(fixture.calls.filter(call => call.method === 'PUT')).toHaveLength(0)
    expect(await picker.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('location-picker-synthetic-map.png') })
    await picker.getByRole('button', { name: 'Set search area' }).click()
    await expect(picker).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Search area Upper Manhattan, NY' })).toBeVisible()
    const writes = fixture.calls.filter(call => call.method === 'PUT')
    expect(writes).toHaveLength(1)
    expect(writes[0].path).toContain(mode === 'friends' ? '/friends-search-preferences' : '/dating-preferences')
    expect(fixture.getAccount().profile?.location_city).toBe('Campus')
    expect(fixture.calls.filter(call => call.path.endsWith('/dating/enabled') || call.path.endsWith('/queue'))).toHaveLength(0)
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await page.getByRole('button', { name: mode === 'friends' ? 'Friends preferences' : 'Dating preferences', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Search area Upper Manhattan, NY' })).toBeVisible()
  })

test('cancel and Escape discard preview changes and restore focus; GPS is never requested on open', async ({ page }) => {
  const fixture = await wiringFixture(page), maps = await mockLocationPicker(page)
  await page.addInitScript(() => Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition() { throw new Error('Unrequested GPS read') } } }))
  await page.goto('/matchmaking?preferences=true')
  const trigger = page.getByRole('button', { name: /Search area Campus/ })
  await trigger.click()
  await page.getByRole('combobox', { name: 'Search city or neighborhood' }).fill('Brooklyn')
  await page.getByRole('button', { name: 'Brooklyn, NY', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Set search area' })).toBeEnabled()
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  expect(maps.calls.filter(call => call.path.endsWith('/map/confirm'))).toHaveLength(0)
  expect(fixture.calls.filter(call => call.method === 'PUT')).toHaveLength(0)
})

test('map movement invalidates the old label and saves the exact chosen point only after confirmation', async ({ page }) => {
  const fixture = await wiringFixture(page), maps = await mockLocationPicker(page)
  await page.goto('/matchmaking?preferences=true')
  await page.getByRole('button', { name: /Search area Campus/ }).click()
  await expect(page.getByRole('combobox', { name: 'Search city or neighborhood' })).toBeEnabled()
  const center = { latitude: 40.7123, longitude: -73.9234 }
  await page.evaluate(center => (window as unknown as { __moveTestMap: (point: typeof center) => void }).__moveTestMap(center), center)
  await expect(page.getByRole('button', { name: 'Set search area' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Set search area' })).toBeEnabled()
  expect(maps.calls.filter(call => call.path.endsWith('/map/preview')).at(-1)?.body).toMatchObject({ kind: 'pin', center, deviceAssisted: false })
  expect(fixture.calls.filter(call => call.method === 'PUT')).toHaveLength(0)
  await page.getByRole('button', { name: 'Set search area' }).click()
  await expect(page.getByRole('button', { name: 'Search area Brooklyn, NY' })).toBeVisible()
})

test('current location is an explicit centering action and still needs confirmation', async ({ page }) => {
  const fixture = await wiringFixture(page), maps = await mockLocationPicker(page)
  fixture.getAccount().settings.location = true
  await page.context().grantPermissions(['geolocation'])
  await page.context().setGeolocation({ latitude: 40.7, longitude: -73.9, accuracy: 30 })
  await page.goto('/matchmaking?preferences=true')
  await page.getByRole('button', { name: /Search area Campus/ }).click()
  await page.getByRole('button', { name: 'Use my current location' }).click()
  await expect(page.getByRole('button', { name: 'Set search area' })).toBeEnabled()
  expect(maps.calls.filter(call => call.path.endsWith('/map/preview')).at(-1)?.body).toMatchObject({ kind: 'pin', deviceAssisted: true, center: { latitude: 40.7, longitude: -73.9 } })
  expect(fixture.calls.filter(call => call.method === 'PUT')).toHaveLength(0)
})

test('missing configuration is an honest unavailable state, not a fake map', async ({ page }) => {
  await wiringFixture(page); await mockLocationPicker(page, { available: false })
  await page.goto('/matchmaking?preferences=true')
  await page.getByRole('button', { name: /Search area Campus/ }).click()
  await expect(page.getByRole('alert')).toHaveText('Map search is not configured yet.')
  await expect(page.getByRole('button', { name: 'Set search area' })).toBeDisabled()
  await expect(page.getByText('Synthetic map (browser test)')).toHaveCount(0)
})

test('device opt-out leaves manual search available', async ({ page }) => {
  const fixture = await wiringFixture(page), maps = await mockLocationPicker(page)
  fixture.getAccount().settings.location = false
  await page.goto('/matchmaking?preferences=true')
  await page.getByRole('button', { name: /Search area Campus/ }).click()
  await page.getByRole('button', { name: 'Use my current location' }).click()
  await expect(page.getByRole('alert')).toContainText('Enable location access')
  expect(maps.calls.filter(call => call.path.endsWith('/map/preview'))).toHaveLength(0)
  await page.getByRole('combobox', { name: 'Search city or neighborhood' }).fill('Brooklyn')
  await page.getByRole('button', { name: 'Brooklyn, NY', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Set search area' })).toBeEnabled()
})

test('denied device permission does not block choosing an area manually', async ({ page }) => {
  const fixture = await wiringFixture(page); await mockLocationPicker(page)
  fixture.getAccount().settings.location = true
  await page.addInitScript(() => Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition(_success: unknown, fail: (error: unknown) => void) { fail({ code: 1, message: 'Permission denied' }) } } }))
  await page.goto('/matchmaking?preferences=true')
  await page.getByRole('button', { name: /Search area Campus/ }).click()
  await page.getByRole('button', { name: 'Use my current location' }).click()
  await expect(page.getByRole('alert')).toContainText('device location is unavailable')
  await expect(page.getByRole('combobox', { name: 'Search city or neighborhood' })).toBeEnabled()
  await page.getByRole('combobox', { name: 'Search city or neighborhood' }).fill('Brooklyn')
  await page.getByRole('button', { name: 'Brooklyn, NY', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Set search area' })).toBeEnabled()
})

test('a stale area response cannot overwrite a newer map selection', async ({ page }) => {
  await wiringFixture(page); await mockLocationPicker(page)
  let release!: () => void
  const waiting = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/matchmaking/search-locations/map/preview', async route => {
    const body = route.request().postDataJSON()
    if (body.kind === 'place') { await waiting; return route.fulfill({ json: { center: { latitude: 41, longitude: -74 }, areaLabel: 'Stale area, NY', expiresAt: '2099-01-01T00:00:00Z', ticket: { payload: '{}', signature: 'a'.repeat(64) } } }).catch(() => {}) }
    return route.fallback()
  })
  await page.goto('/matchmaking?preferences=true')
  await page.getByRole('button', { name: /Search area Campus/ }).click()
  await page.getByRole('combobox', { name: 'Search city or neighborhood' }).fill('Upper Manhattan')
  const started = page.waitForRequest('**/map/preview')
  await page.getByRole('button', { name: 'Upper Manhattan, NY', exact: true }).click()
  await started
  await page.evaluate(() => (window as unknown as { __moveTestMap: (point: { latitude: number; longitude: number }) => void }).__moveTestMap({ latitude: 40.7, longitude: -73.9 }))
  await expect(page.locator('.location-chosen')).toHaveText('Brooklyn, NY')
  release()
  await expect(page.locator('.location-chosen')).toHaveText('Brooklyn, NY')
  await expect(page.getByText('Stale area, NY')).toHaveCount(0)
})

test('a conflicting save stays in the picker and requires explicit preference reconciliation', async ({ page }) => {
  const fixture = await wiringFixture(page); await mockLocationPicker(page)
  let writes = 0
  await page.route('**/api/matchmaking/friends-search-preferences', route => {
    if (route.request().method() !== 'PUT') return route.fallback()
    writes++; return route.fulfill({ status: 409, json: { code: 'conflict', error: 'Changed elsewhere.' } })
  })
  await page.goto('/matchmaking?preferences=true')
  await page.getByRole('button', { name: /Search area Campus/ }).click()
  await page.getByRole('combobox', { name: 'Search city or neighborhood' }).fill('Brooklyn')
  await page.getByRole('button', { name: 'Brooklyn, NY', exact: true }).click()
  await page.getByRole('button', { name: 'Set search area' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Go back and reload' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Set search area' })).toBeDisabled()
  expect(writes).toBe(1)
  await page.getByRole('button', { name: 'Back to preferences' }).click()
  await expect(page.getByRole('button', { name: 'Reload saved data' })).toBeVisible()
  expect(fixture.getAccount().profile?.location_city).toBe('Campus')
})
