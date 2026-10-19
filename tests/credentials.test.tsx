import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { Session, User } from '@supabase/supabase-js'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AccountCredentials } from '../src/auth/AccountCredentials'

const mock = vi.hoisted(() => ({ getUser: vi.fn(), updateUser: vi.fn(), reauthenticate: vi.fn(), user: {} as User }))
vi.mock('../src/supabase', () => ({ supabase: { auth: mock } }))
const session = { access_token: 'fixture-token', user: { id: 'fixture-actor' } } as Session
function mount(current = session) { return render(<MemoryRouter><AccountCredentials session={current} ready /></MemoryRouter>) }
const button = (name: string) => screen.getByRole('button', { name, exact: true }) as HTMLButtonElement
const password = () => screen.getByLabelText('New password') as HTMLInputElement
const confirmation = () => screen.getByLabelText('Confirm new password') as HTMLInputElement
const fillPasswords = (value: string) => {
  fireEvent.change(password(), { target: { value } })
  fireEvent.change(confirmation(), { target: { value } })
}
beforeEach(() => {
  mock.user = { id: 'fixture-actor', email: 'old@example.test', email_confirmed_at: '2026-10-01', is_anonymous: false } as User
  mock.getUser.mockReset().mockImplementation(async () => ({ data: { user: mock.user }, error: null }))
  mock.updateUser.mockReset().mockResolvedValue({ data: { user: mock.user }, error: null })
  mock.reauthenticate.mockReset().mockResolvedValue({ error: null })
})
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks() })

it('blocks empty or mismatched confirmation locally, including direct form submission', async () => {
  mount(); await screen.findByLabelText('Sign-in email')
  fireEvent.change(password(), { target: { value: 'Example-password-82!' } })
  expect(button('Save password').disabled).toBe(true)
  const confirmation = screen.getByLabelText('Confirm new password') as HTMLInputElement
  fireEvent.change(confirmation, { target: { value: 'Different-password-82!' } })
  const feedback = screen.getByText('Passwords do not match.')
  expect(feedback.getAttribute('role')).toBe('status')
  expect(confirmation.getAttribute('aria-invalid')).toBe('true')
  expect(confirmation.getAttribute('aria-describedby')?.split(' ')).toContain(feedback.id)
  expect(button('Save password').disabled).toBe(true)
  fireEvent.submit(button('Save password').closest('form')!)
  expect(mock.updateUser).not.toHaveBeenCalled()
  expect(document.body.textContent).not.toContain('Different-password-82!')
})

it('requires matching password-manager fields and submits only the first password, clearing both drafts', async () => {
  const storage = vi.spyOn(Storage.prototype, 'setItem')
  mount(); await screen.findByLabelText('Sign-in email')
  const confirmation = screen.getByLabelText('Confirm new password') as HTMLInputElement
  expect(confirmation.type).toBe('password')
  expect(confirmation.autocomplete).toBe('new-password')
  expect(confirmation.labels?.[0].textContent).toBe('Confirm new password')
  fireEvent.change(password(), { target: { value: 'Example-password-82!' } })
  fireEvent.change(confirmation, { target: { value: 'Example-password-82!' } })
  expect(button('Save password').disabled).toBe(false)
  fireEvent.click(button('Save password'))
  await screen.findByText(/Password updated/)
  expect(mock.updateUser).toHaveBeenCalledExactlyOnceWith({ password: 'Example-password-82!' })
  expect(password().value).toBe('')
  expect(confirmation.value).toBe('')
  expect(storage).not.toHaveBeenCalled()
  expect(document.body.textContent).not.toContain('Example-password-82!')
})

