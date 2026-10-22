import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate, useNavigationType } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from '../../src/App'
import { requiredPreferences, accountFixture } from './complete-profile-fixture'
import { emptyAccount, type Account } from '../../shared/account'

const auth = vi.hoisted(() => ({ ready: true, session: null as { access_token: string; user: { id: string } } | null }))
vi.mock('../../src/auth/useSession', () => ({ useSession: () => auth }))
vi.mock('../../src/supabase', () => ({ supabase: null }))
const privateMount = vi.hoisted(() => vi.fn())
vi.mock('../../src/features/prototype/Home', () => ({ Home: () => { privateMount(); return <h1>Private home fixture</h1> } }))
beforeEach(() => {
  auth.ready = true; auth.session = null; privateMount.mockClear()
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(emptyAccount)))
  vi.stubGlobal('scrollTo', () => {})
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })
function Path() {
  const location = useLocation(), navigate = useNavigate(), type = useNavigationType()
  return <><output aria-label="Access URL">{location.pathname}{location.search}{location.hash}</output><output aria-label="Navigation type">{type}</output><button onClick={() => navigate(-1)}>Test back</button></>
}
const mount = (path: string) => render(<MemoryRouter initialEntries={[path]}><App /><Path /></MemoryRouter>)
const protectedPaths = ['/home', '/events', '/events/fixture', '/community', '/prototype/yzcommunity', '/messages/chat', '/profile', '/settings', '/matchmaking?view=dating#detail', '/downtime-matchmaking', '/intro', '/free-time/plan', '/missing?source=fixture#anchor']
for (const path of protectedPaths) it(`signed-out route ${path} is replaced by login without mounting private context or data hooks`, async () => {
  const view = mount(path)
  await waitFor(() => expect(screen.getByLabelText('Access URL').textContent).toBe(`/login?${new URLSearchParams({ returnTo: path })}`))
  expect(screen.getByLabelText('Navigation type').textContent).toBe('REPLACE')
  expect(privateMount).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
  expect(view.container.querySelector('.pt-app')).toBeNull()
  expect(localStorage.length).toBe(0)
})

it('auth hydration mounts no private content, storage/context or private requests', () => {
  auth.ready = false
  auth.session = { access_token: 'pending', user: { id: 'pending' } }
  const view = mount('/')
  expect(screen.getByText('Loading session…').getAttribute('role')).toBe('status')
  expect(privateMount).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
  expect(view.container.querySelector('.pt-app')).toBeNull()
})

for (const [path, title] of [['/login', 'Welcome to Pebble'], ['/register', 'Welcome to Pebble'], ['/auth/forgot-password', 'Reset your password'], ['/auth/callback', 'Account verification']]) {
  it(`public auth page ${path} is accessible without a private context or data read`, () => {
    const view = mount(path)
    expect(screen.getByRole('heading', { name: title, exact: true })).toBeTruthy()
    expect(view.container.querySelector('.pt-app')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })
}

const account = { username: 'explicit-fixture', display_name: 'Explicit fixture', bio: null, avatar_url: null }
const signIn = () => { auth.session = { access_token: 'first-token', user: { id: 'first-actor' } } }

it('readiness hydration blocks the private tree and reads only the unified account', async () => {
  signIn()
  vi.mocked(fetch).mockImplementation(() => new Promise(() => {}))
  mount('/')
  await screen.findByText('Checking your profile…')
  expect(privateMount).not.toHaveBeenCalled()
  expect(vi.mocked(fetch).mock.calls.map(([path]) => path)).toEqual(['/api/matchmaking/account'])
  expect(localStorage.length).toBe(0)
})

it('null unified profile requires explicit identity and authoritative readback, without unlocking or losing the original destination', async () => {
  signIn()
  let saved = false, release!: () => void
  const readback = new Promise<void>(resolve => { release = resolve })
  let stored: Account = structuredClone(emptyAccount)
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    expect(String(input)).toBe('/api/matchmaking/account')
    if (init?.method === 'PUT') { saved = true; stored = JSON.parse(String(init.body)); return Response.json(stored) }
    if (saved) await readback
    return Response.json(stored)
  })
  mount('/?from=fixture#anchor')
  await screen.findByRole('heading', { name: 'Complete onboarding', exact: true })
  expect(screen.getByLabelText('Access URL').textContent).toBe(`/onboarding?${new URLSearchParams({ returnTo: '/?from=fixture#anchor' })}`)
  expect(screen.queryByRole('button', { name: 'Cancel', exact: true })).toBeNull()
  expect(screen.queryByRole('link', { name: 'Home', exact: true })).toBeNull()
  expect(screen.getByLabelText('Username')).toHaveProperty('value', '')
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: account.username } })
  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: account.display_name } })
  fireEvent.click(screen.getByRole('button', { name: 'Save identity and continue', exact: true }))
  await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true))
  expect(privateMount).not.toHaveBeenCalled()
  await act(async () => { release(); await readback })
  await screen.findByRole('heading', { name: 'Interests', level: 2, exact: true })
  expect(privateMount).not.toHaveBeenCalled()
  expect(screen.getByLabelText('Access URL').textContent).toBe(`/onboarding?${new URLSearchParams({ returnTo: '/?from=fixture#anchor' })}`)
  expect(vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1)
  expect(vi.mocked(fetch).mock.calls.some(([path, init]) => /\/(queue|result)$/.test(String(path)) || (String(path).endsWith('/profile') && init?.method !== 'GET'))).toBe(false)
})

