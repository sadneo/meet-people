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
