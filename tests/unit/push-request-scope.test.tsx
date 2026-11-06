import { act, cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import PushBridge from '../../src/platform/PushBridge'
import { refreshPushToken, setPushEnabled, unregisterPushToken } from '../../src/platform/push'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), nativeFetch: vi.fn(), addListener: vi.fn(), register: vi.fn(), unregister: vi.fn(), remove: vi.fn(), userId: 'account-a',
}))
vi.mock('../../src/supabase', () => ({ supabase: { auth: { getSession: mocks.getSession } } }))
vi.mock('../../src/auth/useSession', () => ({ useSession: () => ({ session: { user: { id: mocks.userId } } }) }))
vi.mock('../../src/platform/native', () => ({ isNative: () => true, apiUrl: (path: string) => `https://api.fixture.invalid${path}` }))
vi.mock('@capacitor/push-notifications', () => ({ PushNotifications: {
  addListener: mocks.addListener, register: mocks.register, unregister: mocks.unregister,
  checkPermissions: async () => ({ receive: 'granted' }),
} }))

const callbacks = new Map<string, (value: never) => void>()
async function flush() { for (let i = 0; i < 30; i++) await Promise.resolve() }
function pendingSession() {
  let resolve!: (value: unknown) => void
  mocks.getSession.mockReturnValue(new Promise(done => { resolve = done }))
  return (userId: string) => resolve({ data: { session: { access_token: `fixture-bearer-${userId}`, user: { id: userId } } } })
}
beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  callbacks.clear()
  mocks.userId = 'account-a'
  mocks.getSession.mockReset()
  mocks.remove.mockReset().mockResolvedValue(undefined)
  mocks.unregister.mockReset().mockResolvedValue(undefined)
  mocks.addListener.mockReset().mockImplementation(async (kind, callback) => { callbacks.set(kind, callback); return { remove: mocks.remove } })
  mocks.register.mockReset().mockImplementation(async () => { callbacks.get('registration')?.({ value: 'fixture-account-a-token' } as never) })
  // Deliberately no signal checks/listeners: models the installed CapacitorHttp
  // mutation wrapper's nativePromise dispatch, not browser fetch's abort behavior.
  mocks.nativeFetch.mockReset().mockImplementation(async () => new Response('null', { headers: { 'Content-Type': 'application/json' } }))
  vi.stubGlobal('fetch', mocks.nativeFetch)
})
afterEach(() => {
  cleanup()
  setPushEnabled('account-a', false)
  setPushEnabled('account-b', false)
  localStorage.clear()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it('real push/bridge/session-lookup continuation cannot dispatch the old token using the switched account', async () => {
  const release = pendingSession()
  setPushEnabled('account-a', true)
  const view = render(<MemoryRouter><PushBridge /></MemoryRouter>)
  await act(flush)
  expect(mocks.register).toHaveBeenCalledTimes(1)
  expect(mocks.getSession).toHaveBeenCalledTimes(1)
  expect(mocks.nativeFetch).not.toHaveBeenCalled()
  mocks.userId = 'account-b'
  view.rerender(<MemoryRouter><PushBridge /></MemoryRouter>)
  await act(async () => { release('account-b'); await flush() })
  expect(mocks.nativeFetch).not.toHaveBeenCalled()
  expect(localStorage.getItem('pebble.push.token')).toBeNull()
})

it('real push POST refuses a different SDK session even before the bridge receives its session-change event', async () => {
  const release = pendingSession()
  setPushEnabled('account-a', true)
  const pending = refreshPushToken('account-a').catch(() => undefined)
  await flush()
  expect(mocks.getSession).toHaveBeenCalledTimes(1)
  release('account-b')
  await pending
  expect(mocks.nativeFetch).not.toHaveBeenCalled()
  expect(localStorage.getItem('pebble.push.token')).toBeNull()
})

it('real push cleanup cannot dispatch DELETE after its deadline while SDK lookup is pending', async () => {
  const release = pendingSession()
  localStorage.setItem('pebble.push.token', 'fixture-account-a-token')
  const pending = unregisterPushToken().catch(() => undefined)
  await flush()
  expect(mocks.getSession).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(3000)
  await pending
  release('account-b')
  await flush()
  expect(mocks.nativeFetch).not.toHaveBeenCalled()
  expect(localStorage.getItem('pebble.push.token')).toBeNull()
})

it('real push refresh still dispatches once for the expected account', async () => {
  mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'fixture-bearer-account-a', user: { id: 'account-a' } } } })
  setPushEnabled('account-a', true)
  await refreshPushToken('account-a')
  expect(mocks.nativeFetch).toHaveBeenCalledExactlyOnceWith('https://api.fixture.invalid/api/push/devices', expect.objectContaining({
    method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer fixture-bearer-account-a' }),
  }))
  expect(localStorage.getItem('pebble.push.token')).toBe('fixture-account-a-token')
})

it('cancellation after native dispatch cannot roll it back, but prevents stale local token storage', async () => {
  mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'fixture-bearer-account-a', user: { id: 'account-a' } } } })
  let release!: (response: Response) => void
  mocks.nativeFetch.mockReturnValue(new Promise<Response>(resolve => { release = resolve }))
  setPushEnabled('account-a', true)
  const controller = new AbortController()
  const pending = refreshPushToken('account-a', controller.signal).catch(() => undefined)
  await flush()
  expect(mocks.nativeFetch).toHaveBeenCalledTimes(1)
  controller.abort()
  await pending
  release(new Response('null', { headers: { 'Content-Type': 'application/json' } }))
  await flush()
  expect(mocks.nativeFetch).toHaveBeenCalledTimes(1) // Accepted native work was not undone or retried.
  expect(localStorage.getItem('pebble.push.token')).toBeNull()
})
