import { afterEach, expect, it, vi } from 'vitest'
import { matchmakingClient } from '../../src/features/matchmaking/client'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
it('aborts a stalled request before headers and returns a safe timeout error', async () => {
  vi.useFakeTimers()
  let signal!: AbortSignal
  vi.stubGlobal('fetch', vi.fn((_input, init) => {
    signal = init.signal
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('private network detail', 'AbortError')), { once: true }))
  }))
  const outcome = matchmakingClient('synthetic-jwt').notifications().catch(error => error)
  await vi.advanceTimersByTimeAsync(15000)
  expect(signal.aborted).toBe(true)
  expect(await outcome).toMatchObject({ code: 'provider', status: 503, message: expect.stringMatching(/timed out/i) })
  expect(vi.getTimerCount()).toBe(0)
})
for (const method of ['GET', 'DELETE']) it(`keeps the ${method} deadline attached after headers while body consumption stalls`, async () => {
  vi.useFakeTimers()
  let signal!: AbortSignal
  let headersReturned = false
  vi.stubGlobal('fetch', vi.fn(async (_input, init) => {
    signal = init.signal
    const response = new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode('{'))
      signal.addEventListener('abort', () => controller.error(new DOMException('private stalled body', 'AbortError')), { once: true })
    } }))
    headersReturned = true
    return response
  }))
  const client = matchmakingClient('synthetic-jwt')
  const outcome = (method === 'GET' ? client.notifications() : client.groupLeave('e0000000-0000-4000-8000-000000000001')).catch(error => error)
  await vi.advanceTimersByTimeAsync(0)
  expect(headersReturned).toBe(true)
  expect(signal.aborted).toBe(false)
  await vi.advanceTimersByTimeAsync(15000)
  expect(signal.aborted).toBe(true)
  const error = await outcome
  expect(error).toMatchObject({ code: 'provider', status: 503, message: expect.stringMatching(/timed out/i) })
  expect(error.message).not.toContain('private')
  expect(vi.getTimerCount()).toBe(0)
})
it('cleans up the deadline only after a successful body is consumed', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ notifications: [], unreadCount: 0 })))
  expect(await matchmakingClient('synthetic-jwt').notifications()).toEqual({ notifications: [], unreadCount: 0 })
  expect(vi.getTimerCount()).toBe(0)
})
