import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from '../src/App'

const auth = vi.hoisted(() => ({
  configured: true, ready: true, dev: true,
  signInAnonymously: vi.fn(), signInWithOtp: vi.fn(),
  signInWithPassword: vi.fn(),
}))
vi.mock('../src/auth/localDevelopment', async importOriginal => ({
  ...await importOriginal<typeof import('../src/auth/localDevelopment')>(),
  getLocalDevelopmentEnvironment: () => ({ dev: auth.dev, hostname: window.location.hostname }),
}))
vi.mock('../src/supabase', () => ({ get supabase() { return auth.configured ? { auth } : null } }))
vi.mock('../src/auth/useSession', () => ({ useSession: () => ({ session: null, ready: auth.ready }) }))

function host(hostname: string) {
  const location = window.location
  vi.spyOn(window, 'location', 'get').mockReturnValue({ ...location, hostname })
}
function Path() { const location = useLocation(); return <output aria-label="Entry URL">{location.pathname}{location.search}</output> }
const mount = (path = '/matchmaking') => render(<StrictMode><MemoryRouter initialEntries={[path]}><App /><Path /></MemoryRouter></StrictMode>)
function expectNativeSignIn(path = '/matchmaking') {
  expect(screen.getByRole('heading', { name: 'Sign in', exact: true })).toBeTruthy()
  expect(screen.getByLabelText('Entry URL').textContent).toBe(`/login?${new URLSearchParams({ returnTo: path })}`)
  expect(document.querySelector('.pt-app')).toBeNull()
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'Fixture not configured' }, { status: 503 })))
  auth.dev = true
  vi.stubGlobal('scrollTo', () => {})
  auth.configured = true; auth.ready = true
  auth.signInAnonymously.mockReset().mockResolvedValue({ error: null })
  auth.signInWithOtp.mockReset()
  auth.signInWithPassword.mockReset().mockResolvedValue({ error: new Error('Fixture sign-in unavailable') })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); localStorage.clear() })

it.each(['localhost', '127.0.0.1'])('denies private matching and offers one-click development sign-in at login on %s', async hostname => {
  host(hostname)
  mount()
  expectNativeSignIn()
   expect(screen.getByText(/operator-provisioned local development account/i)).toBeTruthy()
  expect(auth.signInAnonymously).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Sign in as development user', exact: true }))
  await screen.findByRole('alert')
  expect(auth.signInAnonymously).not.toHaveBeenCalled()
  expect(auth.signInWithPassword).not.toHaveBeenCalled()
  expect(auth.signInWithOtp).not.toHaveBeenCalled()
  // SDK completion alone cannot manufacture an authenticated app session.
  expectNativeSignIn()
  expect(screen.queryByRole('button', { name: 'Find Friends' })).toBeNull()
})

it.each([
  [true, 'preview.example.test'], [true, '192.168.1.12'], [true, '0.0.0.0'],
  [true, '::1'], [true, 'localhost.example.test'], [true, 'localhost.'],
  [true, '127.0.0.2'], [false, 'localhost'], [false, '127.0.0.1'],
  [false, 'preview.example.test'],
])('preserves the native link without quick Auth on DEV=%s host %s', (dev, hostname) => {
  auth.dev = dev
  host(hostname)
  mount()
  expectNativeSignIn()
  expect(screen.queryByRole('button', { name: /quick sign in/i })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Sign in as development user', exact: true })).toBeNull()
  expect(screen.queryByText(/disposable.*anonymous.*session/i)).toBeNull()
  expect(auth.signInAnonymously).not.toHaveBeenCalled()
})

it('an unavailable dedicated account never unlocks a private route', async () => {
  host('localhost')
  mount()
  fireEvent.click(screen.getByRole('button', { name: 'Sign in as development user', exact: true }))
  expect(screen.getByLabelText('Email')).toHaveProperty('value', '')
  await screen.findByRole('alert')
  expect(screen.queryByLabelText('Password')).toBeNull()
  expect(auth.signInAnonymously).not.toHaveBeenCalled()
  expectNativeSignIn()
})

it('rechecks the environment before a stale route quick sign-in button can call Auth', () => {
  host('localhost')
  mount()
  const quick = screen.getByRole('button', { name: 'Sign in as development user', exact: true })
  auth.dev = false
  fireEvent.click(quick)
  auth.dev = true
  host('preview.example.test')
  fireEvent.click(quick)
  expect(auth.signInAnonymously).not.toHaveBeenCalled()
  expect(auth.signInWithOtp).not.toHaveBeenCalled()
  expectNativeSignIn()
})

it.each(['unavailable', 'rejection'])('announces endpoint %s on the route without fake Auth or email fallback', async failure => {
  host('localhost')
  if (failure === 'rejection') vi.mocked(fetch).mockRejectedValue(new Error('Synthetic network failure'))
  mount()
  fireEvent.click(screen.getByRole('button', { name: 'Sign in as development user', exact: true }))
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'fixture@example.test' } })
  expect((await screen.findByRole('alert')).textContent).toMatch(/development account is not ready/i)
  expectNativeSignIn()
  expect(auth.signInWithOtp).not.toHaveBeenCalled()
  expect(auth.signInWithPassword).not.toHaveBeenCalled()
  expect(auth.signInAnonymously).not.toHaveBeenCalled()
})

it('keeps unavailable sign-in accessible and disables local quick Auth when unconfigured', () => {
  host('localhost')
  auth.configured = false
  mount()
  expect(screen.getByText('Sign-in service is not configured.').getAttribute('role')).toBe('alert')
  expect((screen.getByRole('button', { name: 'Sign in as development user', exact: true }) as HTMLButtonElement).disabled).toBe(true)
  expect(auth.signInAnonymously).not.toHaveBeenCalled()
})

it('does not offer quick Auth before session initialization completes', () => {
  host('localhost')
  auth.ready = false
  mount()
  expect(screen.queryByRole('button', { name: /quick sign in/i })).toBeNull()
  expect(auth.signInAnonymously).not.toHaveBeenCalled()
})

it('legacy downtime Friends points to Settings without offering duplicate quick Auth', () => {
  host('localhost')
  mount('/downtime-matchmaking')
  expectNativeSignIn('/downtime-matchmaking')
  expect(screen.queryByRole('link', { name: 'Open matchmaking settings', exact: true })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Quick sign in (local only)' })).toBeNull()
  expect(auth.signInAnonymously).not.toHaveBeenCalled()
})
