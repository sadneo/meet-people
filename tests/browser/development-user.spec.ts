import { expect, test, type Page } from '@playwright/test'
import { mockMatchingApi, mockMatchingSession } from './matchmaking-fixture'

async function developmentSignIn(page: Page) {
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Sign in as development user', exact: true }).click()
}

test('one-click development session uses normal SDK verification, readiness, signout, relogin and refresh', async ({ page }) => {
  await mockMatchingSession(page, false); await mockMatchingApi(page)
  await page.route('**/__dev/login', route => {
    expect(route.request().method()).toBe('POST')
    expect(route.request().postDataJSON()).toEqual({ intent: 'development-sign-in' })
    return route.fulfill({ json: { session: { access_token: 'browser-user-jwt', refresh_token: 'browser-refresh-fixture', expires_in: 3600, token_type: 'bearer', user: { id: 'a0000000-0000-4000-8000-000000000001' } } } })
  })
  const writes: string[] = []
  page.on('request', request => { if (request.url().includes('/api/') && request.method() !== 'GET') writes.push(request.url()) })
  await page.goto('/login')
  await developmentSignIn(page)
  await expect(page).toHaveURL('/settings')
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Complete onboarding', exact: true })).toHaveCount(0)
  await page.getByRole('region', { name: 'Account actions' }).getByRole('button', { name: 'Log out', exact: true }).click()
  await expect(page).toHaveURL('/login?returnTo=%2Fsettings')
  await developmentSignIn(page)
  await expect(page).toHaveURL('/settings')
  // The fixture module explicitly represents SDK persistence on reload.
  await mockMatchingSession(page, true); await page.reload()
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  expect(writes).toEqual([])
  expect(await page.evaluate(() => JSON.stringify(localStorage).includes('Synthetic-fixture-password'))).toBe(false)
})

test('unprovisioned development user is not seeded or admitted by the option', async ({ page }) => {
  await mockMatchingSession(page, false); await mockMatchingApi(page)
  await page.route('**/__dev/login', route => route.fulfill({ status: 503, json: { error: 'Development provisioning unavailable.' } }))
  const writes: string[] = []
  page.on('request', request => { if (request.url().includes('/api/') && request.method() !== 'GET') writes.push(request.url()) })
  await page.goto('/login')
  await developmentSignIn(page)
  await expect(page.getByRole('alert')).toContainText('The development account is not ready')
  await expect(page).toHaveURL('/login')
  await expect(page.locator('.pt-app')).toHaveCount(0)
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0)
  expect(writes).toEqual([])
})
