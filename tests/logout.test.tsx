import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { Session } from '@supabase/supabase-js'
import { MemoryRouter, useLocation, useNavigationType } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from '../src/App'
import { useSession } from '../src/auth/useSession'
import { useLogout } from '../src/auth/useLogout'
import { requiredPreferences, accountFixture } from './complete-profile-fixture'

const auth = vi.hoisted(() => ({
  session: null as Session | null,
  listeners: new Set<(event: string, session: Session | null) => void>(),
  fail: false,
  pending: null as Promise<void> | null,
  signOut: vi.fn(),
}))
vi.mock('../src/supabase', () => ({ supabase: { auth: {
  onAuthStateChange(callback: (event: string, session: Session | null) => void) {
    auth.listeners.add(callback)
    queueMicrotask(() => { if (auth.listeners.has(callback)) callback('INITIAL_SESSION', auth.session) })
    return { data: { subscription: { unsubscribe() { auth.listeners.delete(callback) } } } }
  },
  signOut: auth.signOut,
  getUser: async () => ({ data: { user: auth.session?.user ?? null }, error: null }),
} } }))
function Identity() {
  const { session, ready } = useSession()
  return <output aria-label="Session identity">{ready ? session?.user.id ?? 'guest' : 'loading'}</output>
}
function Path() { return <output aria-label="Current path">{useLocation().pathname}</output> }
function FullPath() {
  const location = useLocation(), type = useNavigationType()
  return <><output aria-label="Full logout URL">{location.pathname}{location.search}{location.hash}</output><output aria-label="Logout navigation">{type}</output></>
}
function DirectLogout() {
  const logout = useLogout()
  return <button disabled={!logout.ready || logout.busy} onClick={() => void logout.logout()}>Direct sign out</button>
}
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  auth.session = { access_token: 'user-jwt', user: { id: 'a0000000-0000-4000-8000-000000000001' } } as Session
  auth.fail = false; auth.pending = null
  auth.signOut.mockReset().mockImplementation(async () => {
    if (auth.pending) await auth.pending
    if (auth.fail) return { error: new Error('private provider detail') }
    auth.session = null
    for (const listener of auth.listeners) listener('SIGNED_OUT', null)
    return { error: null }
  })
  vi.stubGlobal('scrollTo', () => {})
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input)
    if (path.endsWith('/account')) return Response.json(accountFixture({ username: 'fixture', display_name: 'Fixture', bio: null, avatar_url: null, ...requiredPreferences }))
    if (path.endsWith('/account-profile')) return Response.json({ profile: { username: 'fixture', display_name: 'Fixture', bio: null, avatar_url: null } })
    if (path.endsWith('/profile')) return Response.json({ profile: { username: 'fixture', display_name: 'Fixture', bio: null, avatar_url: null, ...requiredPreferences } })
    return Response.json({ mode: null })
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })

