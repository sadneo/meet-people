import assert from 'node:assert/strict'
import { randomUUID, randomBytes } from 'node:crypto'
import { URL } from 'node:url'
import process from 'node:process'
import console from 'node:console'
import { createClient } from '@supabase/supabase-js'
import { chromium, expect } from '@playwright/test'

const { fetch, AbortSignal } = globalThis
const origin = new URL(process.env.HOSTED_URL ?? '')
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_PUBLISHABLE_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
assert.equal(origin.protocol, 'https:')
assert.ok(url?.startsWith('https://') && key && serviceKey, 'Set hosted Supabase URL, public key, and service-role key.')
const options = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(url, serviceKey, options)
const password = randomBytes(24).toString('base64url')
const users = []
let browser
try {
  const registration = await createClient(url, key, options).auth.signUp({ email: `uninvited-${randomUUID()}@example.test`, password })
  if (registration.data.user) users.push(registration.data.user)
  assert.equal(registration.error?.code, 'signup_disabled', 'The beta must reject uninvited registration.')
  for (let index = 0; index < 2; index++) {
    const { data, error } = await admin.auth.admin.createUser({ email: `hosting-check-${randomUUID()}@example.test`, password, email_confirm: true })
    assert.ifError(error)
    users.push(data.user)
  }
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined })
  const page = await browser.newPage({ reducedMotion: 'reduce' })
  page.setDefaultTimeout(15000)
  const login = async email => {
    await page.goto(new URL('/login', origin).href)
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByRole('button', { name: 'Continue with email', exact: true }).click()
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  }
  await login(users[0].email)
  await expect(page).toHaveURL(/\/onboarding/)
  await page.getByLabel('Display name').fill('Hosted check')
  await page.getByLabel('A short bio').fill('Disposable hosted smoke account')
  await page.getByRole('button', { name: 'Complete chapter' }).click()
  await expect(page.getByRole('heading', { name: 'Interests', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Interests', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Coffee', exact: true }).click()
  await page.getByRole('button', { name: 'Complete chapter' }).click()
  await page.getByRole('group', { name: 'Social intent', exact: true }).getByRole('button').first().click()
  await page.getByRole('button', { name: 'Complete chapter' }).click()
  await page.getByRole('button', { name: 'Afternoons', exact: true }).click()
  await page.getByRole('button', { name: 'Complete chapter' }).click()
  await expect(page.getByRole('heading', { name: 'Your Pebble is ready.' })).toBeVisible()
  const first = createClient(url, key, options)
  const signedFirst = await first.auth.signInWithPassword({ email: users[0].email, password })
  assert.ifError(signedFirst.error)
  const persisted = await first.rpc('get_account')
  assert.ifError(persisted.error)
  assert.deepEqual(persisted.data.completed, [0, 1, 2, 3])
  await first.auth.signOut({ scope: 'local' })
  const other = createClient(url, key, options)
  const signed = await other.auth.signInWithPassword({ email: users[1].email, password })
  assert.ifError(signed.error)
  const privateRows = await other.from('account_settings').select('*')
  assert.ifError(privateRows.error)
  assert.deepEqual(privateRows.data, [], 'Another user cannot read private settings.')
  const snapshot = await fetch(new URL('/api/matchmaking/account', origin), {
    headers: { Authorization: `Bearer ${signed.data.session.access_token}` }, signal: AbortSignal.timeout(15000),
  })
  assert.equal(snapshot.status, 200)
  assert.equal((await snapshot.json()).profile, null, 'The API derives the profile from the caller, not another user.')
  await other.auth.signOut()
  await page.goto(new URL('/profile', origin).href)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Hosted check', exact: true })).toBeVisible()
  await page.goto(new URL('/settings', origin).href)
  await page.getByRole('region', { name: 'Account actions' }).getByRole('button', { name: 'Log out', exact: true }).click()
  await expect(page).toHaveURL(/\/login/)
  await login(users[1].email)
  await expect(page).toHaveURL(/\/onboarding/)
  await expect(page.getByLabel('Display name')).toHaveValue('')
  console.info('Hosted account check passed: invite-only auth, browser onboarding/resume, persistence, logout, account switching and private-data isolation.')
} finally {
  await browser?.close()
  for (const user of users) {
    const { error } = await admin.auth.admin.deleteUser(user.id)
    assert.ifError(error)
  }
}
