import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PushNotificationsToggle } from '../../src/features/account/PushNotificationsToggle'
import PushBridge from '../../src/platform/PushBridge'
import { enablePush, fetchPushToken, refreshPushToken, setPushEnabled, unregisterPushToken } from '../../src/platform/push'

const mocks = vi.hoisted(() => ({
  addListener: vi.fn(), register: vi.fn(), unregister: vi.fn(), remove: vi.fn(),
  permission: vi.fn(), channel: vi.fn(), request: vi.fn(), userId: 'fixture-user',
}))
vi.mock('@capacitor/push-notifications', () => ({ PushNotifications: {
  addListener: mocks.addListener, register: mocks.register, unregister: mocks.unregister,
  checkPermissions: mocks.permission, requestPermissions: mocks.permission, createChannel: mocks.channel,
} }))
vi.mock('../../src/platform/native', () => ({ isNative: () => true }))
vi.mock('../../src/auth/authorizedRequest', () => ({ authorizedRequest: mocks.request }))
vi.mock('../../src/auth/useSession', () => ({ useSession: () => ({ session: { user: { id: mocks.userId } } }) }))

const callbacks = new Map<string, (value: never) => void>()
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
async function flush() { for (let i = 0; i < 20; i++) await Promise.resolve() }
beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  callbacks.clear()
  mocks.userId = 'fixture-user'
  mocks.remove.mockReset().mockResolvedValue(undefined)
  mocks.addListener.mockReset().mockImplementation(async (kind, callback) => {
    callbacks.set(kind, callback)
    return { remove: mocks.remove }
  })
  mocks.register.mockReset().mockImplementation(async () => { callbacks.get('registration')?.({ value: 'fixture-token' } as never) })
  mocks.unregister.mockReset().mockResolvedValue(undefined)
  mocks.permission.mockReset().mockResolvedValue({ receive: 'granted' })
  mocks.channel.mockReset().mockResolvedValue(undefined)
  mocks.request.mockReset().mockResolvedValue(null)
})
afterEach(() => {
  cleanup()
  setPushEnabled('fixture-user', false)
  setPushEnabled('other-user', false)
  vi.useRealTimers()
  localStorage.clear()
})

it('installs both registration listeners before asking the OS to register', async () => {
  const first = deferred<{ remove: typeof mocks.remove }>(), second = deferred<{ remove: typeof mocks.remove }>()
  mocks.addListener.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  const pending = fetchPushToken().catch(() => undefined)
  await flush()
  expect(mocks.register).not.toHaveBeenCalled()
  first.resolve({ remove: mocks.remove })
  await flush()
  expect(mocks.register).not.toHaveBeenCalled()
  second.resolve({ remove: mocks.remove })
  await flush()
  expect(mocks.register).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(10000)
  await pending
  expect(mocks.remove).toHaveBeenCalledTimes(2)
})

it('missing registration callbacks fail within ten seconds and leave the existing UI recoverable', async () => {
  mocks.register.mockResolvedValue(undefined)
  render(<PushNotificationsToggle />)
  const toggle = screen.getByRole('switch') as HTMLInputElement
  await act(async () => { fireEvent.click(toggle); await flush() })
  expect(toggle.disabled).toBe(true)
  await act(async () => { await vi.advanceTimersByTimeAsync(10000) })
  expect(toggle.disabled).toBe(false)
  expect(toggle.checked).toBe(false)
  expect(screen.getByRole('alert').textContent).toBe('Could not turn on notifications. Check your connection and try again.')
  expect(mocks.remove).toHaveBeenCalledTimes(2)
  expect(mocks.request).not.toHaveBeenCalled()
  mocks.register.mockImplementation(async () => { callbacks.get('registration')?.({ value: 'retry-token' } as never) })
  await act(async () => { fireEvent.click(toggle); await flush() })
  expect(toggle.disabled).toBe(false)
  expect(toggle.checked).toBe(true)
})

it('a rejected listener install fails enable, releases the partial listener and never registers', async () => {
  mocks.addListener.mockImplementationOnce(async () => ({ remove: mocks.remove }))
    .mockRejectedValueOnce(new Error('listener unavailable'))
  let result: unknown
  void enablePush('fixture-user').then(value => { result = value })
  await flush()
  expect(result).toBe('failed')
  expect(mocks.register).not.toHaveBeenCalled()
  expect(mocks.remove).toHaveBeenCalledTimes(1)
  expect(mocks.request).not.toHaveBeenCalled()
})

it('listeners resolving after setup times out are released, even if removal rejects', async () => {
  const late = deferred<{ remove: typeof mocks.remove }>()
  mocks.addListener.mockReturnValue(late.promise)
  mocks.remove.mockRejectedValue(new Error('removal unavailable'))
  let result: unknown
  void enablePush('fixture-user').then(value => { result = value })
  await flush()
  await vi.advanceTimersByTimeAsync(10000)
  expect(result).toBe('failed')
  late.resolve({ remove: mocks.remove })
  await flush()
  expect(mocks.remove).toHaveBeenCalledTimes(2)
  expect(mocks.register).not.toHaveBeenCalled()
})

it('late listener rejection after timeout is handled without registration or retries', async () => {
  let reject!: (reason: Error) => void
  mocks.addListener.mockReturnValue(new Promise((_, fail) => { reject = fail }))
  const pending = enablePush('fixture-user')
  await flush()
  await vi.advanceTimersByTimeAsync(10000)
  reject(new Error('late listener failure'))
  await flush()
  expect(await pending).toBe('failed')
  expect(mocks.register).not.toHaveBeenCalled()
})

