import { expect, test } from '@playwright/test'
import { wiringFixture } from './wiring-fixture'

test('Find Friends offers setup actions when discovery or the saved search area is incomplete', async ({ page }) => {
  const fixture = await wiringFixture(page)
  fixture.getAccount().settings.discoverable = false
  await page.route('**/api/matchmaking/friends-search-preferences/runtime', route => route.fulfill({json:{available:true,policy:'nearby-first-v1',canJoin:false}}))
  await page.goto('/matchmaking')
  await page.getByRole('button', { name: 'Find Friends', exact: true }).click()
  const setup=page.getByRole('dialog', { name:'Get ready to find friends',exact:true })
  await expect(setup).toBeVisible()
  await expect(setup.getByRole('link',{name:'Review discovery settings'})).toHaveAttribute('href','/settings')
  await setup.getByRole('button',{name:'Review search area',exact:true}).click()
  await expect(page.getByRole('dialog',{name:'Friends preferences',exact:true})).toBeVisible()
  expect(fixture.getAccount().settings.discoverable).toBe(false)
  expect(fixture.calls.filter(call=>call.method==='POST'||call.method==='PUT'||call.method==='DELETE')).toHaveLength(0)
})

test('later master-setting saves preserve concurrent privacy changes', async ({ page }) => {
  const fixture = await wiringFixture(page)
  await page.goto('/settings')
  await expect(page.getByRole('switch', { name: 'Discovery', exact: true })).toBeChecked()
  fixture.getAccount().settings.discoverable = false
  await page.getByRole('switch', { name: 'Notifications', exact: true }).uncheck()
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click()
  await expect(page.getByText('Preferences saved.', { exact: true })).toBeVisible()
  expect(fixture.getAccount().settings.discoverable).toBe(false)
  await expect(page.getByRole('switch', { name: 'Discovery', exact: true })).not.toBeChecked()
  await page.getByRole('switch', { name: 'Share availability', exact: true }).uncheck()
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click()
  await expect.poll(() => fixture.calls.filter(call => call.path.endsWith('/account') && call.method === 'PUT').length).toBe(2)
  await expect(page.getByText('Preferences saved.', { exact: true })).toBeVisible()
  expect(fixture.getAccount().settings.discoverable).toBe(false)
})

test('second profile save preserves a concurrent identity change merged by the first save', async ({ page }) => {
  const fixture = await wiringFixture(page)
  await page.goto('/profile')
  await expect(page.getByLabel('Display name', { exact: true })).toHaveValue('Sam')
  fixture.getAccount().profile!.display_name = 'Changed elsewhere'
  await page.getByLabel('Bio', { exact: true }).fill('First edit')
  await page.getByRole('button', { name: 'Save profile', exact: true }).click()
  await expect(page.getByText('Profile saved.', { exact: true })).toBeVisible()
  expect(fixture.getAccount().profile!.display_name).toBe('Changed elsewhere')
  await expect(page.getByLabel('Display name', { exact: true })).toHaveValue('Changed elsewhere')
  await page.getByRole('textbox', { name: 'Bio', exact: true }).fill('Second edit')
  await page.getByRole('button', { name: 'Save profile', exact: true }).click()
  await expect.poll(() => fixture.calls.filter(call => call.path.endsWith('/account') && call.method === 'PUT').length).toBe(2)
  await expect(page.getByText('Profile saved.', { exact: true })).toBeVisible()
  expect(fixture.getAccount().profile!.display_name).toBe('Changed elsewhere')
})

