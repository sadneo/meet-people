import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { EmailLinkSignIn } from '../src/auth/EmailLinkSignIn'

const otp = vi.hoisted(() => vi.fn(async () => ({ error: null })))
vi.mock('../src/supabase', () => ({ supabase: { auth: { signInWithOtp: otp } } }))
afterEach(() => { cleanup(); otp.mockClear(); window.history.replaceState({}, '', '/') })
it('email-link callback keeps validated central event return without another auth client', async () => {
  const destination = '/events/e0000000-0000-4000-8000-000000000001'
  const login = `/login?returnTo=${encodeURIComponent(destination)}`
  window.history.replaceState({}, '', login)
  render(<EmailLinkSignIn />)
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'sam@example.test' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send sign-in link' }))
  await screen.findByText('Check your email for a sign-in link.')
  expect(otp).toHaveBeenCalledWith({ email: 'sam@example.test', options: { emailRedirectTo: `${window.location.origin}${login}` } })
})
it('never carries an external return destination into the email callback', async () => {
  window.history.replaceState({}, '', '/login?returnTo=%2F%2Fevil.test')
  render(<EmailLinkSignIn />)
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'sam@example.test' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send sign-in link' }))
  await screen.findByText('Check your email for a sign-in link.')
  expect(otp).toHaveBeenCalledWith({ email: 'sam@example.test', options: { emailRedirectTo: `${window.location.origin}/login` } })
})
