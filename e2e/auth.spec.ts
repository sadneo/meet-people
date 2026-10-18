import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

try { process.loadEnvFile('.env.local') } catch { /* CI supplies environment directly. */ }
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const local = Boolean(url && key && ['127.0.0.1', 'localhost'].includes(new URL(url).hostname))
test.use({ actionTimeout: 10000, reducedMotion: 'reduce' })

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
test(`new account onboarding, blank avatar, profile/settings persistence and account switching at ${viewport.width}px`, async ({ page }) => {
  test.setTimeout(90000)
  test.skip(!local, 'Requires local Supabase and ignored .env.local server credentials.')
  await page.setViewportSize(viewport)
  const admin = createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } })
  const password = 'auth-browser-test-password'
  const users: { id: string; email: string }[] = []
  try {
    for (let i = 0; i < 2; i++) {
      const email = `browser-${randomUUID()}@example.test`
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
      if (error) throw error
      users.push({ id: data.user.id, email })
    }
    const login = async (email: string) => {
      await page.goto('/login')
      await page.getByLabel('Email', { exact: true }).fill(email)
      await page.getByRole('button', { name: 'Continue with email', exact: true }).click()
      await page.getByLabel('Password', { exact: true }).fill(password)
      await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    }
    await login(users[0].email)
    await expect(page).toHaveURL(/\/onboarding/)
    await page.getByLabel('Display name').fill('My Student')
    await page.getByLabel('A short bio').fill('My own bio')
    await page.getByRole('button', { name: 'Complete chapter' }).click()
    await expect(page.getByRole('heading', { name: 'Interests', exact: true })).toBeVisible()
    // Reload mid-onboarding: saved steps and profile must be restored.
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Interests', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Coffee', exact: true }).click()
    await page.getByRole('button', { name: 'Complete chapter' }).click()
    await page.getByRole('group', { name: 'Social intent', exact: true }).getByRole('button').first().click()
    await page.getByRole('button', { name: 'Complete chapter' }).click()
    await page.getByRole('button', { name: 'Afternoons', exact: true }).click()
    await page.getByRole('button', { name: 'Complete chapter' }).click()
    await expect(page.getByRole('heading', { name: 'Your Pebble is ready.' })).toBeVisible()
    await page.getByRole('button', { name: 'Enter Pebble' }).click()
    await page.goto('/profile')
    await expect(page.getByRole('heading', { name: 'My Student', exact: true })).toBeVisible()
    await expect(page.getByRole('img', { name: 'My Student profile picture not set' }).first()).toBeVisible()
    await page.getByRole('button', { name: 'Edit profile' }).click()
    const bio = page.getByRole('dialog').getByRole('textbox', { name: 'Bio', exact: true })
    await expect(bio).toBeEnabled()
    await expect(bio).toBeVisible()
    await bio.fill('Persisted personal bio')
    await page.getByRole('button', { name: 'Save profile', exact: true }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
    await page.goto('/settings')
    await page.getByRole('switch', { name: 'Plan & message notifications' }).click()
    await expect(page.getByRole('switch', { name: 'Plan & message notifications' })).not.toBeChecked()
    await expect(page.getByRole('switch', { name: 'Plan & message notifications' })).toBeEnabled()
    await page.reload()
    await expect(page.getByRole('switch', { name: 'Plan & message notifications' })).not.toBeChecked()
    await page.getByRole('button', { name: 'Account details' }).click()
    await expect(page.getByRole('dialog')).toContainText(users[0].email)
    await page.getByRole('button', { name: 'Close dialog' }).click()
    const rows = await admin.from('profiles').select('display_name,bio,avatar_url').eq('id', users[0].id).single()
    expect(rows.error).toBeNull()
    expect(rows.data).toEqual({ display_name: 'My Student', bio: 'Persisted personal bio', avatar_url: null })
    const settings = await admin.from('account_settings').select('completed,settings').eq('user_id', users[0].id).single()
    expect(settings.data?.completed).toEqual([0, 1, 2, 3])
    expect(settings.data?.settings.notifications).toBe(false)
    await page.getByRole('region', { name: 'Account actions' }).getByRole('button', { name: 'Log out', exact: true }).click()
    await expect(page).toHaveURL(/\/login/)
    await login(users[1].email)
    await expect(page).toHaveURL(/\/onboarding/)
    await expect(page.getByLabel('Display name')).toHaveValue('')
    await expect(page.getByLabel('A short bio')).toHaveValue('')
    await page.getByRole('button', { name: 'Log out', exact: true }).click()
    await expect(page).toHaveURL(/\/login/)
    await login(users[0].email)
    await expect(page).toHaveURL(new URL('/', page.url()).href)
    await page.goto('/profile')
    await expect(page.getByRole('heading', { name: 'My Student', exact: true })).toBeVisible()
    await expect(page.getByText('Persisted personal bio', { exact: true })).toBeVisible()
  } finally {
    for (const user of users) { const { error } = await admin.auth.admin.deleteUser(user.id); expect(error).toBeNull() }
  }
})
}

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
test(`progressive registration, retry, recovery and callback errors at ${viewport.width}px`, async ({ page }) => {
  test.setTimeout(90000)
  test.skip(!local, 'Requires local Supabase and ignored .env.local server credentials.')
  await page.setViewportSize(viewport)
  const admin = createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } })
  const email = `progressive-${randomUUID()}@example.test`
  const password = 'progressive-browser-password'
  let userId: string | undefined
  try {
    await page.goto('/auth/callback?error=access_denied&error_description=technical-provider-error')
    await expect(page.getByText(/Sign-in did not complete/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeEnabled()
    await expect(page.getByText('technical-provider-error')).toHaveCount(0)
    await page.goto('/reset-password#error=access_denied&error_description=expired')
    await expect(page.getByText(/recovery link is invalid or expired/)).toBeVisible()

    await page.goto('/login?returnTo=%2Fevents')
    await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0)
    await page.getByLabel('Email', { exact: true }).fill('invalid-email')
    await page.getByRole('button', { name: 'Continue with email' }).click()
    await expect(page.getByRole('heading', { name: 'Welcome to Pebble' })).toBeVisible()
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('Email', { exact: true }).press('Enter')
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeFocused()
    await expect(page.getByText(email, { exact: true })).toBeVisible()
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Show password' }).click()
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text')
    await page.getByRole('button', { name: 'Hide password' }).click()
    await page.getByLabel('Confirm password').fill('different-password')
    await page.getByLabel('Confirm password').press('Enter')
    await expect(page.getByText(/Passwords do not match/)).toBeVisible()
    await page.getByLabel('Confirm password').fill(password)
    const signup = page.waitForResponse(response => response.url().includes('/auth/v1/signup') && response.request().method() === 'POST')
    await page.getByLabel('Confirm password').press('Enter')
    const registered = await (await signup).json()
    userId = registered.id ?? registered.user?.id
    expect(userId).toBeTruthy()
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
    await expect(page.getByText(/Check your email to confirm/)).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
    const confirmed = await admin.auth.admin.updateUserById(userId!, { email_confirm: true })
    expect(confirmed.error).toBeNull()

    await page.getByRole('button', { name: 'Back to sign in' }).click()
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeFocused()
    await page.getByLabel('Password', { exact: true }).fill('incorrect-password')
    await page.getByLabel('Password', { exact: true }).press('Enter')
    await expect(page.getByText('Incorrect email or password. Please try again.')).toBeVisible()
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue('incorrect-password')
    await page.getByRole('button', { name: 'Change', exact: true }).click()
    await expect(page.getByLabel('Email', { exact: true })).toHaveValue(email)
    await page.goBack()
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue('incorrect-password')
    await page.getByRole('link', { name: 'Forgot password?' }).click()
    await expect(page.getByLabel('Email', { exact: true })).toHaveValue(email)
    await page.getByLabel('Email', { exact: true }).press('Enter')
    await expect(page.getByText(new RegExp(`If ${email} has an account`))).toBeVisible()

    // Use a genuine recovery session, without relying on external email delivery.
    const recovery = await admin.auth.admin.generateLink({ type: 'recovery', email })
    expect(recovery.error).toBeNull()
    const actor = createClient(url!, process.env.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
    const verified = await actor.auth.verifyOtp({ token_hash: recovery.data.properties.hashed_token, type: 'recovery' })
    expect(verified.error).toBeNull()
    const session = verified.data.session!
    const hash = new URLSearchParams({ access_token: session.access_token, refresh_token: session.refresh_token, expires_in: String(session.expires_in), token_type: 'bearer', type: 'recovery' })
    await page.goto(`/reset-password?returnTo=%2Fevents#${hash}`)
    await page.getByLabel('Password', { exact: true }).fill(`${password}-updated`)
    await page.getByLabel('Confirm password').fill(`${password}-updated`)
    await page.getByLabel('Confirm password').press('Enter')
    await expect(page.getByText('Your password has been updated.')).toBeVisible()
    await page.getByRole('link', { name: 'Continue to Pebble' }).click()
    await expect(page).toHaveURL(/\/onboarding\?returnTo=%2Fevents/)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  } finally {
    if (userId) expect((await admin.auth.admin.deleteUser(userId)).error).toBeNull()
  }
})
}

test('email entry remains usable across shell breakpoints and short screens', async ({ page }) => {
  for (const viewport of [{ width: 320, height: 568 }, { width: 799, height: 600 }, { width: 800, height: 600 }, { width: 801, height: 600 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport)
    await page.goto('/login')
    await expect(page.getByRole('button', { name: 'Continue with email' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.getByLabel('Email', { exact: true }).focus()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Continue with email' })).toBeFocused()
  }
})
