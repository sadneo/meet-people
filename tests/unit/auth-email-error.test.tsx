import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, it, vi } from 'vitest'
import { Auth } from '../../src/ui/Auth'

const signIn = vi.hoisted(() => vi.fn())
vi.mock('../../src/supabase', () => ({ supabase: { auth: { signInWithPassword: signIn } } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks() })

it('signs in directly, hides provider diagnostics and allows an explicit retry', async () => {
  signIn.mockResolvedValueOnce({ error: new Error('Private provider diagnostic') }).mockResolvedValue({ error: null })
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  render(<MemoryRouter><Auth /></MemoryRouter>)
  fireEvent.change(screen.getByRole('textbox', { name: /email/i }), { target: { value: 'qa@example.test' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Synthetic-password-1!' } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in', exact: true }))
  const alert = await screen.findByRole('alert')
  expect(alert.textContent).toMatch(/Could not sign in/)
  expect(alert.textContent).not.toMatch(/Private provider diagnostic/)
  fireEvent.click(screen.getByRole('button', { name: 'Sign in', exact: true }))
  await waitFor(() => expect(signIn).toHaveBeenCalledTimes(2))
  expect(fetcher).not.toHaveBeenCalled()
})