it('reads current email from Auth, uses password-manager semantics and keeps credential actions separate', async () => {
  mount()
  const email = await screen.findByLabelText('Sign-in email') as HTMLInputElement
  await waitFor(() => expect(email.value).toBe('old@example.test'))
  expect(email.name).toBe('email'); expect(email.autocomplete).toBe('username')
  expect(password().type).toBe('password'); expect(password().autocomplete).toBe('new-password')
  expect(password().labels?.[0].textContent).toBe('New password')
  const help = screen.getByText('Use 8–128 characters.', { exact: true })
  expect(password().getAttribute('aria-describedby')).toBe(help.id)
  expect(screen.queryByText(/Email changes and password changes are saved separately/)).toBeNull()
  expect(screen.queryByText(/Verify your email, then close and reopen Manage/)).toBeNull()
  expect(button('Save email').disabled).toBe(true)
  expect(button('Save password').disabled).toBe(true)
  expect(mock.updateUser).not.toHaveBeenCalled()
  expect(screen.queryByText(/refresh account status/i)).toBeNull()
})
it('email update is pending confirmation, not success, until authoritative readback changes', async () => {
  const view = mount(); await screen.findByLabelText('Sign-in email')
  fireEvent.change(screen.getByLabelText('Sign-in email'), { target: { value: 'new@example.test' } })
  fireEvent.click(button('Save email'))
  await screen.findByText(/Email confirmation pending/)
  expect(mock.updateUser).toHaveBeenCalledWith({ email: 'new@example.test' }, { emailRedirectTo: `${window.location.origin}/auth/callback?returnTo=%2Fsettings` })
  expect(button('Save password').disabled).toBe(true)
  mock.user = { ...mock.user, email: 'new@example.test' }
  view.unmount(); mount()
  await waitFor(() => expect((screen.getByLabelText('Sign-in email') as HTMLInputElement).value).toBe('new@example.test'))
  expect(screen.queryByText(/Email confirmation pending/)).toBeNull()
  expect(mock.getUser.mock.calls.length).toBeGreaterThanOrEqual(3)
})
it('anonymous users must verify their email before setting a password', async () => {
  mock.user = { ...mock.user, email: undefined, email_confirmed_at: undefined, is_anonymous: true }
  const view = mount(); await screen.findByLabelText('Sign-in email')
  expect(button('Save password').disabled).toBe(true)
  expect(confirmation().disabled).toBe(true)
  await screen.findByText('Use 8–128 characters. Verify your email, then close and reopen Manage to set a password.', { exact: true })
  expect(screen.queryByText(/Verify an email before setting a password|Email changes and password changes are saved separately/)).toBeNull()
  fireEvent.change(screen.getByLabelText('Sign-in email'), { target: { value: 'upgrade@example.test' } })
  fireEvent.click(button('Save email')); await screen.findByText(/Email confirmation pending/)
  mock.user = { ...mock.user, email: 'upgrade@example.test', email_confirmed_at: '2026-10-14', is_anonymous: false }
  view.unmount(); mount()
  await waitFor(() => expect((screen.getByLabelText('Sign-in email') as HTMLInputElement).value).toBe('upgrade@example.test'))
  fillPasswords('Example-password-82!')
  expect(button('Save password').disabled).toBe(false)
})
it('password success clears the password, performs readback, and does not write email or storage', async () => {
  const storage = vi.spyOn(Storage.prototype, 'setItem')
  mount(); await screen.findByLabelText('Sign-in email')
  fillPasswords('short')
  expect(button('Save password').disabled).toBe(true)
  fillPasswords('x'.repeat(129))
  expect(button('Save password').disabled).toBe(true)
  fireEvent.submit(button('Save password').closest('form')!)
  expect(mock.updateUser).not.toHaveBeenCalled()
  fillPasswords('Example-password-82!')
  fireEvent.click(button('Save password'))
  await screen.findByText('Password updated. Use the new password next time you sign in.')
  expect(password().value).toBe('')
  expect(mock.updateUser).toHaveBeenCalledWith({ password: 'Example-password-82!' })
  expect(confirmation().value).toBe('')
  expect(mock.getUser).toHaveBeenCalledTimes(2)
  expect(storage).not.toHaveBeenCalled()
})
it('server-required secure reauthentication reveals nonce only when needed and retries with the nonce', async () => {
  mock.updateUser.mockResolvedValueOnce({ error: { code: 'reauthentication_needed', message: 'private diagnostic' } })
  mount(); await screen.findByLabelText('Sign-in email')
  expect(screen.queryByLabelText('Verification code')).toBeNull()
  fillPasswords('Example-password-82!')
  fireEvent.click(button('Save password'))
  await screen.findByRole('button', { name: 'Send verification code' })
  expect(password().value).toBe('')
  expect(confirmation().value).toBe('')
  fireEvent.click(button('Send verification code'))
  await screen.findByText('Verification code sent. Check your confirmed email.')
  expect(mock.reauthenticate).toHaveBeenCalledTimes(1)
  fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '123456' } })
  fireEvent.change(password(), { target: { value: 'Example-password-83!' } })
  expect(button('Save password').disabled).toBe(true)
  fireEvent.submit(button('Save password').closest('form')!)
  expect(mock.updateUser).toHaveBeenCalledTimes(1)
  fireEvent.change(confirmation(), { target: { value: 'Example-password-83!' } })
  fireEvent.click(button('Save password'))
  await screen.findByText(/Password updated/)
  expect(mock.updateUser).toHaveBeenLastCalledWith({ password: 'Example-password-83!', nonce: '123456' })
  expect(screen.queryByText('private diagnostic')).toBeNull()
})
it('guards duplicate submissions and drops pending results and passwords after identity change', async () => {
  let finish!: (value: unknown) => void
  mock.updateUser.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const view = mount(); await screen.findByLabelText('Sign-in email')
  fillPasswords('Example-password-82!')
  const form = button('Save password').closest('form')!
  fireEvent.submit(form); fireEvent.submit(form)
  expect(mock.updateUser).toHaveBeenCalledTimes(1)
  expect(password().value).toBe('')
  expect(confirmation().value).toBe('')
  mock.user = { ...mock.user, id: 'other-actor', email: 'other@example.test' }
  view.rerender(<MemoryRouter><AccountCredentials session={{ ...session, user: { ...session.user, id: 'other-actor' } }} ready /></MemoryRouter>)
  await waitFor(() => expect((screen.getByLabelText('Sign-in email') as HTMLInputElement).value).toBe('other@example.test'))
  expect(password().value).toBe('')
  expect(confirmation().value).toBe('')
  await act(async () => { finish({ error: null }) })
  expect(screen.queryByText(/Password updated/)).toBeNull()
})
it('keeps successful password writes distinct from failed readback and redacts provider errors', async () => {
  mount(); await screen.findByLabelText('Sign-in email')
  mock.getUser.mockRejectedValueOnce(new Error('secret-token-diagnostic'))
  fillPasswords('Example-password-82!')
  fireEvent.click(button('Save password'))
  await screen.findByText(/Password update accepted, but account readback failed/)
  expect(password().value).toBe('')
  expect(confirmation().value).toBe('')
  expect(document.body.textContent).not.toContain('secret-token-diagnostic')
})

