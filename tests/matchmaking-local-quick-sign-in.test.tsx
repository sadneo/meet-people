import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from '../src/App'

const auth = vi.hoisted(() => ({
  configured: true, ready: true, dev: true,
  signInAnonymously: vi.fn(), signInWithOtp: vi.fn(),
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
const mount = (path = '/matchmaking') => render(<StrictMode><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></StrictMode>)
function expectNativeSignIn(path = '/matchmaking') {
  const link = within(screen.getByRole('main')).getByRole('link', { name: 'Sign in', exact: true })
  expect(link.getAttribute('href')).toBe(`/login?returnTo=${path}`)
  expect(link.classList.contains('pt-discovery-action')).toBe(true)
}

beforeEach(() => {
  auth.dev = true
  vi.stubGlobal('scrollTo', () => {})
  auth.configured = true; auth.ready = true
  auth.signInAnonymously.mockReset().mockResolvedValue({ error: null })
  auth.signInWithOtp.mockReset()
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); localStorage.clear() })

it.each(['localhost', '127.0.0.1'])('offers explicit real SDK quick sign-in on the forest route in dev on %s', async hostname => {
  host(hostname)
  mount()
  expectNativeSignIn()
  expect(screen.getByText(/disposable.*anonymous.*session/i)).toBeTruthy()
  expect(auth.signInAnonymously).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Quick sign in (local only)' }))
  await screen.findByText(/Signed in.*disposable/)
  expect(auth.signInAnonymously).toHaveBeenCalledExactlyOnceWith()
  expect(auth.signInWithOtp).not.toHaveBeenCalled()
  // SDK completion alone cannot manufacture an authenticated app session.
  expectNativeSignIn()
  expect(screen.queryByRole('button', { name: 'Start matching' })).toBeNull()
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
  expect(screen.queryByText(/disposable.*anonymous.*session/i)).toBeNull()
  expect(auth.signInAnonymously).not.toHaveBeenCalled()
})

it('announces pending state and prevents duplicate route quick sign-in requests', async () => {
  host('localhost')
  let resolve!: (value: { error: null }) => void
  auth.signInAnonymously.mockReturnValue(new Promise(done => { resolve = done }))
  mount()
  const quick = screen.getByRole('button', { name: 'Quick sign in (local only)' })
  act(() => { quick.click(); quick.click() })
  expect((quick as HTMLButtonElement).disabled).toBe(true)
  expect(screen.getByRole('status').textContent).toContain('Signing in')
  expect(auth.signInAnonymously).toHaveBeenCalledTimes(1)
  expectNativeSignIn()
  await act(async () => resolve({ error: null }))
  expect((quick as HTMLButtonElement).disabled).toBe(false)
})

it('rechecks the environment before a stale route quick sign-in button can call Auth', () => {
  host('localhost')
  mount()
  const quick = screen.getByRole('button', { name: 'Quick sign in (local only)' })
  auth.dev = false
  fireEvent.click(quick)
  auth.dev = true
  host('preview.example.test')
  fireEvent.click(quick)
  expect(auth.signInAnonymously).not.toHaveBeenCalled()
  expect(auth.signInWithOtp).not.toHaveBeenCalled()
  expectNativeSignIn()
})

it.each(['sdk-error', 'rejection'])('announces %s on the route and permits retry without fake Auth or email fallback', async failure => {
  host('localhost')
  if (failure === 'sdk-error') auth.signInAnonymously.mockResolvedValueOnce({ error: new Error('Anonymous Auth disabled') })
  else auth.signInAnonymously.mockRejectedValueOnce(new Error('Network failure'))
  mount()
  fireEvent.click(screen.getByRole('button', { name: 'Quick sign in (local only)' }))
  expect((await screen.findByRole('alert')).textContent).toMatch(/could not.*local.*sign.in/i)
  expectNativeSignIn()
  expect(auth.signInWithOtp).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Quick sign in (local only)' }))
  await screen.findByText(/Signed in.*disposable/)
  expect(auth.signInAnonymously).toHaveBeenCalledTimes(2)
})

it('keeps unavailable sign-in accessible and disables local quick Auth when unconfigured', () => {
  host('localhost')
  auth.configured = false
  mount()
  expect(screen.getByText('Sign-in unavailable').getAttribute('role')).toBe('status')
  expect((screen.getByRole('button', { name: 'Quick sign in (local only)' }) as HTMLButtonElement).disabled).toBe(true)
  expect(auth.signInAnonymously).not.toHaveBeenCalled()
})

it('does not offer quick Auth before session initialization completes', () => {
  host('localhost')
  auth.ready = false
  mount()
  expect(screen.queryByRole('button', { name: /quick sign in/i })).toBeNull()
  expect(auth.signInAnonymously).not.toHaveBeenCalled()
})

it('preserves the downtime destination when the shared forest screen offers local quick Auth', async () => {
  host('localhost')
  mount('/downtime-matchmaking')
  expectNativeSignIn('/downtime-matchmaking')
  fireEvent.click(screen.getByRole('button', { name: 'Quick sign in (local only)' }))
  await screen.findByText(/Signed in.*disposable/)
  expect(auth.signInAnonymously).toHaveBeenCalledExactlyOnceWith()
})
