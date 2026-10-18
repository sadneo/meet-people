import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { EmailLinkSignIn } from '../src/auth/EmailLinkSignIn'
import { AuthCallback, ForgotPassword } from '../src/auth/CredentialRoutes'

const auth = vi.hoisted(() => ({ signInWithPassword: vi.fn(), signInWithOtp: vi.fn(), resetPasswordForEmail: vi.fn(), getSession: vi.fn(), getUser: vi.fn(), exchangeCodeForSession: vi.fn(), setSession: vi.fn(), verifyOtp: vi.fn() }))
vi.mock('../src/supabase', () => ({ supabase: { auth } }))
const actor = { id: 'fixture-actor', email: 'one@example.test' }
function Path() { return <output aria-label="Path">{useLocation().pathname}{useLocation().search}</output> }
beforeEach(() => {
  for (const fn of Object.values(auth)) fn.mockReset().mockResolvedValue({ error: null })
  auth.getSession.mockResolvedValue({ data: { session: { user: actor } }, error: null })
  auth.getUser.mockResolvedValue({ data: { user: actor }, error: null })
  for (const fn of [auth.exchangeCodeForSession, auth.setSession, auth.verifyOtp]) fn.mockResolvedValue({ data: { session: { user: actor } }, error: null })
})
afterEach(() => { cleanup(); window.history.replaceState({}, '', '/') })

it('password sign-in coexists with email links and clears submitted password even on failure', async () => {
  auth.signInWithPassword.mockResolvedValue({ error: { message: 'secret diagnostic' } })
  render(<MemoryRouter><EmailLinkSignIn /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Use password' }))
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'one@example.test' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Fixture-password-1!' } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in with password' }))
  await screen.findByRole('alert')
  expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'one@example.test', password: 'Fixture-password-1!' })
  expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('')
  expect(document.body.textContent).not.toContain('secret diagnostic')
  expect(screen.getByRole('link', { name: 'Forgot password?' }).getAttribute('href')).toBe('/auth/forgot-password')
  fireEvent.click(screen.getByRole('button', { name: 'Use email link' }))
  expect(screen.getByRole('button', { name: 'Send sign-in link' })).toBeTruthy()
})
it('recovery uses the local callback and enumeration-neutral success copy', async () => {
  render(<MemoryRouter><ForgotPassword /></MemoryRouter>)
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'one@example.test' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send recovery link' }))
  await screen.findByText('If this email has an account, check its inbox for a recovery link.')
  expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('one@example.test', { redirectTo: `${window.location.origin}/auth/callback?returnTo=%2Fsettings&flow=recovery` })
})
it('PKCE callback validates with getUser, strips URL secrets, and rejects external returnTo', async () => {
  window.history.replaceState({}, '', '/auth/callback?code=fixture-code&returnTo=https%3A%2F%2Fevil.test')
  render(<MemoryRouter initialEntries={['/auth/callback']}><AuthCallback /><Path /></MemoryRouter>)
  await waitFor(() => expect(screen.getByLabelText('Path').textContent).toBe('/settings'))
  expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('fixture-code')
  expect(auth.getUser).toHaveBeenCalledTimes(1)
  expect(window.location.href).not.toContain('fixture-code')
  expect(window.location.href).not.toContain('evil.test')
})
it('implicit recovery validates server identity before returning to the one credential form', async () => {
  window.history.replaceState({}, '', '/auth/callback?flow=recovery#access_token=fixture-access&refresh_token=fixture-refresh&type=recovery')
  render(<MemoryRouter><AuthCallback /><Path /></MemoryRouter>)
  await waitFor(() => expect(screen.getByLabelText('Path').textContent).toBe('/settings?credentials=recovery'))
  expect(auth.getUser).toHaveBeenCalled()
  expect(window.location.hash).toBe('')
})
it('callback errors never fall back to an existing session or expose URL diagnostics', async () => {
  window.history.replaceState({}, '', '/auth/callback?error=access_denied&error_description=private-secret')
  render(<MemoryRouter><AuthCallback /></MemoryRouter>)
  await screen.findByText('This sign-in or verification link could not be confirmed. Request a new link.')
  expect(auth.getUser).not.toHaveBeenCalled()
  expect(window.location.search).toBe('')
  expect(document.body.textContent).not.toContain('private-secret')
})
it('failed authoritative callback readback never claims recovery succeeded', async () => {
  window.history.replaceState({}, '', '/auth/callback?code=fixture-code&flow=recovery')
  auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'private diagnostic' } })
  render(<MemoryRouter><AuthCallback /><Path /></MemoryRouter>)
  await screen.findByRole('alert')
  expect(screen.getByLabelText('Path').textContent).toBe('/')
  expect(window.location.search).toBe('')
})
it('StrictMode callback exchanges a one-time code only once and preserves a safe return destination', async () => {
  window.history.replaceState({}, '', '/auth/callback?code=fixture-code&returnTo=%2Fevents')
  render(<StrictMode><MemoryRouter><AuthCallback /><Path /></MemoryRouter></StrictMode>)
  await waitFor(() => expect(screen.getByLabelText('Path').textContent).toBe('/events'))
  expect(auth.exchangeCodeForSession).toHaveBeenCalledTimes(1)
})
it('token-hash email verification supports only known OTP types and scrubs the hash token', async () => {
  window.history.replaceState({}, '', '/auth/callback?token_hash=fixture-hash&type=email_change')
  render(<MemoryRouter><AuthCallback /><Path /></MemoryRouter>)
  await waitFor(() => expect(screen.getByLabelText('Path').textContent).toBe('/settings'))
  expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'fixture-hash', type: 'email_change' })
  expect(window.location.search).toBe('')
})
it('password login performs authoritative readback and honors safe returnTo', async () => {
  window.history.replaceState({}, '', '/login?returnTo=%2Fevents%3Fcategory%3DMusic')
  render(<MemoryRouter><EmailLinkSignIn /><Path /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Use password' }))
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'one@example.test' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Fixture-password-1!' } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in with password' }))
  await waitFor(() => expect(screen.getByLabelText('Path').textContent).toBe('/events?category=Music'))
  expect(auth.getUser).toHaveBeenCalledTimes(1)
})
it('recovery request failure stays honest and does not expose provider diagnostics', async () => {
  auth.resetPasswordForEmail.mockRejectedValue(new Error('private recovery diagnostic'))
  render(<MemoryRouter><ForgotPassword /></MemoryRouter>)
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'one@example.test' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send recovery link' }))
  await screen.findByRole('alert')
  expect(screen.queryByText('If this email has an account, check its inbox for a recovery link.')).toBeNull()
  expect(document.body.textContent).not.toContain('private recovery diagnostic')
})
it('an exchange failure or incomplete fragment cannot reuse an old session as callback success', async () => {
  window.history.replaceState({}, '', '/auth/callback?code=expired')
  auth.exchangeCodeForSession.mockResolvedValueOnce({ error: { message: 'private expired token' } })
  const view = render(<MemoryRouter><AuthCallback /></MemoryRouter>)
  await screen.findByRole('alert')
  expect(auth.getUser).not.toHaveBeenCalled()
  view.unmount()
  window.history.replaceState({}, '', '/auth/callback#access_token=partial')
  render(<MemoryRouter><AuthCallback /></MemoryRouter>)
  await screen.findByRole('alert')
  expect(auth.getUser).not.toHaveBeenCalled()
  expect(window.location.hash).toBe('')
})

