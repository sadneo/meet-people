import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import NativeBridge from '../src/platform/NativeBridge'
import { AuthCallback } from '../src/auth/CredentialRoutes'
import { authCallbackUrl } from '../src/auth/credential-policy'

const fixture = vi.hoisted(() => ({ native: true, listener: null as null | ((event: { url: string }) => void), launch: vi.fn(), remove: vi.fn(), open: vi.fn(), exchange: vi.fn(), setSession: vi.fn(), getUser: vi.fn() }))
vi.mock('@capacitor/app', () => ({ App: { addListener: async (_name: string, listener: typeof fixture.listener) => { fixture.listener = listener; return { remove: fixture.remove } }, getLaunchUrl: fixture.launch } }))
vi.mock('@capacitor/browser', () => ({ Browser: { open: fixture.open } }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => fixture.native } }))
vi.mock('../src/supabase', () => ({ supabase: { auth: { exchangeCodeForSession: fixture.exchange, setSession: fixture.setSession, getUser: fixture.getUser } } }))
const user = { id: 'native-fixture' }
beforeEach(() => {
  fixture.native = true; fixture.listener = null
  fixture.launch.mockReset().mockResolvedValue(null); fixture.remove.mockReset(); fixture.open.mockReset()
  fixture.exchange.mockReset().mockResolvedValue({ data: { session: { user } }, error: null })
  fixture.setSession.mockReset().mockResolvedValue({ data: { session: { user } }, error: null })
  fixture.getUser.mockReset().mockResolvedValue({ data: { user }, error: null })
  window.history.replaceState({}, '', '/login')
})
afterEach(() => { cleanup(); window.history.replaceState({}, '', '/') })
const mount = () => render(<BrowserRouter><NativeBridge /><Routes><Route path="/login" element={<h1>Public login fixture</h1>} /><Route path="/auth/callback" element={<AuthCallback />} /><Route path="/settings" element={<h1>Verified settings fixture</h1>} /></Routes><a target="_blank" href="https://listing.example.test">Original listing</a></BrowserRouter>)
it('public mounted bridge routes an Android recovery session grant through scrub and verification, never a parallel exchange', async () => {
  let finish!: (value: unknown) => void
  fixture.getUser.mockReturnValue(new Promise(resolve => { finish = resolve }))
  mount(); await waitFor(() => expect(fixture.listener).not.toBeNull())
  await act(async () => { fixture.listener!({ url: 'com.cse416.meetpeople://app/reset-password#access_token=native-access&refresh_token=native-refresh&type=recovery' }) })
  await waitFor(() => expect(fixture.getUser).toHaveBeenCalledTimes(1))
  expect(window.location.pathname + window.location.search + window.location.hash).toBe('/auth/callback')
  expect(fixture.setSession).toHaveBeenCalledTimes(1); expect(fixture.exchange).not.toHaveBeenCalled()
  expect(screen.queryByRole('heading', { name: 'Verified settings fixture' })).toBeNull()
  await act(async () => { finish({ data: { user }, error: null }) })
  await screen.findByRole('heading', { name: 'Verified settings fixture' })
  expect(window.location.search).toBe('?credentials=recovery')
})
it('cold launch code is exchanged and verified once, including duplicate appUrlOpen delivery', async () => {
  const url = 'com.cse416.meetpeople://app/auth/callback?code=native-cold-code&returnTo=%2Fsettings'
  fixture.launch.mockResolvedValue({ url })
  mount(); await screen.findByRole('heading', { name: 'Verified settings fixture' })
  await act(async () => { fixture.listener!({ url }) })
  expect(fixture.exchange).toHaveBeenCalledExactlyOnceWith('native-cold-code')
  expect(fixture.getUser).toHaveBeenCalledTimes(1); expect(window.location.hash).toBe('')
})
it('failed SDK verification never redirects into the app and leaves tokens scrubbed', async () => {
  fixture.getUser.mockResolvedValue({ data: { user: { id: 'other-owner' } }, error: null })
  mount(); await waitFor(() => expect(fixture.listener).not.toBeNull())
  await act(async () => { fixture.listener!({ url: 'com.cse416.meetpeople://app/auth/callback?code=native-wrong-owner' }) })
  await screen.findByRole('alert')
  expect(window.location.pathname + window.location.search).toBe('/auth/callback')
  expect(screen.queryByRole('heading', { name: 'Verified settings fixture' })).toBeNull()
})
it('rejects remote hosts, wrong schemes and product deep links without SDK calls', async () => {
  mount(); await waitFor(() => expect(fixture.listener).not.toBeNull())
  for (const url of ['https://evil.test/auth/callback?code=x', 'com.cse416.meetpeople://evil/auth/callback?code=x', 'com.cse416.meetpeople://app/profile']) await act(async () => { fixture.listener!({ url }) })
  expect(window.location.pathname).toBe('/login'); expect(fixture.exchange).not.toHaveBeenCalled(); expect(fixture.setSession).not.toHaveBeenCalled()
})
it('keeps external native browser links and removes listeners on unmount', async () => {
  const view = mount(); await waitFor(() => expect(fixture.listener).not.toBeNull())
  await act(async () => { screen.getByRole('link', { name: 'Original listing' }).click() })
  expect(fixture.open).toHaveBeenCalledWith({ url: 'https://listing.example.test/' })
  view.unmount(); await waitFor(() => expect(fixture.remove).toHaveBeenCalledTimes(1))
})
it('late cold-launch completion cannot navigate after bridge unmount', async () => {
  let finish!: (value: unknown) => void
  fixture.launch.mockReturnValue(new Promise(resolve => { finish = resolve }))
  const view = mount(); view.unmount()
  await act(async () => { finish({ url: 'com.cse416.meetpeople://app/auth/callback?code=native-after-unmount' }) })
  expect(window.location.pathname).toBe('/login'); expect(fixture.exchange).not.toHaveBeenCalled()
})
it('email/recovery redirect construction preserves the registered native scheme, with safe return validation', () => {
  expect(authCallbackUrl('/events?filter=Music#card', true)).toBe('com.cse416.meetpeople://app/auth/callback?returnTo=%2Fevents%3Ffilter%3DMusic%23card&flow=recovery')
  fixture.native = false
  expect(authCallbackUrl('https://evil.test')).toBe(`${window.location.origin}/auth/callback?returnTo=%2Fsettings`)
})