test('a transient matching-profile outage can be retried from Friends without a queue write', async ({ page }) => {
  const fixture = await wiringFixture(page)
  let failing = true
  await page.route('**/api/matchmaking/profile', route => failing
    ? route.fulfill({ status: 503, json: { code: 'unavailable', error: 'Profile temporarily unavailable' } })
    : route.fallback())
  await page.goto('/matchmaking')
  await expect(page.getByText('Profile temporarily unavailable', { exact: true })).toBeVisible()
  failing = false
  await page.getByRole('button', { name: 'Refresh search status', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Find Friends', exact: true })).toBeEnabled()
  await expect(page.getByText('Profile temporarily unavailable', { exact: true })).toHaveCount(0)
  expect(fixture.calls.filter(call => call.path.endsWith('/queue') && call.method !== 'GET')).toHaveLength(0)
})

test('a failed profile save retains the draft until an explicit account reload', async ({ page }) => {
  const fixture = await wiringFixture(page)
  let failing = true
  await page.route('**/api/matchmaking/account', route => failing && route.request().method() === 'PUT'
    ? route.fulfill({ status: 503, json: { code: 'unavailable', error: 'Save temporarily unavailable' } })
    : route.fallback())
  await page.goto('/profile')
  await page.getByLabel('Display name', { exact: true }).fill('My unsaved name')
  await page.getByRole('button', { name: 'Save profile', exact: true }).click()
  await expect(page.getByText(/Account save could not be confirmed/)).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Display name', exact: true })).toHaveValue('My unsaved name')
  await expect(page.getByRole('button', { name: 'Save profile', exact: true })).toBeDisabled()
  await expect(page.getByText('Profile saved.', { exact: true })).toHaveCount(0)
  fixture.getAccount().profile!.display_name = 'New server name'
  failing = false
  await page.getByRole('button', { name: 'Reload account and replace draft before saving again' }).click()
  await expect(page.getByRole('textbox', { name: 'Display name', exact: true })).toHaveValue('New server name')
  await page.getByRole('textbox', { name: 'Bio', exact: true }).fill('A fresh edit')
  await page.getByRole('button', { name: 'Save profile', exact: true }).click()
  await expect(page.getByText('Profile saved.', { exact: true })).toBeVisible()
  expect(fixture.getAccount().profile!.display_name).toBe('New server name')
})

test('a failed settings save retains the draft until an explicit account reload', async ({ page }) => {
  const fixture = await wiringFixture(page)
  let failing = true
  await page.route('**/api/matchmaking/account', route => failing && route.request().method() === 'PUT'
    ? route.fulfill({ status: 503, json: { code: 'unavailable', error: 'Save temporarily unavailable' } })
    : route.fallback())
  await page.goto('/settings')
  await page.getByRole('switch', { name: 'Notifications', exact: true }).uncheck()
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click()
  await expect(page.getByText(/Account save could not be confirmed/)).toBeVisible()
  await expect(page.getByRole('switch', { name: 'Notifications', exact: true })).not.toBeChecked()
  await expect(page.getByRole('button', { name: 'Save preferences', exact: true })).toBeDisabled()
  await expect(page.getByText('Preferences saved.', { exact: true })).toHaveCount(0)
  fixture.getAccount().settings.discoverable = false
  failing = false
  await page.getByRole('button', { name: 'Reload account and replace draft', exact: true }).click()
  await expect(page.getByRole('switch', { name: 'Notifications', exact: true })).toBeChecked()
  await expect(page.getByRole('switch', { name: 'Discovery', exact: true })).not.toBeChecked()
  await page.getByRole('switch', { name: 'Share availability', exact: true }).uncheck()
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click()
  await expect(page.getByText('Preferences saved.', { exact: true })).toBeVisible()
  expect(fixture.getAccount().settings.discoverable).toBe(false)
})

for (const path of ['/reset-password', '/reset-password/', '/RESET-PASSWORD/', '/%72eset-password/']) {
  test(`password recovery retains recovery intent at ${path}`, async ({ page }) => {
    await wiringFixture(page, { guest: true })
    await page.goto(`${path}#access_token=browser-user-jwt&refresh_token=browser-refresh-fixture`)
    await expect(page.getByRole('heading', { name: 'Set a new password' })).toBeVisible()
    await expect(page).toHaveURL('http://127.0.0.1:3194/auth/callback')
  })
}

test('a normalized recovery route still rejects an incomplete grant', async ({ page }) => {
  await wiringFixture(page, { guest: true })
  await page.goto('/RESET-PASSWORD/#access_token=browser-user-jwt')
  await expect(page.getByText('This link could not be verified. Request a new link.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Set a new password' })).toHaveCount(0)
  await expect(page).toHaveURL('http://127.0.0.1:3194/auth/callback')
})
