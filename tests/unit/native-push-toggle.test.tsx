import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PushNotificationsToggle } from '../../src/features/account/PushNotificationsToggle'
import { disablePush, setPushEnabled } from '../../src/platform/push'

const mocks = vi.hoisted(() => ({
  request: vi.fn(), unregister: vi.fn(), register: vi.fn(), addListener: vi.fn(), remove: vi.fn(), permission: vi.fn(), channel: vi.fn(),
  subscribers: new Set<(event: string, session: unknown) => void>(),
}))
vi.mock('../../src/platform/native', () => ({ isNative: () => true }))
vi.mock('../../src/auth/authorizedRequest', () => ({ authorizedRequest: mocks.request }))
vi.mock('@capacitor/push-notifications', () => ({ PushNotifications: {
  unregister: mocks.unregister, register: mocks.register, addListener: mocks.addListener,
  checkPermissions: mocks.permission, createChannel: mocks.channel,
} }))
vi.mock('../../src/supabase', () => ({ supabase: { auth: {
  onAuthStateChange(callback: (event: string, session: unknown) => void) {
    let live = true
    mocks.subscribers.add(callback)
    queueMicrotask(() => { if (live) callback('INITIAL_SESSION', { user: { id: 'fixture-user' } }) })
    return { data: { subscription: { unsubscribe() { live = false; mocks.subscribers.delete(callback) } } } }
  },
} } }))

beforeEach(() => {
  localStorage.clear()
  callbacks.clear()
  mocks.request.mockReset().mockResolvedValue(null)
  mocks.unregister.mockReset().mockResolvedValue(undefined)
  mocks.remove.mockReset().mockResolvedValue(undefined)
  mocks.addListener.mockReset().mockImplementation(async (kind, callback) => { callbacks.set(kind, callback); return { remove: mocks.remove } })
  mocks.permission.mockReset().mockResolvedValue({ receive: 'granted' })
  mocks.channel.mockReset().mockResolvedValue(undefined)
  mocks.register.mockReset().mockImplementation(async () => { callbacks.get('registration')?.({ value: 'fixture-token' } as never) })
  localStorage.setItem('pebble.push.enabled.fixture-user', '1')
  localStorage.setItem('pebble.push.token', 'fixture-token')
})
afterEach(() => { cleanup(); setPushEnabled('fixture-user', false); setPushEnabled('other-user', false); localStorage.clear(); vi.useRealTimers() })

const callbacks = new Map<string, (value: never) => void>()
async function flush() { for (let i = 0; i < 20; i++) await Promise.resolve() }
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
async function openToggle() {
  const view = render(<PushNotificationsToggle />)
  await act(flush)
  return { view, toggle: screen.getByRole('switch') as HTMLInputElement }
}
function switchAccount(userId: string) {
  mocks.subscribers.forEach(callback => callback('SIGNED_IN', { user: { id: userId } }))
}

it('shows the stored opt-in after the normal asynchronous session event', async () => {
  render(<PushNotificationsToggle />)
  const toggle = await screen.findByRole('switch', { name: 'Notifications on this phone' })
  await waitFor(() => expect((toggle as HTMLInputElement).checked).toBe(true))
})

it.each(['server', 'native'])('bounds stalled %s cleanup when disabling push', async part => {
  vi.useFakeTimers()
  const held = new Promise<never>(() => {})
  if (part === 'server') mocks.request.mockReturnValue(held)
  else mocks.unregister.mockReturnValue(held)
  let settled = false
  void disablePush('fixture-user').catch(() => undefined).finally(() => { settled = true })
  await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
  expect(settled).toBe(true)
  expect(localStorage.getItem('pebble.push.enabled.fixture-user')).toBeNull()
})

it('turns hydrated stored consent off directly without enabling or registering first', async () => {
  const { toggle } = await openToggle()
  expect(toggle.checked).toBe(true)
  await act(async () => { fireEvent.click(toggle); await flush() })
  expect(toggle.checked).toBe(false)
  expect(toggle.disabled).toBe(false)
  expect(mocks.register).not.toHaveBeenCalled()
  expect(mocks.request).toHaveBeenCalledExactlyOnceWith('/api/push/devices', expect.anything(), expect.objectContaining({ method: 'DELETE' }))
  expect(screen.queryByRole('alert')).toBeNull()
})

it.each(['server', 'native'])('stalled %s opt-out shows off immediately, recovers at three seconds and gives truthful guidance', async part => {
  vi.useFakeTimers()
  const held = deferred<null>()
  if (part === 'server') mocks.request.mockReturnValue(held.promise)
  else mocks.unregister.mockReturnValue(held.promise)
  const { toggle } = await openToggle()
  expect(toggle.checked).toBe(true)
  await act(async () => { fireEvent.click(toggle); await flush() })
  expect(toggle.checked).toBe(false)
  expect(toggle.disabled).toBe(true)
  await act(async () => { await vi.advanceTimersByTimeAsync(2999) })
  expect(toggle.disabled).toBe(true)
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  expect(toggle.disabled).toBe(false)
  expect(toggle.checked).toBe(false)
  expect(screen.getByRole('alert').textContent).toMatch(/preference is off.*could not be confirmed.*phone’s Settings/)
  expect(localStorage.getItem('pebble.push.enabled.fixture-user')).toBeNull()
  expect(localStorage.getItem('pebble.push.token')).toBeNull()
  expect(mocks.request.mock.calls[0][2].signal.aborted).toBe(true)
  await act(async () => { held.resolve(null); await vi.advanceTimersByTimeAsync(12000) })
  expect(mocks.request).toHaveBeenCalledTimes(1)
  expect(mocks.unregister).toHaveBeenCalledTimes(1)
  expect(mocks.register).not.toHaveBeenCalled()
  expect(toggle.checked).toBe(false)
})

