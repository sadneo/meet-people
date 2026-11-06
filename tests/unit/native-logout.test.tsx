import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Mobile from '../../src/mobile/App'
import { useLogout } from '../../src/auth/useLogout'
import { disablePush } from '../../src/platform/push'

const mocks = vi.hoisted(() => ({
  request: vi.fn(), unregister: vi.fn(), signOut: vi.fn(),
  session: { access_token: 'fixture-session', user: { id: 'fixture-user' } },
}))
vi.mock('../../src/auth/authorizedRequest', () => ({ authorizedRequest: mocks.request }))
vi.mock('@capacitor/push-notifications', () => ({ PushNotifications: { unregister: mocks.unregister } }))
vi.mock('../../src/platform/native', () => ({ isNative: () => true }))
vi.mock('../../src/platform/NativeBridge', () => ({ default: () => null }))
vi.mock('../../src/platform/PushBridge', () => ({ default: () => null }))
vi.mock('../../src/auth/useSession', () => ({ useSession: () => ({ ready: true, session: mocks.session }) }))
vi.mock('../../src/supabase', () => ({ supabase: { auth: { signOut: mocks.signOut } } }))
vi.mock('../../src/ui/Auth', () => ({ Auth: () => <h1>Login</h1>, AuthCallback: () => null }))

function Location() { return <output aria-label="Current URL">{useLocation().pathname}</output> }
function openLogout() {
  render(<MemoryRouter initialEntries={['/logout']}><Mobile /><Location /></MemoryRouter>)
}
async function tapSignOut() {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Sign out', exact: true })) })
}
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubEnv('DEV', false)
  vi.stubEnv('VITE_DEV_TOOLS', 'false')
  mocks.request.mockReset().mockResolvedValue(null)
  mocks.unregister.mockReset().mockResolvedValue(undefined)
  mocks.signOut.mockReset().mockResolvedValue({ error: null })
  localStorage.clear()
  localStorage.setItem('pebble.push.token', 'fixture-device-token')
  localStorage.setItem('pebble.push.enabled.fixture-user', '1')
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllEnvs(); localStorage.clear() })

it('active mobile logout cleans up server and native push before local sign-out, retaining account opt-in', async () => {
  const deletion = deferred(), native = deferred()
  mocks.request.mockReturnValue(deletion.promise)
  mocks.unregister.mockReturnValue(native.promise)
  openLogout()
  await tapSignOut()
  expect(mocks.request).toHaveBeenCalledWith('/api/push/devices', expect.anything(), expect.objectContaining({
    method: 'DELETE', body: { token: 'fixture-device-token' }, signal: expect.any(AbortSignal),
  }))
  expect(mocks.unregister).toHaveBeenCalledTimes(1)
  expect(mocks.signOut).not.toHaveBeenCalled()
  expect(localStorage.getItem('pebble.push.token')).toBeNull()
  await act(async () => { deletion.resolve() })
  expect(mocks.signOut).not.toHaveBeenCalled()
  await act(async () => { native.resolve() })
  expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' })
  expect(screen.getByLabelText('Current URL').textContent).toBe('/login')
  expect(localStorage.getItem('pebble.push.enabled.fixture-user')).toBe('1')
  const signal = mocks.request.mock.calls[0][2].signal as AbortSignal
  await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
  expect(signal.aborted).toBe(false) // Successful cleanup clears its timeout (query-cache timers are unrelated).
})

it('deregistration failures do not block logout or retry or expose a token', async () => {
  mocks.request.mockRejectedValue(new Error('fixture-device-token'))
  mocks.unregister.mockRejectedValue(new Error('native unavailable'))
  openLogout()
  await tapSignOut()
  expect(mocks.request).toHaveBeenCalledTimes(1)
  expect(mocks.unregister).toHaveBeenCalledTimes(1)
  expect(mocks.signOut).toHaveBeenCalledTimes(1)
  expect(screen.getByLabelText('Current URL').textContent).toBe('/login')
  expect(document.body.textContent).not.toContain('fixture-device-token')
  expect(localStorage.getItem('pebble.push.token')).toBeNull()
  await act(async () => { await vi.advanceTimersByTimeAsync(10000) })
  expect(mocks.request).toHaveBeenCalledTimes(1)
})

