import { expect, test, type Page } from '@playwright/test'
import { mockMatchingApi } from './matchmaking-fixture'

async function credentialsFixture(page: Page, anonymous = false, signedIn = true) {
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin !== 'http://127.0.0.1:3194') return route.abort()
    if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 503, json: { code: 'unavailable', error: 'Isolated boundary.' } })
    return route.continue()
  })
  await mockMatchingApi(page)
  await page.route('**/src/supabase.ts', route => route.fulfill({ contentType: 'application/javascript', body: `
    let user = { id: 'fixture-actor', email: ${anonymous ? 'undefined' : "'fixture@example.test'"}, email_confirmed_at: ${anonymous ? 'undefined' : "'2026-10-01'"}, is_anonymous: ${anonymous} };
    let session = ${signedIn} ? { access_token: 'fixture-access', user } : null;
    const listeners = new Set(); let storedPassword = 'Fixture-password-1!';
    let release;
    const control = window.credentialFixture = { calls: [], fail: '', hold: '', release() { release?.(); }, confirm() { user = { ...user, email: user.new_email, new_email: undefined, is_anonymous: false, email_confirmed_at: '2026-10-14' }; }, switchActor() { user = { ...user, id: 'other-actor', email: 'other@example.test' }; session = { ...session, user }; emit('SIGNED_IN'); } };
    async function hold(kind) { if (control.hold === kind) await new Promise(resolve => { release = resolve; }); }
    function emit(event) { for (const callback of listeners) callback(event, session); }
    export const supabase = { auth: {
      onAuthStateChange(callback) { listeners.add(callback); queueMicrotask(() => { if (listeners.has(callback)) callback('INITIAL_SESSION', session); }); return { data: { subscription: { unsubscribe() { listeners.delete(callback); } } } }; },
      getSession: async () => { control.calls.push({ kind: 'getSession' }); return { data: { session }, error: null }; },
      getUser: async () => { control.calls.push({ kind: 'getUser' }); return { data: { user: session ? user : null }, error: null }; },
      updateUser: async (attributes) => {
        control.calls.push({ kind: 'update', email: !!attributes.email, password: !!attributes.password, nonce: attributes.nonce === '123456' });
        if (control.fail) { const code = control.fail; control.fail = ''; return { error: { code, message: 'PRIVATE PROVIDER DIAGNOSTIC' } }; }
        if (attributes.email) user = { ...user, new_email: attributes.email };
        if (attributes.password) storedPassword = attributes.password;
        return { data: { user }, error: null };
      },
      reauthenticate: async () => { control.calls.push({ kind: 'reauth' }); return { error: null }; },
      signOut: async (options) => { if (options?.scope !== 'local') throw new Error('Wrong signout scope'); session = null; emit('SIGNED_OUT'); return { error: null }; },
      signInWithPassword: async ({ email, password }) => { await hold('signIn'); if (email !== user.email || password !== storedPassword) return { error: { code: 'invalid_credentials' } }; session = { access_token: 'fixture-access', user }; emit('SIGNED_IN'); return { data: { session }, error: null }; },
      signInWithOtp: async () => ({ error: null }),
      resetPasswordForEmail: async () => { control.calls.push({ kind: 'recovery' }); await hold('recovery'); return { error: null }; },
      exchangeCodeForSession: async () => { control.calls.push({ kind: 'exchange' }); await hold('exchange'); session = { access_token: 'fixture-access', user }; emit('SIGNED_IN'); return { data: { session }, error: null }; },
      verifyOtp: async () => { control.calls.push({ kind: 'otp' }); session = { access_token: 'fixture-access', user }; return { data: { session }, error: null }; },
      setSession: async () => { control.calls.push({ kind: 'setSession' }); session = { access_token: 'fixture-access', user }; return { data: { session }, error: null }; },
    } };
  ` }))
}
type Control = { fail: string; hold: string; release(): void; calls: { kind: string; email?: boolean; password?: boolean; nonce?: boolean }[]; confirm(): void; switchActor(): void }
const group = (page: Page) => page.getByRole('group', { name: 'Email & password', exact: true })
const openCredentials = (page: Page) => page.getByRole('button', { name: 'Manage', exact: true }).click()
const closeCredentials = (page: Page) => page.getByRole('dialog', { name: 'Email & password', exact: true }).getByRole('button', { name: 'Close dialog', exact: true }).click()

