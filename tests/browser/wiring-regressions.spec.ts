import { expect, test } from '@playwright/test'
import { wiringFixture } from './wiring-fixture'

test('later master-setting saves preserve concurrent privacy changes', async ({ page }) => {
  const fixture = await wiringFixture(page)
  await page.goto('/profile?section=notifications')
  fixture.getAccount().settings.discoverable = false
  await page.getByRole('switch', { name: 'Notifications', exact: true }).uncheck()
  await page.locator('.account-panel').filter({ has: page.getByRole('heading', { name: 'Activity notifications', exact: true }) }).getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Preferences saved.', { exact: true })).toBeVisible()
  expect(fixture.getAccount().settings.discoverable).toBe(false)
  await page.getByRole('switch', { name: 'Notifications', exact: true }).check()
  await page.locator('.account-panel').filter({ has: page.getByRole('heading', { name: 'Activity notifications', exact: true }) }).getByRole('button', { name: 'Save', exact: true }).click()
  await expect.poll(() => fixture.calls.filter(call => call.path.endsWith('/account') && call.method === 'PUT').length).toBe(2)
  await expect(page.getByText('Preferences saved.', { exact: true })).toBeVisible()
  expect(fixture.getAccount().settings.discoverable).toBe(false)
})

test('second profile save preserves a concurrent identity change merged by the first save', async ({ page }) => {
  const fixture = await wiringFixture(page)
  await page.goto('/profile')
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click()
  await expect(page.getByLabel('Display name', { exact: true })).toHaveValue('Sam')
  fixture.getAccount().profile!.display_name = 'Changed elsewhere'
  await page.getByLabel(/^Bio/).fill('First edit')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Edit profile', exact: true })).toBeVisible()
  expect(fixture.getAccount().profile!.display_name).toBe('Changed elsewhere')
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click()
  await expect(page.getByLabel('Display name', { exact: true })).toHaveValue('Changed elsewhere')
  await page.getByRole('textbox', { name: /^Bio/ }).fill('Second edit')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect.poll(() => fixture.calls.filter(call => call.path.endsWith('/account') && call.method === 'PUT').length).toBe(2)
  await expect(page.getByRole('button', { name: 'Edit profile', exact: true })).toBeVisible()
  expect(fixture.getAccount().profile!.display_name).toBe('Changed elsewhere')
})

test('a failed profile save retains the draft until an explicit account reload', async ({ page }) => {
  const fixture = await wiringFixture(page)
  let failing = true
  await page.route('**/api/matchmaking/account', route => failing && route.request().method() === 'PUT'
    ? route.fulfill({ status: 503, json: { code: 'unavailable', error: 'Save temporarily unavailable' } })
    : route.fallback())
  await page.goto('/profile')
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click()
  await page.getByLabel('Display name', { exact: true }).fill('My unsaved name')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByText(/Account save could not be confirmed/)).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Display name', exact: true })).toHaveValue('My unsaved name')
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled()
  await expect(page.getByText('Profile saved.', { exact: true })).toHaveCount(0)
  fixture.getAccount().profile!.display_name = 'New server name'
  failing = false
  await page.getByRole('button', { name: 'Reload account and replace draft before saving again' }).click()
  await expect(page.getByRole('textbox', { name: 'Display name', exact: true })).toHaveValue('New server name')
  await page.getByRole('textbox', { name: /^Bio/ }).fill('A fresh edit')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Edit profile', exact: true })).toBeVisible()
  expect(fixture.getAccount().profile!.display_name).toBe('New server name')
})

test('a failed settings save retains the draft until an explicit account reload', async ({ page }) => {
  const fixture = await wiringFixture(page)
  let failing = true
  await page.route('**/api/matchmaking/account', route => failing && route.request().method() === 'PUT'
    ? route.fulfill({ status: 503, json: { code: 'unavailable', error: 'Save temporarily unavailable' } })
    : route.fallback())
  await page.goto('/profile?section=notifications')
  await page.getByRole('switch', { name: 'Notifications', exact: true }).uncheck()
  await page.locator('.account-panel').filter({ has: page.getByRole('heading', { name: 'Activity notifications', exact: true }) }).getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText(/Account save could not be confirmed/)).toBeVisible()
  await expect(page.getByRole('switch', { name: 'Notifications', exact: true })).not.toBeChecked()
  await expect(page.locator('.account-panel').filter({ has: page.getByRole('heading', { name: 'Activity notifications', exact: true }) }).getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
  await expect(page.getByText('Preferences saved.', { exact: true })).toHaveCount(0)
  fixture.getAccount().settings.discoverable = false
  failing = false
  await page.getByRole('button', { name: 'Reload account and replace draft', exact: true }).click()
  await expect(page.getByRole('switch', { name: 'Notifications', exact: true })).toBeChecked()
  await page.getByRole('switch', { name: 'Notifications', exact: true }).uncheck()
  await page.locator('.account-panel').filter({ has: page.getByRole('heading', { name: 'Activity notifications', exact: true }) }).getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Preferences saved.', { exact: true })).toBeVisible()
  expect(fixture.getAccount().settings.discoverable).toBe(false)
})

for (const path of ['/reset-password', '/reset-password/', '/RESET-PASSWORD/', '/%72eset-password/']) {
  test(`password recovery retains recovery intent at ${path}`, async ({ page }) => {
    await wiringFixture(page, { guest: true })
    await page.goto(`${path}#access_token=browser-user-jwt&refresh_token=browser-refresh-fixture`)
    await expect(page.getByRole('heading', { name: 'Set a new password' })).toBeVisible()
    await expect(page).toHaveURL(new URL('/auth/callback', page.url()).href)
  })
}

test('a normalized recovery route still rejects an incomplete grant', async ({ page }) => {
  await wiringFixture(page, { guest: true })
  await page.goto('/RESET-PASSWORD/#access_token=browser-user-jwt')
  await expect(page.getByText('This link could not be verified. Request a new link.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Set a new password' })).toHaveCount(0)
  await expect(page).toHaveURL(new URL('/auth/callback', page.url()).href)
})
