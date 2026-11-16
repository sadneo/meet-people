import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useConversationTyping } from '../../src/features/messaging/useConversationTyping'
const api = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('../../src/features/messaging/client', () => ({ messagingRequest: api.request }))
beforeEach(() => {
  vi.useFakeTimers()
  api.request.mockReset().mockResolvedValue({ ok: true })
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0) })

it('throttles activity without sending draft content and stops when editing becomes idle', async () => {
  const view = renderHook(() => useConversationTyping('chat', false, true, 'me'))
  act(() => { view.result.current(true); view.result.current(true) }); await flush()
  expect(api.request).toHaveBeenCalledTimes(1)
  expect(api.request.mock.calls[0][2].body).toEqual({ isGroup: false, typing: true })
  expect(api.request.mock.calls[0][2].expectedUserId).toBe('me')
  await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
  act(() => view.result.current(true)); await flush()
  expect(api.request).toHaveBeenCalledTimes(2)
  await act(async () => { await vi.advanceTimersByTimeAsync(2500) })
  expect(api.request.mock.calls.at(-1)?.[2].body.typing).toBe(false)
  view.unmount()
})

it('stops on blur, permission loss, hiding and unmount; it never starts without permission', async () => {
  const view = renderHook(({ enabled }) => useConversationTyping('chat', true, enabled, 'me'), { initialProps: { enabled: true } })
  act(() => view.result.current(true)); await flush()
  act(() => window.dispatchEvent(new Event('blur'))); await flush()
  expect(api.request.mock.calls.at(-1)?.[2].body).toEqual({ isGroup: true, typing: false })
  act(() => view.result.current(true)); await flush()
  view.rerender({ enabled: false }); await flush()
  const count = api.request.mock.calls.length
  act(() => view.result.current(true)); await flush()
  expect(api.request).toHaveBeenCalledTimes(count)
  view.rerender({ enabled: true })
  act(() => view.result.current(true)); await flush()
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
  act(() => document.dispatchEvent(new Event('visibilitychange'))); await flush()
  expect(api.request.mock.calls.at(-1)?.[2].body.typing).toBe(false)
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  act(() => view.result.current(true)); await flush()
  view.unmount(); await flush()
  expect(api.request.mock.calls.at(-1)?.[2].body.typing).toBe(false)
})

it('keeps a slow start ahead of its stop and treats unavailable typing as best effort', async () => {
  let complete!: () => void
  api.request.mockImplementationOnce(() => new Promise<void>(resolve => { complete = resolve }))
  const view = renderHook(() => useConversationTyping('chat', false, true, 'me'))
  act(() => view.result.current(true)); await flush()
  act(() => view.result.current(false)); await flush()
  expect(api.request).toHaveBeenCalledTimes(1)
  complete(); await flush()
  expect(api.request.mock.calls.map(call => call[2].body.typing)).toEqual([true, false])
  api.request.mockRejectedValueOnce(new Error('Unavailable'))
  act(() => view.result.current(true)); await flush()
  act(() => view.result.current(false)); await flush()
  expect(api.request.mock.calls.at(-1)?.[2].body.typing).toBe(false)
  view.unmount()
})
