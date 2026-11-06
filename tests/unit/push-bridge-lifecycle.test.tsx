import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import PushBridge from '../../src/platform/PushBridge'
import { setPushEnabled } from '../../src/platform/push'

const mocks = vi.hoisted(() => ({ addListener: vi.fn(), remove: vi.fn(), refresh: vi.fn() }))
vi.mock('@capacitor/push-notifications', () => ({ PushNotifications: { addListener: mocks.addListener } }))
vi.mock('../../src/platform/native', () => ({ isNative: () => true }))
vi.mock('../../src/auth/useSession', () => ({ useSession: () => ({ session: { user: { id: 'fixture-user' } } }) }))
vi.mock('../../src/platform/push', async importOriginal => ({ ...await importOriginal<typeof import('../../src/platform/push')>(), refreshPushToken: mocks.refresh }))

beforeEach(() => {
  localStorage.clear()
  mocks.addListener.mockReset().mockResolvedValue({ remove: mocks.remove })
  mocks.remove.mockReset().mockResolvedValue(undefined)
  mocks.refresh.mockReset().mockResolvedValue(undefined)
})
afterEach(() => { cleanup(); localStorage.clear() })

it('starts handling notification taps when push is enabled during this session', async () => {
  render(<MemoryRouter><PushBridge /><button onClick={() => setPushEnabled('fixture-user', true)}>Enable push</button></MemoryRouter>)
  expect(mocks.addListener).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Enable push' }))
  await waitFor(() => expect(mocks.addListener).toHaveBeenCalledWith('pushNotificationActionPerformed', expect.any(Function)))
})

it('removes notification-tap handling immediately when push is disabled', async () => {
  setPushEnabled('fixture-user', true)
  render(<MemoryRouter><PushBridge /><button onClick={() => setPushEnabled('fixture-user', false)}>Disable push</button></MemoryRouter>)
  await waitFor(() => expect(mocks.addListener).toHaveBeenCalled())
  fireEvent.click(screen.getByRole('button', { name: 'Disable push' }))
  await waitFor(() => expect(mocks.remove).toHaveBeenCalled())
})

it('releases late listener handles after StrictMode cleanup and unmount', async () => {
  const installs: ((handle: { remove: typeof mocks.remove }) => void)[] = []
  mocks.addListener.mockImplementation(() => new Promise(resolve => { installs.push(resolve) }))
  setPushEnabled('fixture-user', true)
  const view = render(<StrictMode><MemoryRouter><PushBridge /></MemoryRouter></StrictMode>)
  await act(async () => { await Promise.resolve() })
  expect(installs).toHaveLength(2)
  await act(async () => { installs[0]({ remove: mocks.remove }) })
  expect(mocks.remove).toHaveBeenCalledTimes(1)
  view.unmount()
  await act(async () => { installs[1]({ remove: mocks.remove }) })
  expect(mocks.remove).toHaveBeenCalledTimes(2)
  expect(mocks.refresh.mock.calls.every(([, signal]) => signal instanceof AbortSignal && signal.aborted)).toBe(true)
})

it('handles listener installation rejection without unhandled rejections or hidden retries', async () => {
  mocks.addListener.mockRejectedValue(new Error('listener unavailable'))
  setPushEnabled('fixture-user', true)
  const view = render(<MemoryRouter><PushBridge /></MemoryRouter>)
  await act(async () => { await Promise.resolve() })
  view.unmount()
  await act(async () => { await Promise.resolve() })
  expect(mocks.addListener).toHaveBeenCalledTimes(1)
})

it('handles asynchronous listener removal rejection after disable', async () => {
  mocks.remove.mockRejectedValue(new Error('removal unavailable'))
  setPushEnabled('fixture-user', true)
  render(<MemoryRouter><PushBridge /></MemoryRouter>)
  await act(async () => { await Promise.resolve() })
  await act(async () => { setPushEnabled('fixture-user', false) })
  expect(mocks.remove).toHaveBeenCalledTimes(1)
})
