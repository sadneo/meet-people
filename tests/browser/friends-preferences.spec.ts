import { expect, test } from '@playwright/test'
import { sharedProfileFixture } from './shared-profile-fixture'

for (const size of [{ width: 320, height: 844 }, { width: 390, height: 844 }, { width: 1440, height: 900 }, { width: 390, height: 420 }]) {
  test(`canonical Friends filters and pending readback at ${size.width}x${size.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(size)
    const fixture = await sharedProfileFixture(page)
    let wrote = false, release!: () => void
    const pending = new Promise<void>(done => { release = done })
    await page.route('**/api/matchmaking/friends-search-preferences', async route => {
      if (route.request().method() === 'PUT') wrote = true
      else if (wrote) await pending
      await route.fallback()
    })
    await page.goto('/matchmaking')
    const original = structuredClone(fixture.unified()), originalProfile = structuredClone(fixture.profile())
    const opener = page.getByRole('button', { name: 'Preferences', exact: true })
    await opener.click()
    const sheet = page.getByRole('dialog', { name: 'Your kind of connection.' })
    await expect(sheet.getByText(/No Friends filter choices stored/)).toBeVisible()
    await expect(sheet.getByRole('button', { name: 'Meet new people', exact: true })).toHaveAttribute('aria-pressed', 'false')
    await sheet.getByRole('slider', { name: 'Maximum distance in miles' }).fill('44')
    await sheet.getByRole('slider', { name: 'Maximum age' }).fill('55')
    await sheet.getByRole('radio', { name: 'Temporary search area', exact: true }).check()
    await sheet.getByLabel('Temporary city or campus', { exact: true }).fill(' Unresolved synthetic campus ')
    await sheet.getByLabel('Custom friendship goal', { exact: true }).fill(' Exact custom goal 🪨 ')
    await sheet.getByRole('button', { name: 'Add goal', exact: true }).click()
    await page.screenshot({ path: testInfo.outputPath('friends-canonical-draft.png') })
    await sheet.getByRole('button', { name: 'Save Friends filters', exact: true }).click()
    await expect(sheet.getByRole('button', { name: 'Close filters' })).toBeDisabled()
    await expect(sheet.getByRole('button', { name: 'Reload saved Friends filters' })).toBeDisabled()
    await page.keyboard.press('Escape'); await expect(sheet).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('friends-pending-readback.png') })
    release()
    await expect(sheet).toHaveCount(0); await expect(opener).toBeFocused()
    await page.reload(); await opener.click()
    await expect(sheet.getByRole('slider', { name: 'Maximum distance in miles' })).toHaveValue('44')
    await expect(sheet.getByRole('slider', { name: 'Maximum age' })).toHaveValue('55')
    await expect(sheet.getByLabel('Temporary city or campus', { exact: true })).toHaveValue(' Unresolved synthetic campus ')
    await expect(sheet.getByRole('button', { name: /Exact custom goal/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(sheet.getByText(/Saved filters are not applied to the current queue/)).toBeVisible()
    await sheet.getByRole('button', { name: 'Save Friends filters', exact: true }).scrollIntoViewIfNeeded()
    await expect(sheet.getByRole('button', { name: 'Save Friends filters', exact: true })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('friends-canonical-reloaded.png') })
    expect(await sheet.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    const box = (await sheet.boundingBox())!
    expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(size.height)
    expect(fixture.unified()).toEqual(original); expect(fixture.profile()).toEqual(originalProfile)
    expect(fixture.calls.filter(call => call.method !== 'GET')).toEqual([{ path: '/api/matchmaking/friends-search-preferences', method: 'PUT', body: { expectedRevision: 0, preferences: { ageMin: 18, ageMax: 55, radiusMiles: 44, goals: [' Exact custom goal 🪨 '], searchArea: { source: 'temporary', areaLabel: ' Unresolved synthetic campus ', resolvedLocationRef: null } } } }])
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Find Friends', exact: true })).toBeEnabled()
    await expect(page.getByText('Size is a visual preference. Searches suggest one person.', { exact: true })).toBeVisible()
    expect(fixture.external).toEqual([])
  })
}
for (const width of [320, 1440]) {
  test(`Friends filter dependency unavailable at ${width} does not disable the existing queue setup`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 })
    const fixture = await sharedProfileFixture(page, { friends: 'unavailable' })
    await page.goto('/matchmaking')
    await page.getByRole('button', { name: 'Preferences', exact: true }).click()
    const sheet = page.getByRole('dialog')
    await expect(sheet.getByRole('alert')).toContainText('Friends filters are unavailable')
    await expect(sheet.getByRole('slider')).toHaveCount(0)
    await expect(sheet.getByRole('button', { name: 'Save Friends filters' })).toBeDisabled()
    await page.screenshot({ path: testInfo.outputPath('friends-canonical-unavailable.png') })
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Find Friends', exact: true })).toBeEnabled()
    expect(fixture.calls.every(call => call.method === 'GET')).toBe(true)
    expect(fixture.external).toEqual([])
  })
}
for (const failure of ['conflict', 'readback'] as const) {
  test(`Friends ${failure} requires read-only reconciliation, not retry`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const fixture = await sharedProfileFixture(page)
    let attempts = 0, wrote = false, allowRead = false
    await page.route('**/api/matchmaking/friends-search-preferences', route => {
      if (route.request().method() === 'PUT') {
        attempts++; wrote = true
        if (failure === 'conflict') return route.fulfill({ status: 409, json: { code: 'conflict', error: 'Synthetic conflict' } })
      } else if (wrote && !allowRead && failure === 'readback') return route.fulfill({ status: 503, json: { code: 'provider', error: 'Synthetic lost readback' } })
      return route.fallback()
    })
    await page.goto('/matchmaking'); await page.getByRole('button', { name: 'Preferences', exact: true }).click()
    const sheet = page.getByRole('dialog')
    await sheet.getByRole('slider', { name: 'Maximum distance in miles' }).fill('77')
    await sheet.getByRole('button', { name: 'Save Friends filters' }).click()
    await expect(sheet.getByRole('alert')).toContainText(failure === 'conflict' ? 'Friends filters changed' : 'could not be confirmed')
    await expect(sheet.getByRole('slider', { name: 'Maximum distance in miles' })).toHaveValue('77')
    await expect(sheet.getByRole('button', { name: 'Save Friends filters' })).toBeDisabled()
    await page.screenshot({ path: testInfo.outputPath(`friends-${failure}.png`) })
    allowRead = true
    await sheet.getByRole('button', { name: 'Reload saved Friends filters' }).click()
    await expect(sheet.getByRole('button', { name: 'Save Friends filters' })).toBeEnabled()
    await expect(sheet.getByRole('slider', { name: 'Maximum distance in miles' })).toHaveValue(failure === 'conflict' ? '15' : '77')
    expect(attempts).toBe(1)
    expect(fixture.external).toEqual([])
  })
}
test('custom goals survive uncheck and mobile drag Cancel discards edits without writes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const fixture = await sharedProfileFixture(page, { friends: 'custom' })
  await page.goto('/matchmaking')
  const opener = page.getByRole('button', { name: 'Preferences', exact: true })
  await opener.click()
  const sheet = page.getByRole('dialog'), custom = sheet.getByRole('button', { name: /Exact custom goal/ })
  await custom.click(); await expect(custom).toHaveAttribute('aria-pressed', 'false')
  await custom.click(); await expect(custom).toHaveAttribute('aria-pressed', 'true')
  await sheet.getByRole('slider', { name: 'Maximum distance in miles' }).fill('99')
  const pull = async (amount: number) => {
    await sheet.evaluate(element => { element.scrollTop = 0 })
    const box = (await sheet.locator('.mfs-header h2').boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + amount, { steps: 8 }); await page.mouse.up()
  }
  await pull(60); await expect(sheet).toBeVisible()
  await pull(120); await expect(sheet).toHaveCount(0); await expect(opener).toBeFocused()
  await opener.click(); await expect(sheet.getByRole('slider', { name: 'Maximum distance in miles' })).toHaveValue('10')
  expect(fixture.calls.every(call => call.method === 'GET')).toBe(true)
  expect(fixture.external).toEqual([])
})
