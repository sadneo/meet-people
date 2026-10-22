// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AuthScreen } from '../../src/auth/AuthScreen'
const state = vi.hoisted(() => ({ dev: true, hostname: 'localhost', login: vi.fn() }))
vi.mock('../../src/supabase', () => ({ supabase: { auth: {} } }))
vi.mock('../../src/auth/useSession', () => ({ useSession: () => ({ session: null, ready: true }) }))
vi.mock('../../src/auth/account-context', () => ({ useAccount: () => null }))
vi.mock('../../src/auth/developmentLogin', () => ({ signInDevelopmentUser: state.login }))
vi.mock('../../src/auth/localDevelopment', () => ({ getLocalDevelopmentEnvironment: () => state, isLocalDevelopment: (s: typeof state) => s.dev && ['localhost', '127.0.0.1'].includes(s.hostname) }))
beforeEach(() => { state.dev = true; state.hostname = 'localhost'; state.login.mockReset().mockResolvedValue(undefined) })
afterEach(() => { cleanup(); vi.unstubAllEnvs() })
function mount() { render(<MemoryRouter initialEntries={['/login']}><AuthScreen /></MemoryRouter>) }
it('matches upstream email entry and invokes existing dev helper once without bypass navigation', async () => {
  mount()
  expect(screen.getByRole('button', { name: 'Continue with email' })).toBeTruthy()
  expect(screen.queryByText('New to Pebble?')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Sign in as development user' }))
  await waitFor(() => expect(state.login).toHaveBeenCalledTimes(1))
  expect(state.login.mock.calls[0][1]()).toBe(true)
  await screen.findByRole('button', { name: 'Sign in as development user' })
})
it('shows a safe provisioning error without exposing diagnostics', async () => {
  state.login.mockRejectedValue(new Error('private-server-detail')); mount()
  fireEvent.click(screen.getByRole('button', { name: 'Sign in as development user' }))
  await screen.findByText(/The development account is not ready/)
  expect(document.body.textContent).not.toContain('private-server-detail')
})
it.each(['preview.example.test', '192.168.1.2'])('hides development login on %s', hostname => {
  state.hostname = hostname; mount()
  expect(screen.queryByRole('button', { name: 'Sign in as development user' })).toBeNull()
})
it('hides development login in production', () => {
  vi.stubEnv('DEV', false); mount()
  expect(screen.queryByRole('button', { name: 'Sign in as development user' })).toBeNull()
})
