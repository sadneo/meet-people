import { afterEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { eventRequest } from '../../src/features/events/client'

vi.mock('../../src/supabase', () => ({ supabase: null }))
afterEach(() => vi.unstubAllGlobals())
const schema = z.object({ title: z.string() })
const unavailable = 'Events are unavailable. Try again.'

it('replaces an HTML gateway response with an understandable events error', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('<html><body>Bad gateway</body></html>', { status: 502, headers: { 'Content-Type': 'text/html' } })))
  await expect(eventRequest('/example', schema)).rejects.toThrow(unavailable)
})

it('replaces browser network diagnostics with an understandable events error', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
  await expect(eventRequest('/example', schema)).rejects.toThrow(unavailable)
})

it.each(['invalid JSON', 'invalid event data'])('normalizes a successful response containing %s', async kind => {
  vi.stubGlobal('fetch', vi.fn(async () => kind === 'invalid JSON' ? new Response('broken JSON') : Response.json({ title: 42 })))
  await expect(eventRequest('/example', schema)).rejects.toThrow(unavailable)
})

it('preserves an actionable JSON error from the events server', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'This event is no longer available.' }, { status: 404 })))
  await expect(eventRequest('/example', schema)).rejects.toThrow('This event is no longer available.')
})

it('returns validated event data after a successful request', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ title: 'Campus concert' })))
  await expect(eventRequest('/example', schema)).resolves.toEqual({ title: 'Campus concert' })
})

for (const phase of ['fetch', 'body']) {
  it(`preserves cancellation during ${phase} so leaving a page does not become a service error`, async () => {
    const controller = new AbortController()
    const cancelled = new DOMException('The request was aborted.', 'AbortError')
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (phase === 'fetch') { controller.abort(); throw cancelled }
      return { json: async () => { controller.abort(); throw cancelled } }
    }))
    await expect(eventRequest('/example', schema, { signal: controller.signal })).rejects.toBe(cancelled)
  })
}
