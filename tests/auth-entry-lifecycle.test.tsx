import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Auth } from '../src/features/prototype/Onboarding'

const fixture = vi.hoisted(() => ({ session: null as { user: { id: string }; access_token: string } | null, listeners: new Set<(event: string, session: unknown) => void>(), getUser: vi.fn(), signInWithPassword: vi.fn(), signInAnonymously: vi.fn() }))
vi.mock('../src/auth/localDevelopment', () => ({ getLocalDevelopmentEnvironment: () => ({ dev: true, hostname: 'localhost' }), isLocalDevelopment: () => true }))
vi.mock('../src/supabase', () => ({ supabase: { auth: {
  getUser: fixture.getUser, signInWithPassword: fixture.signInWithPassword,
  signInAnonymously: fixture.signInAnonymously,
  onAuthStateChange(callback: (event: string, session: unknown) => void) {
    fixture.listeners.add(callback)
    queueMicrotask(() => { if (fixture.listeners.has(callback)) callback('INITIAL_SESSION', fixture.session) })
    return { data: { subscription: { unsubscribe() { fixture.listeners.delete(callback) } } } }
  },
} } }))
function Path() { return <output aria-label="Path">{useLocation().pathname}</output> }
beforeEach(() => {
  fixture.session = null
  fixture.getUser.mockReset().mockResolvedValue({ data: { user: { id: 'fixture-actor' } }, error: null })
  fixture.signInWithPassword.mockReset().mockImplementation(async () => {
    fixture.session = { user: { id: 'fixture-actor' }, access_token: 'fixture-token' }
    for (const listener of fixture.listeners) listener('SIGNED_IN', fixture.session)
    return { data: { session: fixture.session }, error: null }
  })
  fixture.signInAnonymously.mockReset().mockImplementation(fixture.signInWithPassword)
})
afterEach(() => cleanup())
async function submit() {
  fireEvent.click(await screen.findByRole('button', { name: 'Use password' }))
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'fixture@example.test' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Fixture-password-1!' } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in with password' }))
}
it('SDK SIGNED_IN notification does not unmount password verification before its redirect', async () => {
  render(<MemoryRouter initialEntries={['/login']}><Auth /><Path /></MemoryRouter>)
  await submit()
  await waitFor(() => expect(screen.getByLabelText('Path').textContent).toBe('/settings'))
  expect(fixture.getUser).toHaveBeenCalledTimes(1)
})
it('a self-initiated sign-in cannot use the entry-session returnTo redirect before readback', async () => {
  fixture.getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'private readback failure' } })
  render(<MemoryRouter initialEntries={['/login?returnTo=%2Fprofile']}><Auth /><Path /></MemoryRouter>)
  await submit()
  await screen.findByRole('alert')
  expect(screen.getByLabelText('Path').textContent).toBe('/login')
  expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('')
})
it('an existing entry session still follows the validated returnTo', async () => {
  fixture.session = { user: { id: 'fixture-actor' }, access_token: 'fixture-token' }
  render(<MemoryRouter initialEntries={['/login?returnTo=%2Fprofile']}><Auth /><Path /></MemoryRouter>)
  await waitFor(() => expect(screen.getByLabelText('Path').textContent).toBe('/profile'))
})
it('unavailable development sign-in remains on the entry form and never initiates anonymous authentication', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'Fixture not configured' }, { status: 503 })))
  render(<MemoryRouter initialEntries={['/login']}><Auth /><Path /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Sign in as development user', exact: true }))
  await screen.findByRole('alert')
  expect(screen.queryByLabelText('Password')).toBeNull()
  expect(screen.getByLabelText('Path').textContent).toBe('/login')
  expect(fixture.signInAnonymously).not.toHaveBeenCalled()
})
