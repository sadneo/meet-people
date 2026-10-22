import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from '../src/App'
import { accountFixture, requiredPreferences } from './complete-profile-fixture'

const state = vi.hoisted(() => ({ session: null as null | { access_token: string; user: { id: string } }, signOut: vi.fn(), updateUser: vi.fn(), exchangeCodeForSession: vi.fn(), getUser: vi.fn(), resetPasswordForEmail: vi.fn() }))
vi.mock('../src/auth/useSession', () => ({ useSession: () => ({ ready: true, session: state.session }) }))
vi.mock('../src/supabase', () => ({ supabase: { auth: state } }))
vi.mock('../src/features/prototype/Home', () => ({ Home: () => <h1>Private home fixture</h1> }))
function Path() { const location = useLocation(); return <output aria-label="Path">{location.pathname}{location.search}</output> }
function mount(path: string) { return render(<MemoryRouter initialEntries={[path]}><App /><Path /></MemoryRouter>) }
beforeEach(() => {
  state.session = null
  vi.resetAllMocks()
  state.signOut.mockImplementation(async () => { state.session = null; return { error: null } })
  state.updateUser.mockResolvedValue({ error: null })
  state.resetPasswordForEmail.mockResolvedValue({ error: null })
  vi.stubGlobal('scrollTo', () => {})
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ code: 'provider', error: 'Unavailable' }, { status: 503 })))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, '', '/'); localStorage.clear() })
it('shows public welcome at signed-out root without reading private data', async () => {
  const view = mount('/')
  expect(view.container.querySelector('.public-site')).toBeTruthy()
  expect(screen.queryByText('Private home fixture')).toBeNull()
  expect(fetch).not.toHaveBeenCalled()
})
it('retries a failed startup read once then signs out locally with an explanation', async () => {
  state.session = { access_token: 'fixture', user: { id: 'owner' } }
  mount('/')
  await screen.findByRole('heading', { name: 'Welcome to Pebble' })
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(state.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' })
  expect(screen.getByText('We couldn’t load your account. Please sign in again.')).toBeTruthy()
  expect(screen.queryByText('Profile unavailable')).toBeNull()
})
it('a transient startup failure recovers without logging out', async () => {
  state.session = { access_token: 'fixture', user: { id: 'owner' } }
  vi.mocked(fetch).mockImplementationOnce(async () => Response.json({}, { status: 503 })).mockImplementation(async input => Response.json(String(input).endsWith('/account') ? accountFixture({ username: 'fixture', display_name: 'Fixture', bio: null, avatar_url: null, ...requiredPreferences }) : { notifications: [], unreadCount: 0 }))
  mount('/')
  await screen.findByRole('heading', { name: 'Private home fixture' })
  expect(state.signOut).not.toHaveBeenCalled()
})
it('legacy completed markers with missing birthdate/campus resume onboarding instead of logging out', async () => {
  state.session = { access_token: 'fixture', user: { id: 'owner' } }
  const legacy = accountFixture({ username: 'fixture', display_name: 'Fixture', bio: null, avatar_url: null, ...requiredPreferences })
  legacy.profile = { ...legacy.profile!, birthdate: null, location_city: null }
  vi.mocked(fetch).mockImplementation(async () => Response.json(legacy))
  mount('/')
  await screen.findByRole('heading', { name: 'Complete onboarding' })
  expect(screen.getByRole('heading', { name: 'Availability & preferences' })).toBeTruthy()
  expect(state.signOut).not.toHaveBeenCalled()
  expect(screen.queryByText('Private home fixture')).toBeNull()
})
it('prefills recovery email and provides a branded confirmation with resend cooldown', async () => {
  const view = render(<MemoryRouter initialEntries={[{ pathname: '/forgot-password', state: { email: 'fixture@example.test' } }]}><App /></MemoryRouter>)
  expect(screen.getByLabelText('Email')).toHaveProperty('value', 'fixture@example.test')
  expect(view.container.querySelector('.pt-auth-email-first')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
  await screen.findByRole('heading', { name: 'Check your email' })
  expect(screen.getByRole('button', { name: /Resend link in/ })).toHaveProperty('disabled', true)
})
it('a verified recovery grant allows password reset without any profile requests', async () => {
  state.session = { access_token: 'recovery', user: { id: 'owner' } }
  state.exchangeCodeForSession.mockResolvedValue({ data: { session: state.session }, error: null })
  state.getUser.mockResolvedValue({ data: { user: state.session.user }, error: null })
  const path = '/auth/callback?code=fixture&flow=recovery'
  window.history.replaceState({}, '', path)
  mount(path)
  await screen.findByRole('heading', { name: 'Choose a new password' })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'New-password-123!' } })
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'New-password-123!' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save password' }))
  await screen.findByRole('heading', { name: 'Password updated' })
  expect(state.updateUser).toHaveBeenCalledExactlyOnceWith({ password: 'New-password-123!' })
  expect(fetch).not.toHaveBeenCalled()
  expect(window.location.search).toBe('')
})
it('a rejected session does not retry unauthorized account reads', async () => {
  state.session = { access_token: 'expired', user: { id: 'owner' } }
  vi.mocked(fetch).mockResolvedValue(Response.json({ code: 'unauthorized', error: 'Expired' }, { status: 401 }))
  mount('/profile')
  await waitFor(() => expect(state.signOut).toHaveBeenCalledTimes(1))
  expect(fetch).toHaveBeenCalledTimes(1)
})
it('expired recovery links stay public and offer a fresh link despite an existing session', async () => {
  state.session = { access_token: 'old-session', user: { id: 'owner' } }
  state.exchangeCodeForSession.mockResolvedValue({ error: { code: 'otp_expired' } })
  window.history.replaceState({}, '', '/reset-password?code=expired')
  mount('/reset-password?code=expired')
  await screen.findByRole('alert')
  expect(screen.getByRole('link', { name: 'Request recovery link' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Save password' })).toBeNull()
  expect(fetch).not.toHaveBeenCalled()
})
it('failed local signout offers an explicit retry without mounting private content', async () => {
  state.session = { access_token: 'fixture', user: { id: 'owner' } }
  state.signOut.mockResolvedValueOnce({ error: { message: 'Unavailable' } })
  mount('/profile')
  const retry = await screen.findByRole('button', { name: 'Return to sign in' })
  expect(screen.queryByText('Profile unavailable')).toBeNull()
  fireEvent.click(retry)
  await screen.findByRole('heading', { name: 'Welcome to Pebble' })
  expect(state.signOut).toHaveBeenCalledTimes(2)
})