it('the logout hook itself preserves a safe return URL without relying on the route guard to repair navigation', async () => {
  const path = '/settings?tab=privacy#account'
  render(<MemoryRouter initialEntries={[path]}><DirectLogout /><Identity /><FullPath /></MemoryRouter>)
  const control = screen.getByRole('button', { name: 'Direct sign out' })
  await waitFor(() => expect((control as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(control)
  await waitFor(() => expect(screen.getByLabelText('Full logout URL').textContent).toBe(`/login?${new URLSearchParams({ returnTo: path })}`))
  expect(screen.getByLabelText('Logout navigation').textContent).toBe('REPLACE')
  expect(screen.getByLabelText('Session identity').textContent).toBe('guest')
  expect(auth.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' })
})

it('real signout notifications preserve the captured safe path/query/hash and replace history even as the private tree unmounts', async () => {
  const path = '/settings?tab=privacy#account'
  let finish!: () => void
  auth.pending = new Promise(resolve => { finish = resolve })
  render(<MemoryRouter initialEntries={[path]}><App /><Identity /><FullPath /></MemoryRouter>)
  const actions = within(await screen.findByRole('region', { name: 'Account actions' }))
  fireEvent.click(await actions.findByRole('button', { name: 'Log out', exact: true }))
  expect(screen.getByLabelText('Full logout URL').textContent).toBe(path)
  await act(async () => { finish(); await auth.pending })
  await waitFor(() => expect(screen.getByLabelText('Full logout URL').textContent).toBe(`/login?${new URLSearchParams({ returnTo: path })}`))
  expect(screen.getByLabelText('Logout navigation').textContent).toBe('REPLACE')
  expect(screen.getByLabelText('Session identity').textContent).toBe('guest')
  expect(document.querySelector('.pt-app')).toBeNull()
})

it('Settings opens a single-title credential dialog without Cancel and preserves close/cancel-event focus return', async () => {
  render(<MemoryRouter initialEntries={['/settings']}><App /></MemoryRouter>)
  await screen.findByRole('heading', { name: 'A little peace of mind.', exact: true })
  const settings = within(document.querySelector('.pt-settings')!)
  expect(settings.queryByRole('heading', { name: 'Profile', exact: true })).toBeNull()
  expect(settings.queryByRole('link', { name: 'Profile', exact: true })).toBeNull()
  const actions = within(screen.getByRole('region', { name: 'Account actions' }))
  expect(actions.getByText('Email & password')).toBeTruthy()
  expect(actions.queryByRole('textbox')).toBeNull()
  expect(screen.queryByRole('dialog')).toBeNull()
  const manage = actions.getByRole('button', { name: 'Manage', exact: true })
  await actions.findByRole('button', { name: 'Log out', exact: true })
  expect(actions.getByText('Manage your sign-in email and password.')).toBeTruthy()
  expect(manage.getAttribute('aria-haspopup')).toBe('dialog')
  manage.focus(); fireEvent.click(manage)
  const dialog = screen.getByRole('dialog', { name: 'Email & password', exact: true })
  const row = within(dialog)
  expect(row.getAllByRole('heading', { name: 'Email & password', exact: true })).toHaveLength(1)
  expect(row.queryByRole('heading', { level: 3 })).toBeNull()
  expect(row.queryByRole('button', { name: 'Cancel', exact: true })).toBeNull()
  expect(row.getByText('Manage the email address you use to sign in and your password.')).toBeTruthy()
  await row.findByLabelText('Sign-in email')
  expect(row.getByLabelText('New password').getAttribute('type')).toBe('password')
  expect(row.getByRole('button', { name: 'Save email' })).toBeTruthy()
  expect(row.getByRole('button', { name: 'Save password' })).toBeTruthy()
  expect(auth.signOut).not.toHaveBeenCalled()
  expect(screen.queryByText(/refresh account status/i)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(manage)
  fireEvent.click(manage)
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: false, cancelable: true }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(manage)
  await actions.findByRole('button', { name: 'Log out', exact: true })
  expect(actions.getByText('Log out', { selector: 'strong' })).toBeTruthy()
  expect(actions.getByText('Sign out of Pebble on this browser.')).toBeTruthy()
  expect(actions.queryByText(/Supabase|purchases/i)).toBeNull()
})

it('signed-out Settings redirects to login without mounting account controls', async () => {
  auth.session = null
  render(<MemoryRouter initialEntries={['/settings']}><App /><Path /></MemoryRouter>)
  await waitFor(() => expect(screen.getByLabelText('Current path').textContent).toBe('/login'))
  expect(screen.queryByRole('region', { name: 'Account actions' })).toBeNull()
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(auth.signOut).not.toHaveBeenCalled()
})

it('Settings keeps account loading disabled until the auth notification arrives', async () => {
  render(<MemoryRouter initialEntries={['/settings']}><App /></MemoryRouter>)
  expect(screen.queryByRole('region', { name: 'Account actions' })).toBeNull()
  expect(screen.getByText('Loading session…')).toBeTruthy()
  await screen.findByRole('button', { name: 'Log out', exact: true })
})

for (const origin of ['shell', 'settings']) {
  const path = origin === 'shell' ? '/matchmaking' : '/settings'
  async function logoutControl() {
    await waitFor(() => expect(screen.getByLabelText('Session identity').textContent).toContain('a0000000'))
    if (origin === 'shell') {
      fireEvent.click(await screen.findByRole('button', { name: 'Account menu' }))
      return screen.findByRole('button', { name: 'Log out', exact: true })
    }
    return within(await screen.findByRole('region', { name: 'Account actions' })).findByRole('button', { name: 'Log out', exact: true })
  }
  it(`${origin} logout waits for actual signOut and clears session through auth notifications`, async () => {
    let finish!: () => void
    auth.pending = new Promise(resolve => { finish = resolve })
    render(<MemoryRouter initialEntries={[path]}><App /><Identity /><Path /></MemoryRouter>)
    const button = await logoutControl()
    fireEvent.click(button)
    expect(auth.signOut).toHaveBeenCalledTimes(1)
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect((screen.getByRole('button', { name: 'Logging out…', exact: true }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByLabelText('Current path').textContent).toBe(path)
    expect(screen.getByLabelText('Session identity').textContent).not.toBe('guest')
    await act(async () => { finish(); await auth.pending })
    await waitFor(() => expect(screen.getByLabelText('Current path').textContent).toBe('/login'))
    expect(screen.getByLabelText('Session identity').textContent).toBe('guest')
    expect(screen.queryByText('You are signed in.')).toBeNull()
  })
  it(`${origin} logout failure preserves the route and authenticated session with a visible retry error`, async () => {
    auth.fail = true
    render(<MemoryRouter initialEntries={[path]}><App /><Identity /><Path /></MemoryRouter>)
    fireEvent.click(await logoutControl())
    const error = await screen.findByRole('alert')
    expect(error.textContent).toContain('Could not log out')
    expect(error.textContent).not.toContain('private provider detail')
    expect(screen.getByLabelText('Current path').textContent).toBe(path)
    expect(screen.getByLabelText('Session identity').textContent).not.toBe('guest')
    auth.fail = false
    fireEvent.click(await logoutControl())
    await waitFor(() => expect(screen.getByLabelText('Current path').textContent).toBe('/login'))
  })
}
