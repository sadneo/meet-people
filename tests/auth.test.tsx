import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AuthScreen } from '../src/auth/AuthScreen'

const auth = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  signInWithPassword: vi.fn(), signUp: vi.fn(), signInWithOAuth: vi.fn(), resetPasswordForEmail: vi.fn(), updateUser: vi.fn(), resend: vi.fn(),
}))
const lookup = vi.fn()
vi.mock('../src/auth/useSession', () => ({ useSession: () => ({ session: auth.session, ready: true }) }))
vi.mock('../src/supabase', () => ({ supabase: { auth } }))
vi.mock('../src/auth/account-context', () => ({ useAccount: () => ({ loaded: true, account: { completed: [0, 1, 2, 3] } }) }))
function HistoryBack() {
  const navigate = useNavigate()
  return <button onClick={() => navigate(-1)}>Browser back</button>
}
function show(path = '/login') {
  return render(<MemoryRouter initialEntries={[path]}><HistoryBack /><Routes>
    <Route path="/login" element={<AuthScreen />} />
    <Route path="/register" element={<AuthScreen mode="register" />} />
    <Route path="/forgot-password" element={<AuthScreen mode="forgot" />} />
    <Route path="/reset-password" element={<AuthScreen mode="reset" />} />
    <Route path="/auth/callback" element={<AuthScreen mode="callback" />} />
    <Route path="/events" element={<p>Protected destination</p>} />
    <Route path="/" element={<p>Home destination</p>} />
  </Routes></MemoryRouter>)
}
async function continueEmail(exists = false) {
  lookup.mockResolvedValue(new Response(JSON.stringify({ exists })))
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'student@example.test' } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue with email' }))
  await screen.findByRole('heading', { name: exists ? 'Welcome back' : 'Create your account' })
}
beforeEach(() => {
  auth.session = null
  lookup.mockReset()
  vi.stubGlobal('fetch', lookup)
  for (const method of [auth.signInWithPassword, auth.signUp, auth.signInWithOAuth, auth.resetPasswordForEmail, auth.updateUser, auth.resend]) method.mockReset().mockResolvedValue({ data: { session: null }, error: null })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('starts with email only, branches new emails into registration, and confirms without a session', async () => {
  show()
  expect(screen.queryByLabelText('Password')).toBeNull()
  expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeTruthy()
  await continueEmail()
  expect(lookup).toHaveBeenCalledWith('/api/auth/email', expect.objectContaining({ method: 'POST', body: JSON.stringify({ email: 'student@example.test' }) }))
  expect(screen.getByRole('heading').contains(document.activeElement)).toBe(true)
  fireEvent.change(screen.getByLabelText('Password', { exact: true }), { target: { value: 'long-password' } })
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'long-password' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create account', exact: true }))
  await screen.findByText(/Check your email to confirm/)
  expect(auth.signUp).toHaveBeenCalledWith(expect.objectContaining({ email: 'student@example.test', password: 'long-password' }))
  expect(screen.queryByText('Home destination')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Resend confirmation' }))
  await waitFor(() => expect(auth.resend).toHaveBeenCalledWith(expect.objectContaining({ type: 'signup', email: 'student@example.test' })))
})
it('keeps fields after a failed password login and permits retry', async () => {
  auth.signInWithPassword.mockResolvedValueOnce({ error: { code: 'invalid_credentials', message: 'raw backend error' } })
  show()
  await continueEmail(true)
  const password = screen.getByLabelText('Password') as HTMLInputElement
  fireEvent.change(password, { target: { value: 'bad-password' } })
  fireEvent.submit(password.closest('form')!)
  await screen.findByText('Incorrect email or password. Please try again.')
  expect(password.value).toBe('bad-password')
  expect(screen.queryByRole('alert')).toBeNull()
  fireEvent.change(password, { target: { value: 'good-password' } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in', exact: true }))
  await waitFor(() => expect(auth.signInWithPassword).toHaveBeenCalledTimes(2))
})
it('preserves email and password on Change and browser back, and clears passwords when email changes', async () => {
  show()
  await continueEmail(true)
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'retained-password' } })
  fireEvent.click(screen.getByRole('button', { name: 'Change', exact: true }))
  expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('student@example.test')
  fireEvent.click(screen.getByRole('button', { name: 'Browser back' }))
  expect((await screen.findByLabelText('Password') as HTMLInputElement).value).toBe('retained-password')
  fireEvent.click(screen.getByRole('button', { name: 'Change', exact: true }))
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'other@example.test' } })
  lookup.mockResolvedValue(new Response(JSON.stringify({ exists: true })))
  fireEvent.click(screen.getByRole('button', { name: 'Continue with email' }))
  expect((await screen.findByLabelText('Password') as HTMLInputElement).value).toBe('')
})
it('reuses email for recovery and returns to password sign-in', async () => {
  show('/login?returnTo=%2Fevents')
  await continueEmail(true)
  fireEvent.click(screen.getByRole('link', { name: 'Forgot password?' }))
  expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('student@example.test')
  fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
  await screen.findByText(/If student@example.test has an account/)
  expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('student@example.test', { redirectTo: `${window.location.origin}/reset-password?returnTo=%2Fevents` })
  fireEvent.click(screen.getByRole('button', { name: 'Change email' }))
  expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('student@example.test')
  fireEvent.click(screen.getByRole('link', { name: 'Back to sign in' }))
  await screen.findByRole('heading', { name: 'Welcome back' })
})
it('checks password confirmation and handles duplicate registration without claiming success', async () => {
  auth.signUp.mockResolvedValue({ data: { session: null, user: { identities: [] } }, error: null })
  show('/register')
  await continueEmail()
  fireEvent.change(screen.getByLabelText('Password', { exact: true }), { target: { value: 'long-password' } })
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'different-password' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create account', exact: true }))
  await screen.findByText('Passwords do not match. Please check both fields.')
  expect(auth.signUp).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'long-password' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create account', exact: true }))
  await screen.findByText(/An account already uses this email/)
  fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }))
  await screen.findByRole('heading', { name: 'Welcome back' })
})
it('toggles password visibility and prevents duplicate submissions while pending', async () => {
  let finish!: (value: { error: null }) => void
  auth.signInWithPassword.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  show()
  await continueEmail(true)
  const password = screen.getByLabelText('Password') as HTMLInputElement
  fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
  expect(password.type).toBe('text')
  fireEvent.click(screen.getByRole('button', { name: 'Hide password' }))
  expect(password.type).toBe('password')
  fireEvent.change(password, { target: { value: 'long-password' } })
  fireEvent.submit(password.closest('form')!)
  fireEvent.submit(password.closest('form')!)
  const pending = screen.getByRole('button', { name: 'Signing in…' }) as HTMLButtonElement
  expect(pending.disabled).toBe(true)
  expect((screen.getByRole('button', { name: 'Continue with Google' }) as HTMLButtonElement).disabled).toBe(true)
  expect(auth.signInWithPassword).toHaveBeenCalledTimes(1)
  finish({ error: null })
  await waitFor(() => expect((screen.getByRole('button', { name: 'Sign in', exact: true }) as HTMLButtonElement).disabled).toBe(false))
})
it('handles lookup failures and rate limits without losing email or exposing technical errors', async () => {
  show()
  lookup.mockResolvedValue(new Response('{}', { status: 429 }))
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'student@example.test' } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue with email' }))
  await screen.findByText(/Too many attempts/)
  expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('student@example.test')
  lookup.mockRejectedValue(new Error('private SQL details'))
  fireEvent.click(screen.getByRole('button', { name: 'Continue with email' }))
  await screen.findByText('Could not connect to sign-in. Please try again.')
  expect(screen.queryByText('private SQL details')).toBeNull()
})
it('does not let a late email lookup undo browser back navigation', async () => {
  show()
  await continueEmail(true)
  fireEvent.click(screen.getByRole('button', { name: 'Change', exact: true }))
  let finish!: (response: Response) => void
  lookup.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue with email' }))
  expect((screen.getByRole('button', { name: 'Continuing…' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Browser back' }))
  await screen.findByRole('heading', { name: 'Welcome back' })
  finish(new Response(JSON.stringify({ exists: false })))
  await waitFor(() => expect((screen.getByRole('button', { name: 'Sign in', exact: true }) as HTMLButtonElement).disabled).toBe(false))
  expect(screen.queryByRole('heading', { name: 'Create your account' })).toBeNull()
})
it('allows Google retry from the initial screen with a safe callback', async () => {
  auth.signInWithOAuth.mockResolvedValueOnce({ error: { message: 'private Google configuration' } })
  show('/login?returnTo=https%3A%2F%2Fevil.test')
  fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
  await screen.findByText(/Google sign-in did not complete/)
  fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
  await waitFor(() => expect(auth.signInWithOAuth).toHaveBeenCalledTimes(2))
  expect(auth.signInWithOAuth).toHaveBeenLastCalledWith({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback?returnTo=%2F` } })
})
it.each(['/auth/callback', '/auth/callback?error=access_denied&error_description=private-details', '/auth/callback?code=invalid'])('returns an unusable callback to a usable email/Google form: %s', path => {
  show(path)
  expect(screen.getByText(/Sign-in did not complete/)).toBeTruthy()
  expect(screen.getByLabelText('Email')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeTruthy()
  expect(screen.queryByText('private-details')).toBeNull()
})
it('redirects a valid callback session to the protected destination', async () => {
  auth.session = { user: { id: 'student' } }
  show('/auth/callback?returnTo=%2Fevents')
  await screen.findByText('Protected destination')
})
it('handles expired recovery links and updates passwords only after matching confirmation', async () => {
  const view = show('/reset-password')
  expect(screen.getByText(/recovery link is invalid or expired/)).toBeTruthy()
  expect(auth.updateUser).not.toHaveBeenCalled()
  view.unmount()
  auth.session = { user: { id: 'student' } }
  show('/reset-password')
  fireEvent.change(screen.getByLabelText('Password', { exact: true }), { target: { value: 'new-password' } })
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'different-password' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save password' }))
  await screen.findByText(/Passwords do not match/)
  expect(auth.updateUser).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'new-password' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save password' }))
  await screen.findByText('Your password has been updated.')
  expect(auth.updateUser).toHaveBeenCalledWith({ password: 'new-password' })
})