function Leave() { const navigate = useNavigate(); return <button onClick={() => navigate('/settings')}>Leave form</button> }
for (const form of ['login', 'recovery']) {
  it(`delayed ${form} completion cannot update or navigate after leaving the route`, async () => {
    let finish!: (value: unknown) => void
    const request = form === 'login' ? auth.signInWithPassword : auth.resetPasswordForEmail
    request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    render(<MemoryRouter initialEntries={['/form']}><Routes><Route path="/form" element={<>{form === 'login' ? <EmailLinkSignIn /> : <ForgotPassword />}<Leave /></>} /><Route path="/settings" element={<h1>Left the form</h1>} /></Routes><Path /></MemoryRouter>)
    if (form === 'login') fireEvent.click(screen.getByRole('button', { name: 'Use password' }))
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'one@example.test' } })
    if (form === 'login') fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Fixture-password-1!' } })
    fireEvent.click(screen.getByRole('button', { name: form === 'login' ? 'Sign in with password' : 'Send recovery link' }))
    fireEvent.click(screen.getByRole('button', { name: 'Leave form' }))
    await act(async () => { finish({ error: null }) })
    expect(screen.getByRole('heading', { name: 'Left the form' })).toBeTruthy()
    expect(auth.getUser).not.toHaveBeenCalled()
    expect(screen.queryByText('If this email has an account, check its inbox for a recovery link.')).toBeNull()
  })
}
it('route changes invalidate a pending sign-in even when the form component is reused', async () => {
  let finish!: (value: unknown) => void
  auth.signInWithPassword.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  render(<MemoryRouter><EmailLinkSignIn /><Leave /><Path /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Use password' }))
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'one@example.test' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Fixture-password-1!' } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in with password' }))
  fireEvent.click(screen.getByRole('button', { name: 'Leave form' }))
  await act(async () => { finish({ error: null }) })
  expect(auth.getUser).not.toHaveBeenCalled()
  expect(screen.getByLabelText('Path').textContent).toBe('/settings')
  expect(screen.getByRole('button', { name: 'Use password' })).toBeTruthy()
})
it('switching modes clears an unsubmitted password and does not expose it when switching back', () => {
  render(<MemoryRouter><EmailLinkSignIn /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Use password' }))
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'discard-this-password' } })
  fireEvent.click(screen.getByRole('button', { name: 'Use email link' }))
  fireEvent.click(screen.getByRole('button', { name: 'Use password' }))
  expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('')
})
for (const suffix of [
  '', '?flow=recovery', '?code=', '?code=%20', '?code=a&code=b',
  '?token_hash=a', '?token_hash=&type=email', '?token_hash=a&type=',
  '?token_hash=a&type=email&type=recovery', '?token_hash=a&token_hash=b&type=email',
  '?code=a&token_hash=b&type=email', '?code=a#access_token=b&refresh_token=c',
  '?token_hash=a&type=email#access_token=b&refresh_token=c',
  '?access_token=a&refresh_token=b', '#code=a', '#token_hash=a&type=email',
  '#access_token=a', '#refresh_token=a', '#access_token=&refresh_token=b',
  '#access_token=a&refresh_token=b&refresh_token=c',
  '?code=a#type=recovery', '?error_description=private', '?error_code=expired&message=private',
  '?code=a&message=private', '?message=',
  '#access_token=a&access_token=b&refresh_token=c', '#access_token=a&refresh_token=',
  '?code=a#code=b', '?token_hash=a&type=email&token_hash=',
]) {
  it(`malformed/absent callback grant rejects a pre-existing valid session: ${suffix || 'empty URL'}`, async () => {
    window.history.replaceState({}, '', `/auth/callback${suffix}`)
    render(<MemoryRouter initialEntries={['/auth/callback']}><AuthCallback /><Path /></MemoryRouter>)
    await screen.findByRole('alert')
    for (const fn of [auth.getSession, auth.getUser, auth.exchangeCodeForSession, auth.verifyOtp, auth.setSession]) expect(fn).not.toHaveBeenCalled()
    expect(window.location.search).toBe(''); expect(window.location.hash).toBe('')
    expect(screen.getByLabelText('Path').textContent).toBe('/auth/callback')
  })
}
it('informational first-link confirmation does not authenticate or render raw message text', async () => {
  window.history.replaceState({}, '', '/auth/callback?message=private-provider-confirmation-details')
  render(<MemoryRouter><AuthCallback /></MemoryRouter>)
  await screen.findByText('Finish confirming the email change from the other inbox, then check your account in Settings.')
  expect(screen.getByRole('link', { name: 'Settings' }).getAttribute('href')).toBe('/settings')
  expect(document.body.textContent).not.toContain('private-provider-confirmation-details')
  for (const fn of Object.values(auth)) expect(fn).not.toHaveBeenCalled()
})
it('scrubs query/hash before the first network await, with one StrictMode exchange', async () => {
  let finish!: (value: unknown) => void
  auth.exchangeCodeForSession.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  window.history.replaceState({}, '', '/auth/callback?code=fixture-code&returnTo=%2Fevents#unrelated=private')
  render(<StrictMode><MemoryRouter><AuthCallback /><Path /></MemoryRouter></StrictMode>)
  expect(window.location.search).toBe(''); expect(window.location.hash).toBe('')
  expect(auth.exchangeCodeForSession).toHaveBeenCalledTimes(1)
  expect(auth.getSession).not.toHaveBeenCalled()
  await act(async () => { finish({ data: { session: { user: actor } }, error: null }) })
  await waitFor(() => expect(screen.getByLabelText('Path').textContent).toBe('/events'))
})
it('an explicit grant without a session cannot fall back to the old user; verified actor must match the grant', async () => {
  auth.verifyOtp.mockResolvedValueOnce({ data: { session: null }, error: null })
  window.history.replaceState({}, '', '/auth/callback?token_hash=fixture&type=email')
  const view = render(<MemoryRouter><AuthCallback /></MemoryRouter>)
  await screen.findByRole('alert')
  expect(auth.getUser).not.toHaveBeenCalled()
  view.unmount()
  window.history.replaceState({}, '', '/auth/callback?code=fixture')
  auth.getUser.mockResolvedValueOnce({ data: { user: { id: 'different-actor' } }, error: null })
  render(<MemoryRouter><AuthCallback /></MemoryRouter>)
  await screen.findByRole('alert')
})
it('a delayed authoritative sign-in readback cannot navigate after the route changes', async () => {
  let finish!: (value: unknown) => void
  auth.getUser.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  render(<MemoryRouter initialEntries={['/form']}><Routes><Route path="/form" element={<><EmailLinkSignIn /><Leave /></>} /><Route path="/settings" element={<h1>Left the form</h1>} /></Routes><Path /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Use password' }))
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'one@example.test' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Fixture-password-1!' } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in with password' }))
  await waitFor(() => expect(auth.getUser).toHaveBeenCalledTimes(1))
  fireEvent.click(screen.getByRole('button', { name: 'Leave form' }))
  await act(async () => { finish({ data: { user: actor }, error: null }) })
  expect(screen.getByRole('heading', { name: 'Left the form' })).toBeTruthy()
})
it('a reused recovery form discards stale completion and clears its draft on route change', async () => {
  let finish!: (value: unknown) => void
  auth.resetPasswordForEmail.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  render(<MemoryRouter><ForgotPassword /><Leave /></MemoryRouter>)
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'one@example.test' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send recovery link' }))
  fireEvent.click(screen.getByRole('button', { name: 'Leave form' }))
  await act(async () => { finish({ error: null }) })
  expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('')
  expect(screen.queryByText('If this email has an account, check its inbox for a recovery link.')).toBeNull()
})