it.each(['server', 'native', 'both'])('stalled %s cleanup is aborted at three seconds and does not block sign-out or retry', async stalledPart => {
  const stalled = deferred()
  if (stalledPart !== 'native') mocks.request.mockReturnValue(stalled.promise)
  if (stalledPart !== 'server') mocks.unregister.mockReturnValue(stalled.promise)
  openLogout()
  await tapSignOut()
  expect(mocks.signOut).not.toHaveBeenCalled()
  expect(localStorage.getItem('pebble.push.token')).toBeNull()
  await act(async () => { await vi.advanceTimersByTimeAsync(2999) })
  expect(mocks.signOut).not.toHaveBeenCalled()
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  expect(mocks.signOut).toHaveBeenCalledTimes(1)
  expect(mocks.request.mock.calls[0][2].signal.aborted).toBe(true)
  expect(screen.getByLabelText('Current URL').textContent).toBe('/login')
  await act(async () => { stalled.resolve(); await vi.advanceTimersByTimeAsync(10000) })
  expect(mocks.request).toHaveBeenCalledTimes(1)
  expect(mocks.signOut).toHaveBeenCalledTimes(1)
})

it('duplicate taps share one cleanup and one sign-out', async () => {
  const deletion = deferred()
  mocks.request.mockReturnValue(deletion.promise)
  openLogout()
  const button = screen.getByRole('button', { name: 'Sign out', exact: true })
  await act(async () => { fireEvent.click(button); fireEvent.click(button) })
  expect(mocks.request).toHaveBeenCalledTimes(1)
  expect(mocks.signOut).not.toHaveBeenCalled()
  await act(async () => { deletion.resolve() })
  expect(mocks.signOut).toHaveBeenCalledTimes(1)
})

it('failed auth sign-out stays on logout with its existing error and permits an explicit retry', async () => {
  mocks.signOut.mockResolvedValueOnce({ error: new Error('auth failed') })
  openLogout()
  await tapSignOut()
  expect(mocks.request).toHaveBeenCalledTimes(1)
  expect(mocks.unregister).toHaveBeenCalledTimes(1)
  expect(screen.getByLabelText('Current URL').textContent).toBe('/logout')
  expect(screen.getByText('Could not sign out. Try again.')).toBeTruthy()
  expect(localStorage.getItem('pebble.push.token')).toBeNull()
  await act(async () => { await vi.advanceTimersByTimeAsync(10000) })
  expect(mocks.signOut).toHaveBeenCalledTimes(1)
  await tapSignOut()
  expect(mocks.signOut).toHaveBeenCalledTimes(2)
  expect(mocks.request).toHaveBeenCalledTimes(1)
  expect(screen.getByLabelText('Current URL').textContent).toBe('/login')
})

it('logout still unregisters native push without a remembered token and retains opt-in', async () => {
  localStorage.removeItem('pebble.push.token')
  openLogout()
  await tapSignOut()
  expect(mocks.request).not.toHaveBeenCalled()
  expect(mocks.unregister).toHaveBeenCalledTimes(1)
  expect(mocks.signOut).toHaveBeenCalledTimes(1)
  expect(localStorage.getItem('pebble.push.enabled.fixture-user')).toBe('1')
})

it('disabling push uses native and server cleanup but clears account opt-in, unlike logout', async () => {
  await disablePush('fixture-user')
  expect(mocks.request).toHaveBeenCalledTimes(1)
  expect(mocks.unregister).toHaveBeenCalledTimes(1)
  expect(localStorage.getItem('pebble.push.token')).toBeNull()
  expect(localStorage.getItem('pebble.push.enabled.fixture-user')).toBeNull()
  expect(mocks.signOut).not.toHaveBeenCalled()
})

it('disabling push still unregisters native push if server deletion fails', async () => {
  mocks.request.mockRejectedValue(new Error('unavailable'))
  await expect(disablePush('fixture-user')).rejects.toThrow('unavailable')
  expect(mocks.unregister).toHaveBeenCalledTimes(1)
  expect(localStorage.getItem('pebble.push.enabled.fixture-user')).toBeNull()
})

it('the retained logout hook uses the same cleanup-before-signout path', async () => {
  const deletion = deferred()
  mocks.request.mockReturnValue(deletion.promise)
  const hook = renderHook(() => useLogout(), { wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter> })
  let logout!: Promise<void>
  await act(async () => { logout = hook.result.current.logout() })
  expect(mocks.request).toHaveBeenCalledTimes(1)
  expect(mocks.unregister).toHaveBeenCalledTimes(1)
  expect(mocks.signOut).not.toHaveBeenCalled()
  await act(async () => { deletion.resolve(); await logout })
  expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' })
  expect(hook.result.current.error).toBe('')
})
