import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { Session } from '@supabase/supabase-js'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from '../src/App'
import { useSession } from '../src/auth/useSession'
import { emptyAccount } from '../shared/account'

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
} } }))
function Identity() {
  const { session, ready } = useSession()
  return <output aria-label="Session identity">{ready ? session?.user.id ?? 'guest' : 'loading'}</output>
}
function Path() { return <output aria-label="Current path">{useLocation().pathname}</output> }
beforeEach(() => {
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
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => Response.json(String(input).endsWith('/account') ? { ...emptyAccount, completed: [0, 1, 2, 3] } : String(input).endsWith('/profile') ? { profile: null } : { mode: null })))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })

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
