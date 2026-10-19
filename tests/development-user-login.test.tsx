import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { EmailLinkSignIn } from '../src/auth/EmailLinkSignIn'

const id = 'a0000000-0000-4000-8000-000000000001'
const auth = vi.hoisted(() => ({ dev: true, hostname: 'localhost', setSession: vi.fn(), signInWithPassword: vi.fn(), getUser: vi.fn(), signInAnonymously: vi.fn() }))
vi.mock('../src/auth/localDevelopment', () => ({
  getLocalDevelopmentEnvironment: () => ({ dev: auth.dev, hostname: auth.hostname }),
  isLocalDevelopment: ({ dev, hostname }: { dev: boolean; hostname: string }) => dev && ['localhost', '127.0.0.1'].includes(hostname),
}))
vi.mock('../src/supabase', () => ({ supabase: { auth } }))
const session = { access_token: 'dev-fixture-token', refresh_token: 'dev-fixture-refresh', expires_in: 3600, token_type: 'bearer', user: { id } }
beforeEach(() => {
  auth.dev = true; auth.hostname = 'localhost'
  auth.signInAnonymously.mockReset(); auth.signInWithPassword.mockReset()
  auth.setSession.mockReset().mockResolvedValue({ data: { session }, error: null })
  auth.getUser.mockReset().mockResolvedValue({ data: { user: { id, is_anonymous: false } }, error: null })
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ session })))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })
function Path() { return <output aria-label="Development URL">{useLocation().pathname}</output> }
const mount = () => render(<MemoryRouter initialEntries={['/login']}><EmailLinkSignIn /><Path /></MemoryRouter>)
const click = () => fireEvent.click(screen.getByRole('button', { name: 'Sign in as development user', exact: true }))
it('one click installs a standard SDK session, verifies the user and navigates without asking for or embedding credentials', async () => {
  mount(); click()
  await waitFor(() => expect(screen.getByLabelText('Development URL').textContent).toBe('/settings'))
  expect(fetch).toHaveBeenCalledWith('/__dev/login', expect.objectContaining({ method: 'POST', body: '{"intent":"development-sign-in"}', credentials: 'same-origin', redirect: 'error' }))
  expect(auth.setSession).toHaveBeenCalledWith({ access_token: session.access_token, refresh_token: session.refresh_token })
  expect(auth.getUser).toHaveBeenCalledTimes(1)
  expect(auth.signInWithPassword).not.toHaveBeenCalled(); expect(auth.signInAnonymously).not.toHaveBeenCalled()
  expect(screen.queryByLabelText('Password')).toBeNull()
})
it.each([[false, 'localhost'], [true, 'preview.example.test'], [true, '192.168.1.2'], [true, 'localhost.example.test']])('denies DEV=%s host=%s, including direct imported-module calls', async (dev, hostname) => {
  auth.dev = dev as boolean; auth.hostname = hostname as string; mount()
  expect(screen.queryByRole('button', { name: 'Sign in as development user', exact: true })).toBeNull()
  const { signInDevelopmentUser } = await import('../src/auth/developmentLogin')
  await expect(signInDevelopmentUser({ auth } as never, () => true)).rejects.toThrow()
  expect(fetch).not.toHaveBeenCalled()
})
it('unprovisioned dedicated account fails closed without SDK installation, writes or fallback', async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json({ error: 'Private provisioning detail' }, { status: 503 }))
  mount(); click(); await screen.findByText(/development account is not ready/i)
  expect(screen.getByLabelText('Development URL').textContent).toBe('/login')
  expect(auth.setSession).not.toHaveBeenCalled(); expect(auth.signInWithPassword).not.toHaveBeenCalled()
  expect(screen.queryByText(/Private provisioning detail/)).toBeNull()
})
it('stale environment and duplicate clicks cannot install the returned session', async () => {
  let finish!: (value: Response) => void
  const pending = new Promise<Response>(resolve => { finish = resolve })
  vi.mocked(fetch).mockReturnValue(pending)
  mount(); const button = screen.getByRole('button', { name: 'Sign in as development user', exact: true })
  fireEvent.click(button); fireEvent.click(button)
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  auth.hostname = 'preview.example.test'
  await act(async () => { finish(Response.json({ session })); await pending })
  expect(auth.setSession).not.toHaveBeenCalled(); expect(auth.getUser).not.toHaveBeenCalled()
})
it('production flag denies the control even when the adapter reports loopback DEV', () => {
  vi.stubEnv('DEV', false); mount()
  expect(screen.queryByRole('button', { name: 'Sign in as development user', exact: true })).toBeNull()
})
it.each(['sdk', 'owner', 'anonymous', 'malformed'])('verification failure %s never navigates or revokes the shared account session', async failure => {
  if (failure === 'sdk') auth.setSession.mockResolvedValue({ data: { session: null }, error: new Error('Private') })
  if (failure === 'owner') auth.getUser.mockResolvedValue({ data: { user: { id: 'other' } }, error: null })
  if (failure === 'anonymous') auth.getUser.mockResolvedValue({ data: { user: { id, is_anonymous: true } }, error: null })
  if (failure === 'malformed') vi.mocked(fetch).mockResolvedValue(Response.json({ session: { ...session, password: 'unexpected' } }))
  mount(); click(); await screen.findByRole('alert')
  expect(screen.getByLabelText('Development URL').textContent).toBe('/login')
  expect(fetch).toHaveBeenCalledTimes(1)
})
