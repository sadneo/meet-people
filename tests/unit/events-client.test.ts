import { afterEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { eventRequest, safeImage, eventImagePlaceholder, calendarLink } from '../../src/features/events/client'

vi.mock('../../src/supabase', () => ({ supabase: null }))
afterEach(() => vi.unstubAllGlobals())
const schema = z.object({ title: z.string() })
const unavailable = 'Events are unavailable. Try again.'

it('encodes calendar text and normalizes offset event times to UTC', () => {
  const url = new URL(calendarLink({ title: 'Music & coffee / #1', starts_at: '2026-11-14T12:00:00-05:00', ends_at: '2026-11-14T15:00:00-05:00', location_name: 'Hall & garden', address: '1 Main St', city: 'Stony Brook' })!)
  expect(url.origin).toBe('https://calendar.google.com')
  expect(url.searchParams.get('text')).toBe('Music & coffee / #1')
  expect(url.searchParams.get('dates')).toBe('20261114T170000Z/20261114T200000Z')
  expect(url.searchParams.get('location')).toBe('Hall & garden, 1 Main St, Stony Brook')
})
it.each([null, 'invalid', '2026-11-14T10:00:00Z'])('uses a two-hour calendar duration for unusable end %s', ends_at => {
  const url = new URL(calendarLink({ title: 'Event', starts_at: '2026-11-14T12:00:00Z', ends_at })!)
  expect(url.searchParams.get('dates')).toBe('20261114T120000Z/20261114T140000Z')
})
it.each([null, 'invalid'])('does not offer a calendar link for unusable start %s', starts_at => {
  expect(calendarLink({ title: 'Event', starts_at, ends_at: null })).toBeNull()
})

it('allows bundled event photos without accepting arbitrary local or script URLs', () => {
  expect(safeImage('/pebble/event-picnic.jpg')).toBe('/pebble/event-picnic.jpg')
  for (const value of ['/private/file', '//other.example/image.jpg', 'javascript:alert(1)', '/pebble/../private.jpg']) {
    expect(safeImage(value)).toBe(eventImagePlaceholder)
  }
})

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
