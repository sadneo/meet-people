import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, it, vi } from 'vitest'
import { Auth, AuthCallback } from '../../src/ui/Auth'

const auth = vi.hoisted(() => ({ signUp: vi.fn(), resend: vi.fn(), resetPasswordForEmail: vi.fn() }))
vi.mock('../../src/supabase', () => ({ supabase: { auth } }))
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); vi.clearAllMocks() })

it('has no dead home link or logo link on the signed-out sign-in screen', () => {
  render(<MemoryRouter initialEntries={['/login?returnTo=%2Fcommunity']}><Auth /></MemoryRouter>)
  expect(screen.queryByRole('link', { name: /back to home/i })).toBeNull()
  expect(screen.queryByRole('link', { name: /pebble home/i })).toBeNull()
})

it('shows a check-your-inbox state after sign-up with resend cooldown and a way back', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  auth.signUp.mockResolvedValue({ error: null, data: { session: null } })
  auth.resend.mockResolvedValue({ error: null })
  render(<MemoryRouter initialEntries={['/register']}><Auth mode="register" /></MemoryRouter>)
  fireEvent.change(screen.getByRole('textbox', { name: /email/i }), { target: { value: 'new@example.test' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Synthetic-password-1!' } })
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'Synthetic-password-1!' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
  expect(await screen.findByRole('heading', { name: 'Check your inbox' })).toBeTruthy()
  expect(screen.getByText('new@example.test')).toBeTruthy()
  expect((screen.getByRole('button', { name: /Resend in/ }) as HTMLButtonElement).disabled).toBe(true)
  expect(screen.getByRole('link', { name: 'reset your password' })).toBeTruthy()
  for (let second = 0; second < 31; second++) await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  fireEvent.click(screen.getByRole('button', { name: 'Resend email' }))
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  expect(auth.resend).toHaveBeenCalledWith(expect.objectContaining({ type: 'signup', email: 'new@example.test' }))
  fireEvent.click(screen.getByRole('button', { name: 'Use a different email' }))
  expect(screen.getByRole('button', { name: 'Create account' })).toBeTruthy()
})

it('uses the recovery resend after requesting a password reset', async () => {
  auth.resetPasswordForEmail.mockResolvedValue({ error: null })
  render(<MemoryRouter initialEntries={['/forgot-password']}><Auth mode="forgot" /></MemoryRouter>)
  fireEvent.change(screen.getByRole('textbox', { name: /email/i }), { target: { value: 'a@example.test' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send recovery link' }))
  expect(await screen.findByRole('heading', { name: 'Check your inbox' })).toBeTruthy()
  expect(screen.queryByText(/Already have an account/)).toBeNull()
})

it('explains an expired link, leads with sign in and offers a recovery resend for recovery links', async () => {
  window.history.replaceState(null, '', '/auth/callback?flow=recovery&returnTo=%2Fcommunity#error=access_denied&error_code=otp_expired')
  render(<MemoryRouter><AuthCallback /></MemoryRouter>)
  expect(await screen.findByText(/already used or has expired/)).toBeTruthy()
  const links = screen.getAllByRole('link').map(link => link.textContent)
  expect(links.indexOf('Sign in')).toBeLessThan(links.indexOf('Send a new reset link'))
})

it('offers to resend the confirmation for an expired confirmation link', async () => {
  auth.resend.mockResolvedValue({ error: null })
  window.history.replaceState(null, '', '/auth/callback?error=access_denied&error_code=otp_expired')
  render(<MemoryRouter><AuthCallback /></MemoryRouter>)
  fireEvent.change(await screen.findByLabelText(/new confirmation link/i), { target: { value: 'x@example.test' } })
  fireEvent.click(screen.getByRole('button', { name: 'Resend confirmation' }))
  await waitFor(() => expect(auth.resend).toHaveBeenCalledWith(expect.objectContaining({ type: 'signup', email: 'x@example.test' })))
})
