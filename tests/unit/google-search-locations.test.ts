// @vitest-environment node
import { createHmac } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { createGoogleSearchLocations } from '../../api/google-search-locations'
import { MapPreviewRequestSchema, MapPreviewSchema } from '../../shared/location-picker'

const owner = 'a0000000-0000-4000-8000-000000000001', token = 'b0000000-0000-4000-8000-000000000001'
const signingKey = 'ab'.repeat(32), now = Date.parse('2026-10-30T12:00:00Z')
const parts = [
  { longText: 'Brooklyn', shortText: 'Brooklyn', types: ['sublocality_level_1'] },
  { longText: 'New York', shortText: 'NY', types: ['administrative_area_level_1'] },
  { longText: 'United States', shortText: 'US', types: ['country'] },
]
it('restricts new autocomplete to the US, requests minimal fields and scopes sessions to owner/mode', async () => {
  const request = vi.fn<typeof fetch>(async () => Response.json({ suggestions: [{ placePrediction: { placeId: 'place', text: { text: 'Brooklyn, NY' } } }] }))
  const provider = createGoogleSearchLocations({ apiKey: 'server-key', signingKey, fetch: request })
  for (const [id, mode] of [[owner, 'friends'], [owner, 'dating'], [token, 'friends']] as const) {
    expect(await provider.suggestions(id, { mode, input: 'Brooklyn', sessionToken: token })).toEqual({ suggestions: [{ placeId: 'place', label: 'Brooklyn, NY' }] })
  }
  const bodies = request.mock.calls.map(([, init]) => JSON.parse(String(init?.body)))
  expect(bodies[0]).toMatchObject({ includedRegionCodes: ['us'], input: 'Brooklyn' })
  expect(new Set(bodies.map(body => body.sessionToken)).size).toBe(3)
  expect(bodies.every(body => /^[A-Za-z0-9_-]{32}$/.test(body.sessionToken))).toBe(true)
  expect(new Headers(request.mock.calls[0][1]?.headers).get('X-Goog-FieldMask')).not.toContain('displayName')
})
it('signs canonical place data, never a client label or coordinate, with a ten-minute preview TTL', async () => {
  const request = vi.fn<typeof fetch>(async () => Response.json({ id: 'place', location: { latitude: 40.7, longitude: -73.9 }, addressComponents: parts }))
  let clock = now
  const provider = createGoogleSearchLocations({ apiKey: 'server-key', signingKey, fetch: request, now: () => clock++ })
  const result = MapPreviewSchema.parse(await provider.preview(owner, { kind: 'place', mode: 'friends', placeId: 'place', sessionToken: token }))
  expect(result.areaLabel).toBe('Brooklyn, NY')
  expect(clock).toBe(now + 1)
  expect(JSON.parse(result.ticket.payload)).toMatchObject({ actorId: owner, mode: 'friends', origin: 'place-search', latitude: 40.7, longitude: -73.9, expiresAt: '2026-10-30T12:10:00.000Z' })
  expect(result.ticket.signature).toBe(createHmac('sha256', Buffer.from(signingKey, 'hex')).update(result.ticket.payload).digest('hex'))
  expect(new URL(String(request.mock.calls[0][0])).searchParams.get('sessionToken')).toBe(createHmac('sha256', Buffer.from(signingKey, 'hex')).update(`${owner}:friends:${token}`).digest('base64url').slice(0, 32))
  expect(MapPreviewRequestSchema.safeParse({ kind: 'place', mode: 'friends', placeId: 'place', sessionToken: token, areaLabel: 'Forged' }).success).toBe(false)
})
it('reverse-geocodes only an area label and preserves the exact user-selected center', async () => {
  const center = { latitude: 40.71234, longitude: -73.91234 }
  const provider = createGoogleSearchLocations({ apiKey: 'server-key', signingKey, now: () => now, fetch: vi.fn(async () => Response.json({ status: 'OK', results: [{ place_id: 'nearby', geometry: { location: { lat: 10, lng: 10 } }, address_components: parts.map(part => ({ long_name: part.longText, short_name: part.shortText, types: part.types })) }] })) })
  expect(await provider.preview(owner, { kind: 'pin', mode: 'dating', center, deviceAssisted: false })).toMatchObject({ center, areaLabel: 'Brooklyn, NY' })
})
it('rejects non-US selections, mismatched place identities and empty results', async () => {
  for (const result of [
    { id: 'place', location: { latitude: 45, longitude: -75 }, addressComponents: [{ longText: 'Canada', shortText: 'CA', types: ['country'] }] },
    { id: 'wrong-place', location: { latitude: 40, longitude: -73 }, addressComponents: parts },
    {},
  ]) {
    const provider = createGoogleSearchLocations({ apiKey: 'server-key', signingKey, fetch: vi.fn(async () => Response.json(result)) })
    await expect(provider.preview(owner, { kind: 'place', mode: 'friends', placeId: 'place', sessionToken: token })).rejects.toThrow()
  }
})
it('sanitizes provider failures without leaking keys, URLs or raw upstream details', async () => {
  for (const status of [403, 429, 500]) {
    const provider = createGoogleSearchLocations({ apiKey: 'private-key', signingKey, fetch: vi.fn(async () => new Response('sensitive upstream detail', { status })) })
    await expect(provider.suggestions(owner, { mode: 'friends', input: 'Brooklyn', sessionToken: token })).rejects.toMatchObject({ status: status === 429 ? 429 : 503 })
  }
})
