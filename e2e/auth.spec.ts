import { test, expect } from '@playwright/test'
import { emptyAccount, type Account } from '../shared/account'
import { chooseDistanceAndGroup, saveInterestChapter, saveSocialChapter } from './onboarding-fixture'

// Isolated source browser coverage only: no env files, admin client, account
// creation, provider requests or database cleanup. The SDK module is intercepted.
for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`mocked authenticated four-chapter resume, profile/settings persistence and owner switching at ${viewport.width}px`, async ({ page }) => {
    const accounts: Record<string, Account> = { first: structuredClone(emptyAccount), second: structuredClone(emptyAccount) }
    const requests: { path: string; method: string; owner: string }[] = [], external: string[] = []
    await page.route('**/*', route => {
      const request = route.request(), url = new URL(request.url())
      if (url.origin !== 'http://127.0.0.1:3194') { external.push(url.origin); return route.abort() }
      if (!url.pathname.startsWith('/api/')) return route.continue()
      const owner = request.headers().authorization?.replace('Bearer fixture-jwt-', '') ?? ''
      if (!accounts[owner]) return route.fulfill({ status: 401, json: { code: 'auth', error: 'Fixture authentication required.' } })
      requests.push({ path: url.pathname, method: request.method(), owner })
      const account = accounts[owner]
      if (url.pathname.endsWith('/account')) {
        if (request.method() === 'PUT') accounts[owner] = request.postDataJSON()
        return route.fulfill({ json: accounts[owner] })
      }
      if (url.pathname.endsWith('/account-profile')) {
        if (request.method() === 'PUT') account.profile = { ...account.profile!, ...request.postDataJSON() }
        const p = account.profile
        return route.fulfill({ json: { profile: p ? { username: p.username, display_name: p.display_name, bio: p.bio, avatar_url: p.avatar_url } : null } })
      }
      if (url.pathname.endsWith('/profile')) {
        if (request.method() === 'PUT') account.profile = request.postDataJSON()
        return route.fulfill({ json: { profile: account.profile } })
      }
      if (url.pathname.endsWith('/notifications')) return route.fulfill({ json: { notifications: [], unreadCount: 0 } })
      if (url.pathname.endsWith('/status')) return route.fulfill({ json: { mode: null } })
      return route.fulfill({ status: 503, json: { code: 'unavailable', error: 'Unexpected fixture capability.' } })
    })
    await page.route('**/src/supabase.ts', route => route.fulfill({ contentType: 'application/javascript', body: `
      // Test-only SDK persistence, never imported into the production application.
      let session = JSON.parse(sessionStorage.getItem('fixture:auth-session') || 'null');
      const listeners = new Set();
      const emit = (event) => { sessionStorage.setItem('fixture:auth-session', JSON.stringify(session)); for (const callback of listeners) callback(event, session); };
      export const supabase = { auth: {
        onAuthStateChange(callback) { listeners.add(callback); queueMicrotask(() => { if (listeners.has(callback)) callback('INITIAL_SESSION', session); }); return { data: { subscription: { unsubscribe() { listeners.delete(callback); } } } }; },
        signInWithPassword: async ({ email, password }) => {
          const id = email === 'first@example.test' ? 'first' : email === 'second@example.test' ? 'second' : null;
          if (!id || password !== 'Synthetic-password-1!') return { data: { session: null }, error: new Error('Fixture credentials rejected') };
          session = { access_token: 'fixture-jwt-' + id, user: { id, email, is_anonymous: false, email_confirmed_at: '2026-10-01' } }; emit('SIGNED_IN'); return { data: { session }, error: null };
        },
        getUser: async () => ({ data: { user: session?.user ?? null }, error: null }),
        getSession: async () => ({ data: { session } }),
        signOut: async ({ scope }) => { if (scope !== 'local') throw new Error('Fixture expects local signout'); session = null; emit('SIGNED_OUT'); return { error: null }; }
      } };
    ` }))
    await page.setViewportSize(viewport)
    const login = async (owner: string) => {
      await page.goto('/login'); await page.getByRole('button', { name: 'Use password', exact: true }).click()
      await page.getByLabel('Email', { exact: true }).fill(`${owner}@example.test`)
      await page.getByLabel('Password', { exact: true }).fill('Synthetic-password-1!')
      await page.getByRole('button', { name: 'Sign in with password', exact: true }).click()
    }
    await login('first')
    await expect(page).toHaveURL(/\/onboarding/)
    await expect(page.locator('.pt-app')).toHaveCount(0)
    await page.getByLabel('Username', { exact: true }).fill('chosen-first')
    await page.getByLabel('Display name', { exact: true }).fill('My Student')
    await page.getByRole('button', { name: 'Save identity and continue', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Save interests and continue', exact: true })).toBeEnabled()
    await page.reload()
    await expect(page.getByLabel('Username', { exact: true })).toHaveCount(0)
    expect(accounts.first.completed).toEqual([0])
    await saveInterestChapter(page); await saveSocialChapter(page); await chooseDistanceAndGroup(page)
    await page.getByLabel('Birthdate', { exact: true }).fill('2001-02-03')
    await page.getByLabel('City or campus area', { exact: true }).fill('Chosen campus')
    await page.getByRole('button', { name: 'Sunday late, not available', exact: true }).click()
    await page.getByRole('button', { name: 'Finish onboarding', exact: true }).click()
    await expect(page).toHaveURL('/settings')
    expect(accounts.first.completed).toEqual([0, 1, 2, 3]); expect(accounts.first.profile!.avatar_url).toBeNull()
    expect(requests.filter(request => request.method === 'PUT').map(request => request.path)).toEqual(Array(4).fill('/api/matchmaking/account'))
    await page.goto('/profile'); await page.getByRole('button', { name: 'Edit profile', exact: true }).click()
    const editor = page.getByRole('dialog', { name: 'Edit your profile', exact: true })
    await editor.getByLabel('Bio', { exact: true }).fill('Persisted personal bio')
    await editor.getByRole('button', { name: 'Save profile', exact: true }).click(); await expect(editor).toHaveCount(0)
    await page.goto('/settings')
    const notifications = page.getByRole('switch', { name: 'Plan & message notifications', exact: true })
    await notifications.click(); await expect(notifications).not.toBeChecked(); await expect(notifications).toBeEnabled()
    await page.reload(); await expect(notifications).not.toBeChecked()
    expect(accounts.first.profile!.bio).toBe('Persisted personal bio')
    await page.getByRole('region', { name: 'Account actions' }).getByRole('button', { name: 'Manage', exact: true }).click()
    await expect(page.getByLabel('Sign-in email', { exact: true })).toHaveValue('first@example.test')
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
    await page.getByRole('region', { name: 'Account actions' }).getByRole('button', { name: 'Log out', exact: true }).click()
    await expect(page).toHaveURL('/login?returnTo=%2Fsettings'); await expect(page.locator('.pt-app')).toHaveCount(0)
    await login('second'); await expect(page).toHaveURL(/\/onboarding/)
    await expect(page.getByLabel('Username', { exact: true })).toHaveValue('')
    await expect(page.getByLabel('Display name', { exact: true })).toHaveValue('')
    await expect(page.getByLabel('Bio', { exact: true })).toHaveValue('')
    await page.getByRole('button', { name: 'Log out', exact: true }).click(); await expect(page).toHaveURL(/\/login/)
    await login('first'); await expect(page).toHaveURL('/settings')
    await page.goto('/profile'); await expect(page.getByRole('heading', { name: 'My Student', exact: true })).toBeVisible()
    await expect(page.getByText('Persisted personal bio', { exact: true })).toBeVisible()
    expect(requests.some(request => /\/(queue|result)$/.test(request.path))).toBe(false)
    expect(accounts.second).toEqual(emptyAccount); expect(external).toEqual([])
  })
}
