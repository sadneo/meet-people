import { StrictMode, type ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { act, cleanup, fireEvent, render as rtlRender, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { EmailLinkSignIn } from '../src/auth/EmailLinkSignIn'
const render = (ui: ReactNode) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

const auth = vi.hoisted(() => ({
  signInAnonymously: vi.fn(),
  signInWithOtp: vi.fn(),
  signInWithPassword: vi.fn(),
  configured: true,
  dev: true,
}))
vi.mock('../src/auth/localDevelopment', async importOriginal => ({
  ...await importOriginal<typeof import('../src/auth/localDevelopment')>(),
  getLocalDevelopmentEnvironment: () => ({ dev: auth.dev, hostname: window.location.hostname }),
}))
vi.mock('../src/supabase', () => ({
  get supabase() { return auth.configured ? { auth } : null },
}))

function host(hostname: string) {
  const location = window.location
  vi.spyOn(window, 'location', 'get').mockReturnValue({
    ...location, hostname, origin: `http://${hostname}:3000`, pathname: '/login', search: '',
  })
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'Fixture not configured' }, { status: 503 })))
  auth.dev = true
  auth.configured = true
  auth.signInAnonymously.mockReset().mockResolvedValue({ error: null })
  auth.signInWithOtp.mockReset().mockResolvedValue({ error: null })
  auth.signInWithPassword.mockReset().mockResolvedValue({ error: new Error('Fixture authentication unavailable') })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })

it.each(['localhost', '127.0.0.1'])('offers one-click development sign-in only on dev %s, without anonymous authentication', async hostname => {
  host(hostname)
  render(<StrictMode><EmailLinkSignIn /></StrictMode>)
  expect(auth.signInAnonymously).not.toHaveBeenCalled()
  expect(auth.signInWithOtp).not.toHaveBeenCalled()
  expect(screen.getByText(/operator-provisioned local development account/i)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Sign in as development user', exact: true }))
  await screen.findByRole('alert')
  expect(screen.queryByLabelText('Password')).toBeNull()
  expect(auth.signInAnonymously).not.toHaveBeenCalled()
  expect(auth.signInWithOtp).not.toHaveBeenCalled()
  expect(auth.signInWithPassword).not.toHaveBeenCalled()
})

it.each([
  [true, 'preview.example.test'], [true, '192.168.1.12'], [true, '0.0.0.0'],
  [true, '::1'], [true, 'localhost.example.test'], [true, 'localhost.'],
  [true, '127.0.0.2'], [false, 'localhost'], [false, '127.0.0.1'],
  [false, 'preview.example.test'],
])('hides quick sign-in and never calls anonymous Auth with DEV=%s on %s', (dev, hostname) => {
  auth.dev = dev
  host(hostname)
  render(<EmailLinkSignIn />)
  expect(screen.queryByRole('button', { name: 'Sign in as development user', exact: true })).toBeNull()
  expect(screen.queryByText(/disposable.*anonymous.*session/i)).toBeNull()
  expect(auth.signInAnonymously).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Send sign-in link' })).toBeTruthy()
})

it('a missing dedicated account never falls back to anonymous authentication or ordinary password mode', async () => {
  host('localhost')
  render(<EmailLinkSignIn />)
  fireEvent.click(screen.getByRole('button', { name: 'Sign in as development user', exact: true }))
  expect(screen.getByLabelText('Email')).toHaveProperty('value', '')
  await screen.findByRole('alert')
  expect(screen.queryByLabelText('Password')).toBeNull()
  expect(auth.signInWithPassword).not.toHaveBeenCalled()
  expect(auth.signInAnonymously).not.toHaveBeenCalled()
  expect(auth.signInWithOtp).not.toHaveBeenCalled()
})

it('rechecks the environment before a stale quick sign-in button can call Auth', () => {
  host('localhost')
  render(<EmailLinkSignIn />)
  const quick = screen.getByRole('button', { name: 'Sign in as development user', exact: true })
  auth.dev = false
  fireEvent.click(quick)
  auth.dev = true
  host('preview.example.test')
  fireEvent.click(quick)
  expect(auth.signInAnonymously).not.toHaveBeenCalled()
  expect(auth.signInWithOtp).not.toHaveBeenCalled()
})

it.each(['unavailable', 'rejection'])('announces development endpoint %s without fallback and preserves email sign-in', async failure => {
  host('localhost')
  if (failure === 'rejection') vi.mocked(fetch).mockRejectedValue(new Error('Synthetic network failure'))
  render(<EmailLinkSignIn />)
  fireEvent.click(screen.getByRole('button', { name: 'Sign in as development user', exact: true }))
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'sam@example.test' } })
  expect((await screen.findByRole('alert')).textContent).toMatch(/development account is not ready/i)
  expect(auth.signInWithOtp).not.toHaveBeenCalled()
  expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('sam@example.test')
  fireEvent.click(screen.getByRole('button', { name: 'Send sign-in link' }))
  await screen.findByText('Check your email for a sign-in link.')
  expect(auth.signInWithOtp).toHaveBeenCalledExactlyOnceWith({
    email: 'sam@example.test', options: { emailRedirectTo: 'http://localhost:3000/auth/callback?returnTo=%2Fsettings' },
  })
  expect(auth.signInAnonymously).not.toHaveBeenCalled()
})

it('prevents duplicate email and competing anonymous requests while email is pending', async () => {
  host('localhost')
  let resolve!: (value: { error: null }) => void
  auth.signInWithOtp.mockReturnValue(new Promise(done => { resolve = done }))
  render(<EmailLinkSignIn />)
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'sam@example.test' } })
  const email = screen.getByRole('button', { name: 'Send sign-in link' })
  const quick = screen.getByRole('button', { name: 'Sign in as development user', exact: true })
  act(() => { fireEvent.submit(email.closest('form')!); fireEvent.submit(email.closest('form')!); quick.click() })
  expect(auth.signInWithOtp).toHaveBeenCalledTimes(1)
  expect(auth.signInAnonymously).not.toHaveBeenCalled()
  expect((quick as HTMLButtonElement).disabled).toBe(true)
  await act(async () => resolve({ error: null }))
  await screen.findByText('Check your email for a sign-in link.')
})

it('discloses unavailable configuration and disables quick sign-in without calling Auth', () => {
  host('localhost')
  auth.configured = false
  render(<EmailLinkSignIn />)
  expect(screen.getByRole('alert').textContent).toBe('Sign-in service is not configured.')
  expect((screen.getByRole('button', { name: 'Sign in as development user', exact: true }) as HTMLButtonElement).disabled).toBe(true)
  expect(screen.getByText(/operator-provisioned local development account/i)).toBeTruthy()
  expect(auth.signInAnonymously).not.toHaveBeenCalled()
})
