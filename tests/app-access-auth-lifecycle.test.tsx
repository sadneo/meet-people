import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import App from '../src/App'
import { requiredPreferences, accountFixture } from './complete-profile-fixture'
import { emptyAccount } from '../shared/account'

const auth = vi.hoisted(() => ({
  session: null as Session | null,
  listeners: new Set<(event: string, session: Session | null) => void>(),
  getUser: vi.fn(), password: vi.fn(), exchange: vi.fn(), signOut: vi.fn(),
}))
vi.mock('../src/supabase', () => ({ supabase: { auth: {
  onAuthStateChange(callback: (event: string, session: Session | null) => void) {
    auth.listeners.add(callback)
    queueMicrotask(() => { if (auth.listeners.has(callback)) callback('INITIAL_SESSION', auth.session) })
    return { data: { subscription: { unsubscribe() { auth.listeners.delete(callback) } } } }
  },
  signInWithPassword: auth.password, exchangeCodeForSession: auth.exchange,
  getUser: auth.getUser, signOut: auth.signOut,
} } }))
vi.mock('../src/features/prototype/Home', () => ({ Home: () => <h1>Verified private home</h1> }))
const session = { access_token: 'verified-fixture', user: { id: 'fixture-owner' } } as Session
const account = { username: 'fixture', display_name: 'Fixture', bio: null, avatar_url: null }
function Path() { const location = useLocation(); return <output aria-label="Auth URL">{location.pathname}{location.search}</output> }
function emit() { auth.session = session; for (const listener of auth.listeners) listener('SIGNED_IN', session) }
beforeEach(() => {
  auth.session = null; auth.listeners.clear(); auth.getUser.mockReset(); auth.password.mockReset(); auth.exchange.mockReset(); auth.signOut.mockReset()
  vi.stubGlobal('scrollTo', () => {})
  vi.stubGlobal('fetch', vi.fn(async input => Response.json(String(input).endsWith('/account') ? accountFixture({ ...account, ...requiredPreferences }) : String(input).endsWith('/account-profile') ? { profile: account } : String(input).endsWith('/profile') ? { profile: { ...account, ...requiredPreferences } } : { notifications: [], unreadCount: 0 })))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); window.history.replaceState({}, '', '/') })

it('password SIGNED_IN does not leave the public entry or read canonical identity until getUser verification finishes', async () => {
  let finish!: (value: unknown) => void
  const verification = new Promise(resolve => { finish = resolve })
  auth.password.mockImplementation(async () => { emit(); return { data: { session }, error: null } })
  auth.getUser.mockReturnValue(verification)
  window.history.replaceState({}, '', '/login?returnTo=%2F')
  render(<MemoryRouter initialEntries={['/login?returnTo=%2F']}><App /><Path /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Use password', exact: true }))
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'fixture@example.test' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Fixture-only-password-1!' } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in with password', exact: true }))
  await waitFor(() => expect(auth.getUser).toHaveBeenCalledTimes(1))
  expect(screen.getByLabelText('Auth URL').textContent).toBe('/login?returnTo=%2F')
  expect(fetch).not.toHaveBeenCalled()
  await act(async () => { finish({ data: { user: session.user }, error: null }); await verification })
  await screen.findByRole('heading', { name: 'Verified private home', exact: true })
  expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).endsWith('/account'))).toBe(true)
})

it('callback SIGNED_IN stays outside the gate until verified exchange completion', async () => {
  let finish!: (value: unknown) => void
  const verification = new Promise(resolve => { finish = resolve })
  auth.exchange.mockImplementation(async () => { emit(); return { data: { session }, error: null } })
  auth.getUser.mockReturnValue(verification)
  const path = '/auth/callback?code=fixture-only-code&returnTo=%2F'
  window.history.replaceState({}, '', path)
  render(<MemoryRouter initialEntries={[path]}><App /><Path /></MemoryRouter>)
  await waitFor(() => expect(auth.getUser).toHaveBeenCalledTimes(1))
  expect(screen.getByRole('heading', { name: 'Account verification', exact: true })).toBeTruthy()
  expect(fetch).not.toHaveBeenCalled()
  await act(async () => { finish({ data: { user: session.user }, error: null }); await verification })
  await screen.findByRole('heading', { name: 'Verified private home', exact: true })
})

it('verification failure after SIGNED_IN never mounts private content or account APIs', async () => {
  auth.password.mockImplementation(async () => { emit(); return { error: null } })
  auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error('Unverified fixture') })
  render(<MemoryRouter initialEntries={['/login']}><App /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Use password', exact: true }))
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'fixture@example.test' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Fixture-only-password-1!' } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in with password', exact: true }))
  await screen.findByRole('alert')
  expect(fetch).not.toHaveBeenCalled()
  expect(screen.queryByRole('heading', { name: 'Verified private home', exact: true })).toBeNull()
})

it('an existing entry session at login without returnTo proceeds into the gated app by default', async () => {
  auth.session = session
  render(<MemoryRouter initialEntries={['/login']}><App /><Path /></MemoryRouter>)
  await screen.findByRole('heading', { name: 'Verified private home', exact: true })
  expect(screen.getByLabelText('Auth URL').textContent).toBe('/')
  expect(auth.password).not.toHaveBeenCalled()
  expect(auth.exchange).not.toHaveBeenCalled()
  expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).endsWith('/account'))).toBe(true)
})

it('existing login entry without a canonical profile still requires real completion, not an app bypass', async () => {
  auth.session = session
  vi.mocked(fetch).mockImplementation(async () => Response.json(emptyAccount))
  render(<MemoryRouter initialEntries={['/login']}><App /><Path /></MemoryRouter>)
  await screen.findByRole('heading', { name: 'Complete onboarding', exact: true })
  expect(screen.getByLabelText('Username')).toHaveProperty('value', '')
  expect(screen.queryByRole('heading', { name: 'Verified private home', exact: true })).toBeNull()
  expect(vi.mocked(fetch).mock.calls.every(([input, init]) => String(input).endsWith('/account') && init?.method === 'GET')).toBe(true)
})
