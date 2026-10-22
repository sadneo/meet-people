import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Session } from '@supabase/supabase-js'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AccountBoundary } from '../../src/auth/account'
import { AuthScreen } from '../../src/auth/AuthScreen'
import { useAccount } from '../../src/auth/account-context'
import { accountFixture, requiredPreferences } from './complete-profile-fixture'

const auth = vi.hoisted(() => ({
  session: null as Session | null,
  listeners: new Set<(event: string, session: Session | null) => void>(),
  signOut: vi.fn(),
}))
vi.mock('../../src/supabase', () => ({ supabase: { auth: {
  onAuthStateChange(callback: (event: string, session: Session | null) => void) {
    auth.listeners.add(callback)
    queueMicrotask(() => { if (auth.listeners.has(callback)) callback('INITIAL_SESSION', auth.session) })
    return { data: { subscription: { unsubscribe() { auth.listeners.delete(callback) } } } }
  },
  getSession: async () => ({ data: { session: auth.session }, error: null }),
  signOut: auth.signOut,
} } }))

const account = accountFixture({ username: 'first', display_name: 'Private account', bio: 'My bio', avatar_url: null, ...requiredPreferences })

function Workspace() {
  const state = useAccount()!
  return <><p>{state.account.profile?.display_name}</p><button onClick={() => void state.save(account)}>Save account</button></>
}
function Location() {
  const location = useLocation()
  return <output aria-label="Current location">{location.pathname}{location.search}</output>
}
function show(path = '/profile') {
  render(<MemoryRouter initialEntries={[path]}><AccountBoundary><Routes>
    <Route path="/profile" element={<Workspace />} />
    <Route path="/login" element={<AuthScreen />} />
  </Routes></AccountBoundary><Location /></MemoryRouter>)
}
function setSession(session: Session) {
  auth.session = session
  for (const listener of auth.listeners) listener('TOKEN_REFRESHED', session)
}
beforeEach(() => {
  auth.session = { access_token: 'first-token', user: { id: 'first' } } as Session
  auth.signOut.mockReset().mockImplementation(async () => {
    auth.session = null
    for (const listener of auth.listeners) listener('SIGNED_OUT', null)
    return { error: null }
  })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it.each([
  ['/profile?tab=about', '/profile?tab=about', true],
  ['/login?returnTo=%2Fevents', '/events', true],
  ['/profile', '/profile', false],
])('recovers an account 401 at %s into usable sign-in without revoking other devices', async (path, returnTo, json) => {
  vi.stubGlobal('fetch', vi.fn(async () => json ? Response.json({ code: 'auth', error: 'Sign in with a valid session.' }, { status: 401 }) : new Response('Unauthorized', { status: 401 })))
  show(path)
  await screen.findByLabelText('Email')
  expect(auth.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' })
  expect(screen.getByLabelText('Current location').textContent).toBe(`/login?${new URLSearchParams({ returnTo })}`)
  expect(screen.getByRole('button', { name: 'Continue with email' })).toBeTruthy()
  expect(screen.queryByText('Private account')).toBeNull()
})

it('clears the expired account and offers sign-in when a save returns 401', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => init.method === 'PUT' ? Response.json({ code: 'auth', error: 'Session expired.' }, { status: 401 }) : Response.json(account)))
  show()
  await screen.findByText('Private account')
  fireEvent.click(screen.getByRole('button', { name: 'Save account' }))
  await screen.findByLabelText('Email')
  expect(auth.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' })
  expect(screen.queryByText('Private account')).toBeNull()
})

it.each(['unavailable', 'offline'])('keeps the session and allows account retry for a transient %s failure', async kind => {
  const fetchMock = vi.fn().mockImplementationOnce(async () => {
    if (kind === 'offline') throw new TypeError('Failed to fetch')
    return Response.json({ code: 'provider', error: 'Service unavailable.' }, { status: 503 })
  }).mockImplementation(async () => Response.json(account))
  vi.stubGlobal('fetch', fetchMock)
  show()
  fireEvent.click(await screen.findByRole('button', { name: 'Retry', exact: true }))
  await screen.findByText('Private account')
  expect(auth.signOut).not.toHaveBeenCalled()
  expect(auth.session?.access_token).toBe('first-token')
  expect(screen.getByLabelText('Current location').textContent).toBe('/profile')
})

it('does not clear a newer account after a delayed unauthorized response for the previous identity', async () => {
  let finish!: (response: Response) => void
  const pending = new Promise<Response>(resolve => { finish = resolve })
  const fetchMock = vi.fn((_url, init) => new Headers(init.headers).get('Authorization') === 'Bearer first-token' ? pending : Promise.resolve(Response.json(account)))
  vi.stubGlobal('fetch', fetchMock)
  show()
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  act(() => setSession({ access_token: 'second-token', user: { id: 'second' } } as Session))
  await screen.findByText('Private account')
  await act(async () => { finish(Response.json({ code: 'auth', error: 'Old session expired.' }, { status: 401 })); await pending })
  expect(auth.signOut).not.toHaveBeenCalled()
  expect(auth.session?.user.id).toBe('second')
})

it('retries with a refreshed token instead of clearing it after the previous token returns 401', async () => {
  let finish!: (response: Response) => void
  const pending = new Promise<Response>(resolve => { finish = resolve })
  const fetchMock = vi.fn((_url, init) => new Headers(init.headers).get('Authorization') === 'Bearer first-token' ? pending : Promise.resolve(Response.json(account)))
  vi.stubGlobal('fetch', fetchMock)
  show()
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  act(() => setSession({ access_token: 'refreshed-token', user: { id: 'first' } } as Session))
  await act(async () => { finish(Response.json({ code: 'auth', error: 'Old token expired.' }, { status: 401 })); await pending })
  await screen.findByText('Private account')
  expect(auth.signOut).not.toHaveBeenCalled()
  expect(auth.session?.access_token).toBe('refreshed-token')
})
