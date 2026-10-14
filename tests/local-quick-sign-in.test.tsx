import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { EmailLinkSignIn } from '../src/auth/EmailLinkSignIn'

const auth = vi.hoisted(() => ({
  signInAnonymously: vi.fn(),
  signInWithOtp: vi.fn(),
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
  auth.dev = true
  auth.configured = true
  auth.signInAnonymously.mockReset().mockResolvedValue({ error: null })
  auth.signInWithOtp.mockReset().mockResolvedValue({ error: null })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllEnvs() })

it.each(['localhost', '127.0.0.1'])('offers explicit real anonymous SDK sign-in only on dev %s', async hostname => {
  host(hostname)
  render(<StrictMode><EmailLinkSignIn /></StrictMode>)
  expect(auth.signInAnonymously).not.toHaveBeenCalled()
  expect(auth.signInWithOtp).not.toHaveBeenCalled()
  expect(screen.getByText(/disposable.*anonymous.*session/i)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Quick sign in (local only)' }))
  await screen.findByText(/Signed in/)
  expect(auth.signInAnonymously).toHaveBeenCalledExactlyOnceWith()
  expect(auth.signInWithOtp).not.toHaveBeenCalled()
  expect(screen.getByRole('status').textContent).toContain('Signed in')
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
  expect(screen.queryByRole('button', { name: /quick sign in/i })).toBeNull()
  expect(screen.queryByText(/disposable.*anonymous.*session/i)).toBeNull()
  expect(auth.signInAnonymously).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Send sign-in link' })).toBeTruthy()
})

it('announces pending state and prevents duplicate and competing email requests', async () => {
  host('localhost')
  let resolve!: (value: { error: null }) => void
  auth.signInAnonymously.mockReturnValue(new Promise(done => { resolve = done }))
  render(<EmailLinkSignIn />)
  const quick = screen.getByRole('button', { name: 'Quick sign in (local only)' })
  const email = screen.getByRole('button', { name: 'Send sign-in link' })
  act(() => { quick.click(); quick.click(); fireEvent.submit(email.closest('form')!) })
  expect(screen.getByRole('status').textContent).toContain('Signing in')
  expect((quick as HTMLButtonElement).disabled).toBe(true)
  expect((email as HTMLButtonElement).disabled).toBe(true)
  expect(auth.signInAnonymously).toHaveBeenCalledTimes(1)
  expect(auth.signInWithOtp).not.toHaveBeenCalled()
  await act(async () => resolve({ error: null }))
  expect((email as HTMLButtonElement).disabled).toBe(false)
})

it('rechecks the environment before a stale quick sign-in button can call Auth', () => {
  host('localhost')
  render(<EmailLinkSignIn />)
  const quick = screen.getByRole('button', { name: 'Quick sign in (local only)' })
  auth.dev = false
  fireEvent.click(quick)
  auth.dev = true
  host('preview.example.test')
  fireEvent.click(quick)
  expect(auth.signInAnonymously).not.toHaveBeenCalled()
  expect(auth.signInWithOtp).not.toHaveBeenCalled()
})

it.each(['sdk-error', 'rejection'])('announces %s without fallback and preserves email sign-in', async failure => {
  host('localhost')
  if (failure === 'sdk-error') auth.signInAnonymously.mockResolvedValue({ error: new Error('Anonymous sign-ins disabled') })
  else auth.signInAnonymously.mockRejectedValue(new Error('Network failure'))
  render(<EmailLinkSignIn />)
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'sam@example.test' } })
  fireEvent.click(screen.getByRole('button', { name: 'Quick sign in (local only)' }))
  expect((await screen.findByRole('alert')).textContent).toMatch(/could not.*local.*sign.in/i)
  expect(auth.signInWithOtp).not.toHaveBeenCalled()
  expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('sam@example.test')
  fireEvent.click(screen.getByRole('button', { name: 'Send sign-in link' }))
  await screen.findByText('Check your email for a sign-in link.')
  expect(auth.signInWithOtp).toHaveBeenCalledExactlyOnceWith({
    email: 'sam@example.test', options: { emailRedirectTo: 'http://localhost:3000/login' },
  })
  expect(auth.signInAnonymously).toHaveBeenCalledTimes(1)
})

it('prevents duplicate email and competing anonymous requests while email is pending', async () => {
  host('localhost')
  let resolve!: (value: { error: null }) => void
  auth.signInWithOtp.mockReturnValue(new Promise(done => { resolve = done }))
  render(<EmailLinkSignIn />)
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'sam@example.test' } })
  const email = screen.getByRole('button', { name: 'Send sign-in link' })
  const quick = screen.getByRole('button', { name: 'Quick sign in (local only)' })
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
  expect((screen.getByRole('button', { name: 'Quick sign in (local only)' }) as HTMLButtonElement).disabled).toBe(true)
  expect(screen.getByText(/disposable.*anonymous.*session/i)).toBeTruthy()
  expect(auth.signInAnonymously).not.toHaveBeenCalled()
})
