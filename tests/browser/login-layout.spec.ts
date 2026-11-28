import { expect, test } from '@playwright/test'
import { wiringFixture } from './wiring-fixture'

for (const width of [320, 390, 714]) {
  test(`single-submit login fits ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await wiringFixture(page, { guest: true })
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Welcome to Pebble', exact: true })).toBeVisible()
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
    const signIn = page.getByRole('button', { name: 'Sign in', exact: true })
    const google = page.getByRole('button', { name: 'Continue with Google', exact: true })
    await expect(signIn).toHaveCSS('background-color', 'rgb(157, 80, 61)')
    await expect(google).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue with email' })).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const a = (await signIn.boundingBox())!, b = (await google.boundingBox())!
    expect(a.height).toBeGreaterThanOrEqual(49)
    expect(b.x).toBe(a.x)
    expect(b.width).toBe(a.width)
    await page.screenshot({ path: test.info().outputPath('single-submit-login.png'), fullPage: true })
  })
}

test('editing email clears old credentials and sign-in needs one submit without an email lookup', async ({ page }) => {
  const fixture = await wiringFixture(page, { guest: true })
  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto('/login?returnTo=%2Fevents')
  await page.getByLabel('Email', { exact: true }).fill('first@example.test')
  await page.getByLabel('Password', { exact: true }).fill('Old-account-password')
  await page.getByLabel('Email', { exact: true }).fill('development-fixture@example.test')
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('')
  await page.getByLabel('Password', { exact: true }).fill('Synthetic-fixture-password-1!')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/events$/)
  await expect(page.getByRole('heading', { name: 'Events', exact: true })).toBeVisible()
  expect(fixture.calls.filter(call => call.path === '/api/auth/email')).toHaveLength(0)
})

test('registration and recovery stay available without an email-check screen', async ({ page }) => {
  await wiringFixture(page, { guest: true })
  await page.goto('/login?returnTo=%2Fevents')
  await page.getByLabel('Email', { exact: true }).fill('new@example.test')
  await page.getByRole('button', { name: 'Email me a sign-in link', exact: true }).click()
  await expect(page.getByText('Check your inbox for your sign-in link.', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'New to Pebble? Create an account' }).click()
  expect(new URL(page.url()).searchParams.get('returnTo')).toBe('/events')
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('new@example.test')
  await page.getByLabel('Password', { exact: true }).fill('Draft-signup-password')
  await page.getByLabel('Confirm password', { exact: true }).fill('Draft-signup-password')
  await page.getByLabel('Email', { exact: true }).fill('updated@example.test')
  await expect(page).toHaveURL(/\/register\?/)
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('Confirm password', { exact: true })).toHaveValue('')
})

for (const journey of [
  { path: '/login', policy: '.auth-footer', label: 'Privacy', destination: '/privacy' },
  { path: '/register', policy: '.auth-consent', label: 'Privacy Policy', destination: '/privacy' },
  { path: '/auth/forgot-password', policy: '.auth-footer', label: 'Terms', destination: '/terms' },
]) {
  test(`policy round trip from ${journey.path} preserves the form and the original destination`, async ({ page }) => {
    await wiringFixture(page, { guest: true })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`${journey.path}?returnTo=%2Fevents`)
    await page.getByLabel('Email', { exact: true }).fill('development-fixture@example.test')
    await page.locator(journey.policy).getByRole('link', { name: journey.label, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(journey.destination + '$'))
    if (journey.path === '/register') {
      await page.getByRole('link', { name: 'Child safety standards' }).click()
      await expect(page).toHaveURL(/\/child-safety$/)
    }
    await page.locator('.legal-header').getByRole('link', { name: /^Back to/ }).click()
    if (journey.path === '/auth/forgot-password') {
      await page.screenshot({ path: test.info().outputPath('recovery-after-reading-terms.png') })
    }
    expect(new URL(page.url()).pathname).toBe(journey.path)
    expect(new URL(page.url()).searchParams.get('returnTo')).toBe('/events')
    await expect(page.getByLabel('Email', { exact: true })).toHaveValue('development-fixture@example.test')
    if (journey.path === '/login') {
      await page.getByLabel('Password', { exact: true }).fill('Synthetic-fixture-password-1!')
      await page.getByRole('button', { name: 'Sign in', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Events', exact: true })).toBeVisible()
    }
  })
}

test('reading Terms keeps a verified password reset form open', async ({ page }) => {
  await wiringFixture(page, { guest: true })
  await page.goto('/reset-password#access_token=browser-user-jwt&refresh_token=browser-refresh-fixture')
  const password = page.getByLabel('Password', { exact: true })
  await password.fill('New-reset-draft-1!')
  const policyTab = page.waitForEvent('popup')
  await page.locator('.auth-consent').getByRole('link', { name: 'Terms', exact: true }).click()
  const policy = await policyTab
  await expect(policy).toHaveURL(new URL('/terms', page.url()).href)
  await policy.close()
  await expect(page.getByRole('heading', { name: 'Set a new password' })).toBeVisible()
  await expect(password).toHaveValue('New-reset-draft-1!')
})
