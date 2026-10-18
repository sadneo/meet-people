import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AuthScreen } from '../src/auth/AuthScreen'

const auth = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  signInWithPassword: vi.fn(), signUp: vi.fn(), signInWithOAuth: vi.fn(), resetPasswordForEmail: vi.fn(), updateUser: vi.fn(), resend: vi.fn(),
}))
vi.mock('../src/auth/useSession', () => ({ useSession: () => ({ session: auth.session, ready: true }) }))
vi.mock('../src/supabase', () => ({ supabase: { auth } }))
beforeEach(() => {
  auth.session = null
  for (const method of [auth.signInWithPassword, auth.signUp, auth.signInWithOAuth, auth.resetPasswordForEmail, auth.updateUser, auth.resend]) method.mockReset().mockResolvedValue({ data: { session: null }, error: null })
})
afterEach(cleanup)
it('registers with email/password and shows confirmation rather than claiming a signed-in session', async () => {
  render(<MemoryRouter><AuthScreen mode="register" /></MemoryRouter>)
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'student@example.test' } })
  fireEvent.change(screen.getByLabelText('Password', { exact: true }), { target: { value: 'long-password' } })
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'long-password' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create account', exact: true }))
  await screen.findByText(/Check your email to confirm/)
  expect(auth.signUp).toHaveBeenCalledWith(expect.objectContaining({ email: 'student@example.test', password: 'long-password' }))
  fireEvent.click(screen.getByRole('button', { name: 'Resend confirmation' }))
  await waitFor(() => expect(auth.resend).toHaveBeenCalledWith(expect.objectContaining({ type: 'signup', email: 'student@example.test' })))
})
it('shows failed password login and sends Google through a safe callback', async () => {
  auth.signInWithPassword.mockResolvedValue({ error: new Error('Invalid login credentials') })
  render(<MemoryRouter initialEntries={['/login?returnTo=https%3A%2F%2Fevil.test']}><AuthScreen /></MemoryRouter>)
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'student@example.test' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'bad-password' } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in', exact: true }))
  await screen.findByRole('alert')
  expect(screen.getByText('Invalid login credentials')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
  await waitFor(() => expect(auth.signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback?returnTo=%2F` } }))
})
it('requests recovery and updates the password only after matching confirmation', async () => {
  const view = render(<MemoryRouter><AuthScreen mode="forgot" /></MemoryRouter>)
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'student@example.test' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
  await screen.findByText(/If this email has an account/)
  expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('student@example.test', { redirectTo: `${window.location.origin}/reset-password` })
  auth.session = { user: { id: 'student' } }
  view.rerender(<MemoryRouter><AuthScreen mode="reset" /></MemoryRouter>)
  fireEvent.change(screen.getByLabelText('Password', { exact: true }), { target: { value: 'new-password' } })
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'mismatch-password' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save password' }))
  await screen.findByText('Passwords do not match.')
  expect(auth.updateUser).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'new-password' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save password' }))
  await screen.findByText('Your password has been updated.')
  expect(auth.updateUser).toHaveBeenCalledWith({ password: 'new-password' })
})