it('invalid email and failed email writes never claim confirmation or submit passwords', async () => {
  mount(); await screen.findByLabelText('Sign-in email')
  fireEvent.change(screen.getByLabelText('Sign-in email'), { target: { value: 'invalid' } })
  expect(button('Save email').disabled).toBe(true)
  fireEvent.submit(button('Save email').closest('form')!)
  expect(mock.updateUser).not.toHaveBeenCalled()
  mock.updateUser.mockResolvedValueOnce({ error: { code: 'over_email_send_rate_limit', message: 'sensitive detail' } })
  fireEvent.change(screen.getByLabelText('Sign-in email'), { target: { value: 'other@example.test' } })
  fireEvent.click(button('Save email'))
  await screen.findByText('Too many requests. Wait before trying again.')
  expect(screen.queryByText(/Email confirmation pending/)).toBeNull()
  expect(document.body.textContent).not.toContain('sensitive detail')
})

it('failed initial read stays disabled and offers truthful reopen guidance without a refresh control', async () => {
  mock.getUser.mockRejectedValueOnce(new Error('private diagnostic'))
  mount()
  expect((await screen.findByRole('alert')).textContent).toContain('Close and reopen Manage')
  expect(button('Save email').disabled).toBe(true)
  expect(button('Save password').disabled).toBe(true)
  expect(screen.queryByText(/refresh account status/i)).toBeNull()
  expect(document.body.textContent).not.toContain('private diagnostic')
})

it('discards both unsent drafts on actor switch and unmount, and clears them on rejected writes', async () => {
  const view = mount(); await screen.findByLabelText('Sign-in email')
  fillPasswords('Unsent-password-82!')
  mock.user = { ...mock.user, id: 'other-actor' }
  const other = { ...session, user: { ...session.user, id: 'other-actor' } }
  view.rerender(<MemoryRouter><AccountCredentials session={other} ready /></MemoryRouter>)
  await waitFor(() => expect(password().disabled).toBe(false))
  expect(password().value).toBe('')
  expect(confirmation().value).toBe('')
  fillPasswords('Unsent-password-83!')
  view.unmount(); mount(other)
  await waitFor(() => expect(password().disabled).toBe(false))
  expect(password().value).toBe('')
  expect(confirmation().value).toBe('')
  mock.updateUser.mockResolvedValueOnce({ error: { code: 'weak_password' } })
  fillPasswords('Rejected-password-82!')
  fireEvent.click(button('Save password'))
  await screen.findByRole('alert')
  expect(password().value).toBe('')
  expect(confirmation().value).toBe('')
  expect(document.body.textContent).not.toContain('Rejected-password-82!')
})
