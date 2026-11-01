import { createHmac } from 'node:crypto'
import { z } from 'zod'
import type { MapCenter, MapPreview, MapPreviewRequest, MapSuggestionsRequest } from '../shared/location-picker.js'

export class MapLocationFailure extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}
export interface MapLocationProvider {
  suggestions(owner: string, value: MapSuggestionsRequest): Promise<{ suggestions: { placeId: string; label: string }[] }>
  preview(owner: string, value: MapPreviewRequest): Promise<MapPreview>
}
const coordinate = z.object({ latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180) })
const component = z.object({ longText: z.string(), shortText: z.string().optional(), types: z.array(z.string()) })
type Component = z.infer<typeof component>
function areaLabel(parts: Component[]) {
  const get = (type: string) => parts.find(part => part.types.includes(type))
  if (get('country')?.shortText !== 'US') throw new MapLocationFailure(400, 'Choose an area in the United States.')
  const area = ['neighborhood', 'sublocality_level_1', 'sublocality', 'locality', 'administrative_area_level_3', 'administrative_area_level_2'].map(get).find(Boolean)
  if (!area) throw new MapLocationFailure(400, 'Choose a nearby city or neighborhood on the map.')
  const state = get('administrative_area_level_1')?.shortText
  return [area.longText, state].filter(Boolean).join(', ').slice(0, 120)
}

// The browser never supplies authoritative Google labels or geocoded coordinates.
// The signed preview is verified again by an actor-JWT RPC, not a service-role writer.
export function createGoogleSearchLocations(config: { apiKey: string; signingKey: string; fetch?: typeof fetch; now?: () => number }): MapLocationProvider {
  if (!/^[a-f0-9]{64}$/i.test(config.signingKey)) throw new Error('Location signing key must contain 32 random bytes encoded as hex.')
  const request = config.fetch ?? fetch, now = config.now ?? Date.now
  // Tokens are scoped to owner AND mode before reaching Google; no query text is retained.
  // Google accepts at most 36 ASCII characters. 32 base64url chars retain 192 bits.
  const sessionToken = (owner: string, mode: string, token: string) => createHmac('sha256', Buffer.from(config.signingKey, 'hex')).update(`${owner}:${mode}:${token}`).digest('base64url').slice(0, 32)
  async function json(url: string, init?: RequestInit) {
    try {
      const response = await request(url, { ...init, signal: AbortSignal.timeout(8000) })
      if (!response.ok) throw new MapLocationFailure(response.status === 429 ? 429 : 503, response.status === 429 ? 'Location search is busy. Try again shortly.' : 'Google location search is unavailable. Try again.')
      return await response.json() as unknown
    } catch (error) {
      if (error instanceof MapLocationFailure) throw error
      throw new MapLocationFailure(503, 'Google location search is unavailable. Try again.')
    }
  }
  const headers = (fields: string) => ({ 'Content-Type': 'application/json', 'X-Goog-Api-Key': config.apiKey, 'X-Goog-FieldMask': fields })
  return {
    async suggestions(owner, value) {
      const result = z.object({ suggestions: z.array(z.object({ placePrediction: z.object({ placeId: z.string(), text: z.object({ text: z.string() }) }).optional() })).default([]) }).safeParse(await json('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST', headers: headers('suggestions.placePrediction.placeId,suggestions.placePrediction.text.text'),
        body: JSON.stringify({ input: value.input, includedRegionCodes: ['us'], languageCode: 'en', sessionToken: sessionToken(owner, value.mode, value.sessionToken) }),
      }))
      if (!result.success) throw new MapLocationFailure(502, 'Location suggestions could not be confirmed.')
      return { suggestions: result.data.suggestions.flatMap(row => row.placePrediction ? [{ placeId: row.placePrediction.placeId, label: row.placePrediction.text.text }] : []).slice(0, 10) }
    },
    async preview(owner, value) {
      let center: MapCenter, label: string, placeId: string | null
      if (value.kind === 'place') {
        const query = new URLSearchParams({ sessionToken: sessionToken(owner, value.mode, value.sessionToken), languageCode: 'en' })
        const result = z.object({ id: z.string(), location: coordinate, addressComponents: z.array(component) }).safeParse(await json(`https://places.googleapis.com/v1/places/${encodeURIComponent(value.placeId)}?${query}`, { headers: headers('id,location,addressComponents') }))
        if (!result.success || result.data.id !== value.placeId) throw new MapLocationFailure(502, 'That area could not be confirmed. Search again.')
        center = result.data.location; label = areaLabel(result.data.addressComponents); placeId = result.data.id
      } else {
        center = value.center
        const query = new URLSearchParams({ latlng: `${center.latitude},${center.longitude}`, language: 'en', key: config.apiKey })
        const result = z.object({ status: z.string(), results: z.array(z.object({ place_id: z.string(), address_components: z.array(z.object({ long_name: z.string(), short_name: z.string(), types: z.array(z.string()) })) })).default([]) }).safeParse(await json(`https://maps.googleapis.com/maps/api/geocode/json?${query}`))
        if (!result.success || !['OK', 'ZERO_RESULTS'].includes(result.data.status)) throw new MapLocationFailure(503, 'The area name is unavailable. Try again.')
        const first = result.data.results[0]
        if (!first) throw new MapLocationFailure(400, 'Choose a nearby city or neighborhood on the map.')
        label = areaLabel(first.address_components.map(part => ({ longText: part.long_name, shortText: part.short_name, types: part.types })))
        placeId = first.place_id
      }
      const resolvedAt = now(), issuedAt = new Date(resolvedAt).toISOString(), expiresAt = new Date(resolvedAt + 10 * 60_000).toISOString()
      const payload = JSON.stringify({ actorId: owner, requestId: crypto.randomUUID(), mode: value.mode, latitude: center.latitude, longitude: center.longitude, areaLabel: label,
        origin: value.kind === 'place' ? 'place-search' : value.deviceAssisted ? 'device-assisted' : 'map-pin', providerPlaceId: placeId, issuedAt, expiresAt })
      return { center, areaLabel: label, expiresAt, ticket: { payload, signature: createHmac('sha256', Buffer.from(config.signingKey, 'hex')).update(payload).digest('hex') } }
    },
  }
}