for (const width of [320, 801, 1440]) {
  test(`credentials at ${width}: pending email, confirmed readback, password, logout and login`, async ({ page }) => {
    await credentialsFixture(page)
    await page.setViewportSize({ width, height: width === 320 ? 568 : 900 })
    await page.goto('/settings')
    await openCredentials(page)
    await expect(group(page).getByLabel('Sign-in email')).toHaveValue('fixture@example.test')
    await group(page).getByLabel('Sign-in email').fill('changed@example.test')
    await group(page).getByRole('button', { name: 'Save email', exact: true }).click()
    await expect(group(page)).toContainText('Email confirmation pending')
    await expect(group(page).getByRole('button', { name: 'Save password', exact: true })).toBeDisabled()
    await page.evaluate(() => (window as unknown as { credentialFixture: Control }).credentialFixture.confirm())
    await closeCredentials(page)
    await openCredentials(page)
    await expect(group(page).getByLabel('Sign-in email')).toHaveValue('changed@example.test')
    await expect(group(page)).not.toContainText('Email confirmation pending')
    await group(page).getByLabel('New password', { exact: true }).fill('Fixture-password-2!')
    await expect(group(page).getByRole('button', { name: 'Save password', exact: true })).toBeDisabled()
    await group(page).getByLabel('Confirm new password').fill('Different-password-2!')
    await expect(group(page).getByRole('status')).toHaveText('Passwords do not match.')
    await expect(group(page).getByLabel('Confirm new password')).toHaveAttribute('aria-invalid', 'true')
    await expect(group(page).getByRole('button', { name: 'Save password', exact: true })).toBeDisabled()
    expect(await page.evaluate(() => (window as unknown as { credentialFixture: Control }).credentialFixture.calls.some(call => call.password))).toBe(false)
    await group(page).getByLabel('Confirm new password').fill('Fixture-password-2!')
    await expect(group(page).getByText('Passwords do not match.')).toHaveCount(0)
    await group(page).getByRole('button', { name: 'Save password', exact: true }).click()
    await expect(group(page)).toContainText('Password updated.')
    await expect(group(page).getByLabel('New password', { exact: true })).toHaveValue('')
    await expect(group(page).getByLabel('Confirm new password')).toHaveValue('')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    expect(await page.evaluate(() => JSON.stringify(localStorage).includes('Fixture-password'))).toBe(false)
    await group(page).screenshot({ path: `worktree/credentials/verified-${width}.png` })
    await closeCredentials(page)
    await page.getByRole('region', { name: 'Account actions' }).getByRole('button', { name: 'Log out', exact: true }).click()
    await page.getByRole('button', { name: 'Use password', exact: true }).click()
    await page.getByLabel('Email', { exact: true }).fill('changed@example.test')
    await page.getByLabel('Password', { exact: true }).fill('Fixture-password-1!')
    await page.getByRole('button', { name: 'Sign in with password', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Could not sign in')
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue('')
    await page.getByLabel('Password', { exact: true }).fill('Fixture-password-2!')
    await page.getByRole('button', { name: 'Sign in with password', exact: true }).click()
    await expect(page).toHaveURL('/settings')
    await openCredentials(page)
    await expect(group(page).getByLabel('Sign-in email')).toHaveValue('changed@example.test')
  })
}
test('anonymous verification gating, server-required reauthentication, redacted errors and identity change', async ({ page }) => {
  await credentialsFixture(page, true)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/settings')
  await openCredentials(page)
  await expect(group(page).getByText('Use 8–128 characters. Verify your email, then close and reopen Manage to set a password.', { exact: true })).toBeVisible()
  await expect(group(page)).not.toContainText('Email changes and password changes are saved separately.')
  await expect(group(page)).not.toContainText('Verify an email before setting a password')
  await page.getByRole('dialog', { name: 'Email & password', exact: true }).screenshot({ path: 'worktree/credentials/concise-help-unverified-1440.png' })
  await group(page).getByLabel('Sign-in email').fill('upgrade@example.test')
  await group(page).getByRole('button', { name: 'Save email', exact: true }).click()
  await expect(group(page)).toContainText('Email confirmation pending')
  await page.evaluate(() => (window as unknown as { credentialFixture: Control }).credentialFixture.confirm())
  await closeCredentials(page)
  await openCredentials(page)
  await expect(group(page).getByLabel('Sign-in email')).toHaveValue('upgrade@example.test')
  await page.evaluate(() => { (window as unknown as { credentialFixture: Control }).credentialFixture.fail = 'reauthentication_needed' })
  await group(page).getByLabel('New password', { exact: true }).fill('Fixture-password-2!')
  await group(page).getByLabel('Confirm new password').fill('Fixture-password-2!')
  await group(page).getByRole('button', { name: 'Save password', exact: true }).click()
  await expect(group(page).getByLabel('Verification code')).toBeVisible()
  await expect(group(page).getByLabel('New password', { exact: true })).toHaveValue('')
  await expect(group(page).getByLabel('Confirm new password')).toHaveValue('')
  await group(page).getByRole('button', { name: 'Send verification code' }).click()
  await expect(group(page)).toContainText('Verification code sent.')
  await group(page).getByLabel('Verification code').fill('123456')
  await group(page).getByLabel('New password', { exact: true }).fill('Fixture-password-2!')
  await expect(group(page).getByRole('button', { name: 'Save password', exact: true })).toBeDisabled()
  await group(page).getByLabel('Confirm new password').fill('Fixture-password-2!')
  await group(page).getByRole('button', { name: 'Save password', exact: true }).click()
  await expect(group(page)).toContainText('Password updated.')
  expect(await page.evaluate(() => (window as unknown as { credentialFixture: Control }).credentialFixture.calls.some(call => call.password && call.nonce))).toBe(true)
  await group(page).getByLabel('New password', { exact: true }).fill('discarded-secret')
  await group(page).getByLabel('Confirm new password').fill('discarded-secret')
  await page.evaluate(() => (window as unknown as { credentialFixture: Control }).credentialFixture.switchActor())
  await expect(page.getByRole('dialog', { name: 'Email & password', exact: true })).toHaveCount(0)
  await openCredentials(page)
  await expect(group(page).getByLabel('Sign-in email')).toHaveValue('other@example.test')
  await expect(group(page).getByLabel('New password', { exact: true })).toHaveValue('')
  await expect(group(page).getByLabel('Confirm new password')).toHaveValue('')
  await expect(group(page).getByLabel('Verification code')).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText('PRIVATE PROVIDER DIAGNOSTIC')
})
test('forgot-password and PKCE recovery callback use the same credential form and scrub the URL', async ({ page }) => {
  await credentialsFixture(page, false, false)
  await page.goto('/auth/forgot-password')
  await page.getByLabel('Email', { exact: true }).fill('fixture@example.test')
  await page.getByRole('button', { name: 'Send recovery link', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('If this email has an account')
  await page.goto('/auth/callback?code=fixture-code&flow=recovery&returnTo=https://evil.test')
  await expect(page).toHaveURL('/settings?credentials=recovery')
  await openCredentials(page)
  await expect(group(page).getByLabel('Sign-in email')).toHaveValue('fixture@example.test')
  await page.evaluate(() => { (window as unknown as { credentialFixture: Control }).credentialFixture.fail = 'reauthentication_needed' })
  await group(page).getByLabel('New password', { exact: true }).fill('Fixture-recovered-1!')
  await expect(group(page).getByRole('button', { name: 'Save password', exact: true })).toBeDisabled()
  await group(page).getByLabel('Confirm new password').fill('Fixture-recovered-1!')
  await group(page).getByRole('button', { name: 'Save password', exact: true }).click()
  await expect(group(page).getByLabel('Verification code')).toBeVisible()
  await expect(group(page).getByLabel('New password', { exact: true })).toHaveValue('')
  await expect(group(page).getByLabel('Confirm new password')).toHaveValue('')
  await group(page).getByRole('button', { name: 'Send verification code' }).click()
  await group(page).getByLabel('Verification code').fill('123456')
  await group(page).getByLabel('New password', { exact: true }).fill('Fixture-recovered-1!')
  await expect(group(page).getByRole('button', { name: 'Save password', exact: true })).toBeDisabled()
  await group(page).getByLabel('Confirm new password').fill('Fixture-recovered-1!')
  await group(page).getByRole('button', { name: 'Save password', exact: true }).click()
  await expect(group(page)).toContainText('Password updated.')
  expect(page.url()).not.toContain('fixture-code')
})

for (const suffix of ['', '?code=', '?code=one&code=two', '?token_hash=one&type=email#access_token=two&refresh_token=three', '?error_code=expired&message=private']) {
  test(`callback with an old session rejects malformed or absent grant ${suffix || '(absent)'}`, async ({ page }) => {
    await credentialsFixture(page)
    await page.goto(`/auth/callback${suffix}`)
    await expect(page.getByRole('alert')).toContainText('could not be confirmed')
    await expect(page).toHaveURL('/auth/callback')
    expect(await page.evaluate(() => (window as unknown as { credentialFixture: Control }).credentialFixture.calls)).toEqual([])
    await expect(group(page)).toHaveCount(0)
  })
}
test('callback scrubs immediately while a single exchange is pending and preserves safe returnTo', async ({ page }) => {
  await credentialsFixture(page)
  await page.addInitScript(() => {
    Object.defineProperty(window, 'credentialFixture', {
      configurable: true,
      set(value: Control) { value.hold = 'exchange'; Object.defineProperty(window, 'credentialFixture', { value, configurable: true }) },
    })
  })
  await page.goto('/auth/callback?code=private-code&returnTo=%2Fprofile#unrelated=private-hash')
  await expect(page).toHaveURL('/auth/callback')
  await expect(page.getByRole('status')).toHaveText('Verifying your account…')
  expect(await page.evaluate(() => (window as unknown as { credentialFixture: Control }).credentialFixture.calls)).toEqual([{ kind: 'exchange' }])
  await page.evaluate(() => (window as unknown as { credentialFixture: Control }).credentialFixture.release())
  await expect(page).toHaveURL('/profile')
  await expect(page.getByRole('button', { name: 'Edit profile', exact: true })).toBeVisible()
})
test('first-link message is informational only and never echoes provider text', async ({ page }) => {
  await credentialsFixture(page)
  await page.goto('/auth/callback?message=private-provider-details')
  await expect(page).toHaveURL('/auth/callback')
  await expect(page.getByRole('status')).toContainText('Finish confirming the email change from the other inbox')
  await expect(page.locator('body')).not.toContainText('private-provider-details')
  await expect(page.getByRole('link', { name: 'Settings', exact: true })).toHaveAttribute('href', '/settings')
  expect(await page.evaluate(() => (window as unknown as { credentialFixture: Control }).credentialFixture.calls)).toEqual([])
})
test('delayed password sign-in cannot navigate back after leaving its route', async ({ page }) => {
  await credentialsFixture(page, false, false)
  await page.goto('/login')
  await page.evaluate(() => { (window as unknown as { credentialFixture: Control }).credentialFixture.hold = 'signIn' })
  await page.getByRole('button', { name: 'Use password', exact: true }).click()
  await page.getByLabel('Email', { exact: true }).fill('fixture@example.test')
  await page.getByLabel('Password', { exact: true }).fill('Fixture-password-1!')
  await page.getByRole('button', { name: 'Sign in with password', exact: true }).click()
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('')
  await page.getByRole('link', { name: 'Forgot password?', exact: true }).click()
  await page.evaluate(() => (window as unknown as { credentialFixture: Control }).credentialFixture.release())
  await expect(page).toHaveURL('/auth/forgot-password')
  expect(await page.evaluate(() => (window as unknown as { credentialFixture: Control }).credentialFixture.calls.some(call => call.kind === 'getUser'))).toBe(false)
})
test('delayed recovery completion does not appear on a different route', async ({ page }) => {
  await credentialsFixture(page, false, false)
  await page.goto('/auth/forgot-password')
  await page.evaluate(() => { (window as unknown as { credentialFixture: Control }).credentialFixture.hold = 'recovery' })
  await page.getByLabel('Email', { exact: true }).fill('fixture@example.test')
  await page.getByRole('button', { name: 'Send recovery link', exact: true }).click()
  await page.getByRole('link', { name: 'Back to sign in', exact: true }).click()
  await page.evaluate(() => (window as unknown as { credentialFixture: Control }).credentialFixture.release())
  await expect(page).toHaveURL('/login')
  await expect(page.getByText('If this email has an account, check its inbox for a recovery link.')).toHaveCount(0)
})

test('login with an existing entry session and no returnTo reaches the ordinary gated app', async ({ page }) => {
  await credentialsFixture(page)
  await page.goto('/login')
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: 'Who’s around?', exact: true })).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { credentialFixture: Control }).credentialFixture.calls.some(call => ['exchange', 'otp', 'setSession'].includes(call.kind)))).toBe(false)
})
