import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { announceMessagesActivity, useMessagesActivity } from '../../src/features/messaging/useMessagesActivity'

const request = vi.hoisted(() => vi.fn())
vi.mock('../../src/features/messaging/client', () => ({ messagingRequest: request }))
vi.mock('../../src/auth/useSession', () => ({ useSession: () => ({ session: { user: { id: 'activity-owner' } } }) }))

beforeEach(() => {
  vi.useFakeTimers()
  request.mockReset().mockResolvedValue({ unreadConversations: 1, incomingRequests: 0 })
})
afterEach(() => { cleanup(); vi.useRealTimers() })

it('disables immediate, interval, visibility and event reads, then resumes outside Dating', async () => {
  const { result, rerender } = renderHook(({ enabled }) => useMessagesActivity(enabled), { initialProps: { enabled: false } })
  await act(async () => {
    announceMessagesActivity()
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(60000)
  })
  expect(request).not.toHaveBeenCalled()
  expect(result.current).toBe(false)
  await act(async () => rerender({ enabled: true }))
  expect(request).toHaveBeenCalledTimes(1)
  expect(result.current).toBe(true)
  await act(async () => { announceMessagesActivity() })
  expect(request).toHaveBeenCalledTimes(2)
  await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
  expect(request).toHaveBeenCalledTimes(3)
  rerender({ enabled: false })
  await act(async () => {
    announceMessagesActivity()
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(60000)
  })
  expect(request).toHaveBeenCalledTimes(3)
  expect(result.current).toBe(false)
})

it('aborts and ignores a late activity response when Dating disables the hook', async () => {
  let finish!: (value: { unreadConversations: number; incomingRequests: number }) => void
  request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const { result, rerender } = renderHook(({ enabled }) => useMessagesActivity(enabled), { initialProps: { enabled: true } })
  const signal = request.mock.calls[0][2].signal as AbortSignal
  rerender({ enabled: false })
  expect(signal.aborted).toBe(true)
  await act(async () => { finish({ unreadConversations: 1, incomingRequests: 0 }) })
  expect(result.current).toBe(false)
  request.mockResolvedValueOnce({ unreadConversations: 0, incomingRequests: 0 })
  await act(async () => rerender({ enabled: true }))
  expect(result.current).toBe(false)
  expect(request).toHaveBeenCalledTimes(2)
})
