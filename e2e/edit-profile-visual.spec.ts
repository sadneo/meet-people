import { expect, test } from '@playwright/test'
import { sharedProfileFixture } from './shared-profile-fixture'

const evidence = 'worktree/edit-profile-reference-reconciliation'
for (const [width, height] of [[320, 568], [390, 420], [390, 844], [760, 1440], [1440, 900]]) test(`focused Edit profile ${width}x${height}`, async ({ page }) => {
  const fixture = await sharedProfileFixture(page)
  await page.setViewportSize({ width, height })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/profile')
  const opener = page.getByRole('button', { name: 'Edit profile', exact: true })
  const editor = page.getByRole('dialog', { name: 'Edit your profile', exact: true })
  for (const action of ['Cancel', 'Close dialog', 'Escape']) {
    await opener.click()
    await expect(editor.getByRole('heading', { name: 'A little more you.' })).toBeVisible()
    await expect(editor.getByLabel('Display name')).toHaveValue('Canonical Sam')
    await expect(editor.getByLabel('Birthdate', { exact: true })).toHaveValue('2000-01-01')
    await expect(editor.getByLabel('City or campus area')).toHaveValue('Campus')
    await expect(editor.getByRole('table')).toHaveCount(0)
    await expect(editor.getByRole('group', { name: 'Interests', exact: true })).toHaveCount(0)
    await expect(editor.getByRole('button', { name: 'Save identity', exact: true })).toHaveCount(0)
    await expect(editor.getByRole('button', { name: 'Save profile', exact: true })).toBeEnabled()
    await editor.getByLabel('Display name').fill('Unsent profile draft')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    expect(await editor.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    for (const control of await editor.locator('button,input,textarea').all()) {
      const box = (await control.boundingBox())!
      expect(box.height).toBeGreaterThanOrEqual(44)
      expect(box.width).toBeGreaterThanOrEqual(44)
    }
    const save = editor.getByRole('button', { name: 'Save profile', exact: true })
    await expect(save).toBeInViewport()
    await expect(editor.getByRole('button', { name: 'Close dialog' })).toBeInViewport()
    if (action === 'Cancel') await page.screenshot({ path: `${evidence}/edit-${width}x${height}.png` })
    if (action === 'Escape') await page.keyboard.press('Escape')
    else await editor.getByRole('button', { name: action, exact: true }).click()
    await expect(editor).toHaveCount(0)
    await expect(opener).toBeFocused()
  }
  expect(fixture.calls.some(call => call.method !== 'GET' || /\/(queue|result)$/.test(call.path))).toBe(false)
  expect(fixture.external).toEqual([])
})

test('Save profile writes only changed facts, keeps exact usual preferences and persists both identity and facts', async ({ page }) => {
  const fixture = await sharedProfileFixture(page)
  const before = structuredClone(fixture.profile()!)
  await page.goto('/profile')
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Edit your profile', exact: true })
  await editor.getByLabel('Display name').fill('Updated Sam')
  await editor.getByLabel('Bio', { exact: true }).fill('A newly shared story.')
  await editor.getByLabel('Birthdate', { exact: true }).fill('2001-02-03')
  await editor.getByLabel('City or campus area').fill('North campus')
  await editor.getByRole('button', { name: 'Save profile', exact: true }).click()
  await expect(editor).toHaveCount(0)
  expect(fixture.calls.filter(call => call.method !== 'GET').map(call => call.path)).toEqual(['/api/matchmaking/account-profile', '/api/matchmaking/profile'])
  expect(fixture.profile()).toMatchObject({ display_name: 'Updated Sam', bio: 'A newly shared story.', birthdate: '2001-02-03', location_city: 'North campus', interests: before.interests, availability: before.availability })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Updated Sam', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click()
  await expect(editor.getByLabel('City or campus area')).toHaveValue('North campus')
  await expect(editor.getByLabel('Bio', { exact: true })).toHaveValue('A newly shared story.')
  expect(fixture.calls.some(call => /\/(queue|result)$/.test(call.path))).toBe(false)
  expect(fixture.external).toEqual([])
})

test('partial save is disclosed, retains draft and retries only unconfirmed details after read-only reload', async ({ page }) => {
  const fixture = await sharedProfileFixture(page)
  let fail = true, attempts = 0
  await page.route('**/api/matchmaking/profile', route => {
    if (route.request().method() === 'PUT') {
      attempts++
      if (fail) return route.fulfill({ status: 503, json: { code: 'unavailable', error: 'Details unavailable.' } })
      return route.fallback()
    }
    return route.fallback()
  })
  await page.goto('/profile')
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Edit your profile', exact: true })
  await editor.getByLabel('Display name').fill('Saved identity')
  await editor.getByLabel('City or campus area').fill('Pending campus')
  await editor.getByRole('button', { name: 'Save profile', exact: true }).click()
  await expect(editor).toContainText('Name and bio saved. The remaining details have not been confirmed.')
  await expect(editor.getByRole('alert')).toBeVisible()
  await expect(editor.getByRole('button', { name: 'Save profile', exact: true })).toBeDisabled()
  expect(fixture.account()!.display_name).toBe('Saved identity')
  expect(fixture.profile()!.location_city).toBe('Campus')
  fail = false
  await editor.getByRole('button', { name: 'Reload shared profile' }).click()
  await expect(editor.getByRole('button', { name: 'Save profile', exact: true })).toBeEnabled()
  await expect(editor.getByLabel('City or campus area')).toHaveValue('Pending campus')
  await editor.getByRole('button', { name: 'Save profile', exact: true }).click()
  await expect(editor).toHaveCount(0)
  expect(attempts).toBe(2)
  expect(fixture.calls.filter(call => call.path.endsWith('/account-profile') && call.method === 'PUT')).toHaveLength(1)
  expect(fixture.profile()!.location_city).toBe('Pending campus')
  expect(fixture.external).toEqual([])
})

test('exact windows remain editable inline on Profile with explicit save', async ({ page }) => {
  const fixture = await sharedProfileFixture(page)
  await page.goto('/profile')
  await page.getByText('Exact time windows (2)', { exact: true }).click()
  const exact = page.locator('.account-exact-times')
  await expect(exact.getByLabel('Start 1', { exact: true })).toHaveValue('09:15:00')
  await exact.getByLabel('Start 1', { exact: true }).fill('09:30:00')
  expect(fixture.calls.some(call => call.method !== 'GET')).toBe(false)
  await page.getByRole('button', { name: 'Save usual availability' }).click()
  await expect(page.getByRole('button', { name: 'Save usual availability' })).toHaveCount(0)
  expect(fixture.profile()!.availability[0]).toEqual({ dow: 2, start_time: '09:30:00', end_time: '11:45:00' })
  expect(fixture.calls.some(call => /\/(queue|result)$/.test(call.path))).toBe(false)
})