it('registration rejection releases both listeners and returns failed without exposing token errors', async () => {
  mocks.register.mockRejectedValue(new Error('fixture-token'))
  expect(await enablePush('fixture-user')).toBe('failed')
  expect(mocks.remove).toHaveBeenCalledTimes(2)
  expect(localStorage.getItem('pebble.push.token')).toBeNull()
})

it('refresh never requests permission or registers when account consent is off', async () => {
  await refreshPushToken('fixture-user')
  expect(mocks.permission).not.toHaveBeenCalled()
  expect(mocks.register).not.toHaveBeenCalled()
  expect(mocks.request).not.toHaveBeenCalled()
})

it('disabling while permission is pending prevents stale refresh from registering', async () => {
  const permission = deferred<{ receive: string }>()
  mocks.permission.mockReturnValue(permission.promise)
  setPushEnabled('fixture-user', true)
  const pending = refreshPushToken('fixture-user').catch(() => undefined)
  await flush()
  setPushEnabled('fixture-user', false)
  permission.resolve({ receive: 'granted' })
  await pending
  expect(mocks.register).not.toHaveBeenCalled()
  expect(mocks.request).not.toHaveBeenCalled()
  expect(localStorage.getItem('pebble.push.token')).toBeNull()
})

it.each(['disable', 'logout'])('%s cancels an in-flight token POST and prevents late token storage', async action => {
  const response = deferred<null>()
  mocks.request.mockImplementation((_, __, options) => options.method === 'POST' ? response.promise : Promise.resolve(null))
  setPushEnabled('fixture-user', true)
  const pending = refreshPushToken('fixture-user').catch(() => undefined)
  await flush()
  expect(mocks.request).toHaveBeenCalledTimes(1)
  if (action === 'disable') setPushEnabled('fixture-user', false)
  else await unregisterPushToken()
  response.resolve(null)
  await pending
  expect(mocks.request.mock.calls[0][2].signal?.aborted).toBe(true)
  expect(localStorage.getItem('pebble.push.token')).toBeNull()
  expect(localStorage.getItem('pebble.push.enabled.fixture-user')).toBe(action === 'logout' ? '1' : null)
})

it.each(['disable', 'logout'])('%s cancels registration waiting for callbacks and ignores a late token', async action => {
  mocks.register.mockResolvedValue(undefined)
  setPushEnabled('fixture-user', true)
  const pending = refreshPushToken('fixture-user').catch(() => undefined)
  await flush()
  const callback = callbacks.get('registration')!
  if (action === 'disable') setPushEnabled('fixture-user', false)
  else await unregisterPushToken()
  callback({ value: 'late-token' } as never)
  await pending
  await flush()
  expect(mocks.remove).toHaveBeenCalledTimes(2)
  expect(mocks.request).not.toHaveBeenCalled()
  expect(localStorage.getItem('pebble.push.token')).toBeNull()
})

it('account switching cancels the old bridge refresh and never registers for the opted-out new account', async () => {
  const permission = deferred<{ receive: string }>()
  mocks.permission.mockReturnValue(permission.promise)
  setPushEnabled('fixture-user', true)
  const view = render(<MemoryRouter><PushBridge /></MemoryRouter>)
  await act(flush)
  mocks.userId = 'other-user'
  view.rerender(<MemoryRouter><PushBridge /></MemoryRouter>)
  await act(async () => { permission.resolve({ receive: 'granted' }); await flush() })
  expect(mocks.register).not.toHaveBeenCalled()
  expect(mocks.request).not.toHaveBeenCalled()
  expect(localStorage.getItem('pebble.push.token')).toBeNull()
})

it('enabling with the live bridge still completes successfully and leaves the toggle usable', async () => {
  render(<MemoryRouter><PushBridge /><PushNotificationsToggle /></MemoryRouter>)
  const toggle = screen.getByRole('switch') as HTMLInputElement
  await act(async () => { fireEvent.click(toggle); await flush() })
  expect(toggle.checked).toBe(true)
  expect(toggle.disabled).toBe(false)
  expect(screen.queryByRole('alert')).toBeNull()
  expect(localStorage.getItem('pebble.push.enabled.fixture-user')).toBe('1')
})

it('an old account POST settling after the new account refresh cannot overwrite its token', async () => {
  const oldResponse = deferred<null>()
  mocks.request.mockReturnValueOnce(oldResponse.promise)
  mocks.register.mockImplementation(async () => { callbacks.get('registration')?.({ value: `token-${mocks.userId}` } as never) })
  setPushEnabled('fixture-user', true)
  setPushEnabled('other-user', true)
  const view = render(<MemoryRouter><PushBridge /></MemoryRouter>)
  await act(flush)
  expect(mocks.request).toHaveBeenCalledTimes(1)
  mocks.userId = 'other-user'
  view.rerender(<MemoryRouter><PushBridge /></MemoryRouter>)
  await act(flush)
  expect(mocks.request).toHaveBeenCalledTimes(2)
  expect(mocks.request.mock.calls[0][2].signal.aborted).toBe(true)
  expect(localStorage.getItem('pebble.push.token')).toBe('token-other-user')
  await act(async () => { oldResponse.resolve(null); await flush() })
  expect(localStorage.getItem('pebble.push.token')).toBe('token-other-user')
})