it.each(['server', 'native', 'both'])('rejected %s cleanup leaves opt-in off and the switch usable without exposing errors', async part => {
  if (part !== 'native') mocks.request.mockRejectedValue(new Error('fixture-token'))
  if (part !== 'server') mocks.unregister.mockRejectedValue(new Error('private native failure'))
  const { toggle } = await openToggle()
  await act(async () => { fireEvent.click(toggle); await flush() })
  expect(toggle.checked).toBe(false)
  expect(toggle.disabled).toBe(false)
  expect(screen.getByRole('alert').textContent).toMatch(/could not be confirmed/)
  expect(document.body.textContent).not.toContain('fixture-token')
  expect(document.body.textContent).not.toContain('private native failure')
})

it('reflects subsequent current-account preference changes without remounting', async () => {
  const { toggle } = await openToggle()
  await act(async () => { setPushEnabled('fixture-user', false) })
  expect(toggle.checked).toBe(false)
  await act(async () => { setPushEnabled('fixture-user', true) })
  expect(toggle.checked).toBe(true)
})

it('supports explicit enable then disable after hydration', async () => {
  setPushEnabled('fixture-user', false)
  const { toggle } = await openToggle()
  await act(async () => { fireEvent.click(toggle); await flush() })
  expect(toggle.checked).toBe(true)
  expect(toggle.disabled).toBe(false)
  expect(mocks.register).toHaveBeenCalledTimes(1)
  await act(async () => { fireEvent.click(toggle); await flush() })
  expect(toggle.checked).toBe(false)
  expect(toggle.disabled).toBe(false)
  expect(mocks.unregister).toHaveBeenCalledTimes(1)
  expect(mocks.request.mock.calls.map(([, , options]) => options.method)).toEqual(['POST', 'DELETE'])
})

it('switching accounts during enable cancels old token storage and cannot change the new display or consent', async () => {
  setPushEnabled('fixture-user', false)
  setPushEnabled('other-user', true)
  localStorage.removeItem('pebble.push.token')
  const response = deferred<null>()
  mocks.request.mockReturnValue(response.promise)
  const { toggle } = await openToggle()
  await act(async () => { fireEvent.click(toggle); await flush() })
  expect(toggle.disabled).toBe(true)
  await act(async () => { switchAccount('other-user'); await flush() })
  const current = screen.getByRole('switch') as HTMLInputElement
  expect(current.checked).toBe(true)
  expect(current.disabled).toBe(false)
  await act(async () => { response.resolve(null); await flush() })
  expect(mocks.request.mock.calls[0][2].signal.aborted).toBe(true)
  expect(localStorage.getItem('pebble.push.enabled.fixture-user')).toBeNull()
  expect(localStorage.getItem('pebble.push.enabled.other-user')).toBe('1')
  expect(localStorage.getItem('pebble.push.token')).toBeNull()
  expect(current.checked).toBe(true)
  expect(screen.queryByRole('alert')).toBeNull()
})

it.each(['server', 'native'])('old %s disable completion cannot clear a new account display or show its error', async part => {
  vi.useFakeTimers()
  setPushEnabled('other-user', true)
  const response = deferred<null>()
  if (part === 'server') mocks.request.mockReturnValue(response.promise)
  else mocks.unregister.mockReturnValue(response.promise)
  const { toggle } = await openToggle()
  await act(async () => { fireEvent.click(toggle); await flush() })
  await act(async () => { switchAccount('other-user'); await flush() })
  const current = screen.getByRole('switch') as HTMLInputElement
  expect(current.checked).toBe(true)
  expect(current.disabled).toBe(false)
  await act(async () => { response.resolve(null); await vi.advanceTimersByTimeAsync(4000) })
  expect(current.checked).toBe(true)
  expect(current.disabled).toBe(false)
  expect(localStorage.getItem('pebble.push.enabled.other-user')).toBe('1')
  expect(screen.queryByRole('alert')).toBeNull()
})

it('unmounting during enable prevents late permission completion from registering or saving opt-in', async () => {
  setPushEnabled('fixture-user', false)
  const permission = deferred<{ receive: string }>()
  mocks.permission.mockReturnValue(permission.promise)
  const { view, toggle } = await openToggle()
  await act(async () => { fireEvent.click(toggle); await flush() })
  view.unmount()
  await act(async () => { permission.resolve({ receive: 'granted' }); await flush() })
  expect(mocks.register).not.toHaveBeenCalled()
  expect(mocks.request).not.toHaveBeenCalled()
  expect(localStorage.getItem('pebble.push.enabled.fixture-user')).toBeNull()
})

it('returning to an account after abandoning cleanup does not restore its stale busy state', async () => {
  vi.useFakeTimers()
  mocks.unregister.mockReturnValue(new Promise<never>(() => {}))
  const { toggle } = await openToggle()
  await act(async () => { fireEvent.click(toggle); await flush() })
  await act(async () => { switchAccount('other-user'); await flush() })
  await act(async () => { switchAccount('fixture-user'); await flush() })
  const returned = screen.getByRole('switch') as HTMLInputElement
  expect(returned.checked).toBe(false)
  expect(returned.disabled).toBe(false)
  await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
  expect(returned.disabled).toBe(false)
})