it('existing complete users enter; expiry immediately closes private access', async () => {
  signIn()
  vi.mocked(fetch).mockImplementation(async input => Response.json(String(input).endsWith('/account') ? accountFixture({ ...account, ...requiredPreferences }) : { notifications: [], unreadCount: 0 }))
  const view = mount('/home')
  await screen.findByRole('heading', { name: 'Private home fixture', exact: true })
  auth.session = null
  view.rerender(<MemoryRouter initialEntries={['/home']}><App /><Path /></MemoryRouter>)
  expect(screen.queryByRole('heading', { name: 'Private home fixture', exact: true })).toBeNull()
  await screen.findByRole('heading', { name: 'Welcome to Pebble', exact: true })
})

it('token/owner changes remove the old shell and ignore a late prior profile response', async () => {
  signIn()
  let finishOld!: (response: Response) => void
  const old = new Promise<Response>(resolve => { finishOld = resolve })
  vi.mocked(fetch).mockImplementation(async (_input, init) => new Headers(init?.headers).get('Authorization') === 'Bearer first-token' ? old : Response.json(emptyAccount))
  const view = mount('/')
  auth.session = { access_token: 'second-token', user: { id: 'second-actor' } }
  view.rerender(<MemoryRouter initialEntries={['/']}><App /><Path /></MemoryRouter>)
  await screen.findByRole('heading', { name: 'Complete onboarding', exact: true })
  await act(async () => { finishOld(Response.json(accountFixture({ ...account, ...requiredPreferences }))); await old })
  expect(privateMount).not.toHaveBeenCalled()
  expect(screen.getByLabelText('Username')).toHaveProperty('value', '')
})

it('completion rejects unsafe or self-referential destinations', async () => {
  signIn()
  mount('/complete-profile?returnTo=https%3A%2F%2Fevil.test')
  await screen.findByRole('heading', { name: 'Complete onboarding', exact: true })
  expect(screen.queryByRole('link', { name: /evil/ })).toBeNull()
  expect(privateMount).not.toHaveBeenCalled()
})

it('null readback after a successful save response retains the required draft and never unlocks the app', async () => {
  signIn()
  vi.mocked(fetch).mockImplementation(async (_input, init) => Response.json(init?.method === 'PUT' ? JSON.parse(String(init.body)) : emptyAccount))
  mount('/')
  await screen.findByRole('heading', { name: 'Complete onboarding', exact: true })
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: account.username } })
  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: account.display_name } })
  fireEvent.submit(screen.getByRole('form', { name: 'Profile identity' }))
  fireEvent.submit(screen.getByRole('form', { name: 'Profile identity' }))
  await screen.findByText(/Account save could not be confirmed/)
  expect(privateMount).not.toHaveBeenCalled()
  expect(screen.getByLabelText('Username')).toHaveProperty('value', account.username)
  expect(vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Retry account', exact: true }))
  await waitFor(() => expect((screen.getByLabelText('Username') as HTMLInputElement).disabled).toBe(false))
  expect(screen.getByLabelText('Username')).toHaveProperty('value', account.username)
  expect(privateMount).not.toHaveBeenCalled()
})

it('a pending completion save cannot unlock a different owner or issue old-session readback after a swap', async () => {
  signIn()
  let finish!: (response: Response) => void
  const pending = new Promise<Response>(resolve => { finish = resolve })
  vi.mocked(fetch).mockImplementation(async (_input, init) => init?.method === 'PUT' ? pending : Response.json(emptyAccount))
  const view = mount('/')
  await screen.findByRole('heading', { name: 'Complete onboarding', exact: true })
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: account.username } })
  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: account.display_name } })
  fireEvent.click(screen.getByRole('button', { name: 'Save identity and continue', exact: true }))
  await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true))
  auth.session = { access_token: 'replacement-token', user: { id: 'replacement-owner' } }
  view.rerender(<MemoryRouter initialEntries={['/']}><App /><Path /></MemoryRouter>)
  await waitFor(() => expect(screen.getByLabelText('Username')).toHaveProperty('value', ''))
  const before = vi.mocked(fetch).mock.calls.length
  await act(async () => { finish(Response.json(accountFixture({ ...account, ...requiredPreferences }))); await pending })
  expect(fetch).toHaveBeenCalledTimes(before)
  expect(privateMount).not.toHaveBeenCalled()
})

it('recovery during missing-profile setup exposes only minimal account controls, not Settings or the app shell', async () => {
  signIn(); mount('/settings?credentials=recovery')
  await screen.findByRole('heading', { name: 'Complete onboarding', exact: true })
  expect(screen.getByRole('group', { name: 'Email & password', exact: true })).toBeTruthy()
  expect(document.querySelector('.pt-settings')).toBeNull()
  expect(document.querySelector('.pt-app')).toBeNull()
  expect(screen.getByRole('button', { name: 'Log out', exact: true })).toBeTruthy()
  expect(vi.mocked(fetch).mock.calls.every(([input]) => String(input).endsWith('/account'))).toBe(true)
})
