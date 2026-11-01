import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { BrowserSearchLocationSchema, ResolveSearchAreaSchema, SearchLocationReceiptSchema, SearchModeSchema, SearchPlacesSchema } from '../shared/search-locations.js'
import { FriendsLabelSchema } from '../shared/friends-search-preferences.js'
import type { UserContextTransport } from './matchmaking.js'
import { MapConfigSchema, MapPreviewRequestSchema, MapPreviewSchema, MapSelectionSchema, MapSuggestionsRequestSchema, MapSuggestionsSchema, MapTicketSchema } from '../shared/location-picker.js'
import { MapLocationFailure, type MapLocationProvider } from './google-search-locations.js'
type Actor = ReturnType<UserContextTransport['actor']>
class LocationFailure extends Error { constructor(readonly status: number, message: string) { super(message) } }
const empty = z.object({}).strict()
async function read<T>(call: (() => PromiseLike<{ data: unknown; error: { code?: string } | null }>) | undefined, schema: z.ZodType<T>) {
 if (!call) throw new LocationFailure(503, 'Search location resolution is not available yet.')
 const result = await call()
 if (result.error) {
  const code = result.error.code
  if (code === '28000') throw new LocationFailure(401, 'Sign in again to choose a search location.')
  if (['22023','22021','22P05','22003'].includes(code ?? '')) throw new LocationFailure(400, 'Choose a valid area or a recent, accurate device location.')
  if (code === 'LC429') throw new LocationFailure(429, 'Location lookup limit reached. Try again later.')
  if (code === 'LC403') throw new LocationFailure(403, 'Enable nearby suggestions in Settings before using device location.')
  if (code === 'LC409') throw new LocationFailure(409, 'That location is unavailable or your home changed. Choose it again.')
  if (code === 'PT404') throw new LocationFailure(404, 'No location receipt is available for this account.')
  throw new LocationFailure(503, 'Location resolution could not be confirmed. Check the current selection before trying again.')
 }
 const parsed = schema.safeParse(result.data)
 if (!parsed.success) throw new LocationFailure(502, 'The search location response could not be confirmed.')
 return parsed.data
}
export function createSearchLocationsRouter(provider: MapLocationProvider | null = null, dailyLimit = 2000) {
  const router = Router()
  // Per-process backstop, not a substitute for account-wide Google quotas.
  const usage = new Map<string, { count: number; until: number }>()
  let day = '', dailyCalls = 0
  function reserve(owner: string) {
    if (!provider) throw new LocationFailure(503, 'Map search is not configured yet.')
    const now = Date.now(), today = new Date(now).toISOString().slice(0, 10)
    if (day !== today) { day = today; dailyCalls = 0 }
    if (dailyCalls >= dailyLimit) throw new LocationFailure(429, 'Location search has reached its daily limit. Try again later.')
    for (const [id, value] of usage) if (value.until <= now) usage.delete(id)
    const value = usage.get(owner) ?? { count: 0, until: now + 60_000 }
    if (value.count >= 60 || (!usage.has(owner) && usage.size >= 10_000)) throw new LocationFailure(429, 'Too many location requests. Try again shortly.')
    value.count++; dailyCalls++; usage.set(owner, value)
    return provider
  }
 router.use((_request, response, next) => { response.set('Cache-Control','no-store'); if (!z.uuid().safeParse(response.locals.actorId).success || !response.locals.actor) return next(new LocationFailure(401,'Sign in to choose a search location.')); next() })
  const actor = (response: Response) => response.locals.actor as Actor
  router.get('/map/config', (request, response) => {
    if (Object.keys(request.query).length) throw new LocationFailure(400, 'Unexpected map fields.')
    response.json(MapConfigSchema.parse({ available: !!provider }))
  })
  router.post('/map/suggestions', async (request, response) => {
    const value = MapSuggestionsRequestSchema.safeParse(request.body)
    if (!value.success || Object.keys(request.query).length) throw new LocationFailure(400, 'Enter a city or neighborhood to search.')
    response.json(MapSuggestionsSchema.parse(await reserve(response.locals.actorId).suggestions(response.locals.actorId, value.data)))
  })
  router.post('/map/preview', async (request, response) => {
    const value = MapPreviewRequestSchema.safeParse(request.body)
    if (!value.success || Object.keys(request.query).length) throw new LocationFailure(400, 'Choose a valid search area.')
    if (value.data.kind === 'pin' && value.data.deviceAssisted) {
      const call = actor(response).account
      const account = await read(call && (() => call()), z.object({ settings: z.object({ location: z.boolean() }) }))
      if (!account.settings.location) throw new LocationFailure(403, 'Enable location access in Profile → Discovery before using your current location.')
    }
    response.json(MapPreviewSchema.parse(await reserve(response.locals.actorId).preview(response.locals.actorId, value.data)))
  })
  router.post('/map/confirm', async (request, response) => {
    const value = z.object({ mode: SearchModeSchema, ticket: MapTicketSchema }).strict().safeParse(request.body)
    if (!value.success || Object.keys(request.query).length) throw new LocationFailure(400, 'Choose a valid search area.')
    let claims: { actorId?: string; mode?: string }
    try { claims = JSON.parse(value.data.ticket.payload) } catch { throw new LocationFailure(400, 'Invalid location confirmation.') }
    if (!claims || claims.actorId !== response.locals.actorId || claims.mode !== value.data.mode) throw new LocationFailure(400, 'This selection belongs to another account or mode.')
    const call = actor(response).confirmMapSearchLocation
    const receipt = await read(call && (() => call(value.data.ticket)), SearchLocationReceiptSchema)
    if (receipt.mode !== value.data.mode || receipt.source !== 'temporary' || receipt.method !== 'selected-area') throw new LocationFailure(502, 'The selected area could not be confirmed.')
    if (!receipt.usable) throw new LocationFailure(409, 'That selection has expired. Choose the area again.')
    response.json(receipt)
  })
  router.get('/map/:mode/:referenceId', async (request, response) => {
    const mode = SearchModeSchema.safeParse(request.params.mode), reference = z.uuid().safeParse(request.params.referenceId)
    if (!mode.success || !reference.success || Object.keys(request.query).length) throw new LocationFailure(400, 'Invalid saved map selection.')
    const call = actor(response).mapSearchLocation
    response.json(await read(call && (() => call(mode.data, reference.data)), MapSelectionSchema))
  })
 router.get('/places', async (request, response) => {
  if (!empty.safeParse(request.body === undefined ? {} : request.body).success) throw new LocationFailure(400,'Unexpected location fields.')
  const parsed = z.object({ q: FriendsLabelSchema }).strict().safeParse(request.query)
  if (!parsed.success) throw new LocationFailure(400,'Enter a city or campus to look up.')
  const call = actor(response).searchPlaces
  response.json(await read(call && (() => call(parsed.data.q)),SearchPlacesSchema))
 })
 router.post('/resolve', async (request, response) => {
  const parsed = ResolveSearchAreaSchema.safeParse(request.body)
  if (!parsed.success || Object.keys(request.query ?? {}).length) throw new LocationFailure(400,'Choose an area from the location results.')
  const call = actor(response).resolveSearchArea
  const receipt = await read(call && (() => call(parsed.data)),SearchLocationReceiptSchema)
  if (receipt.mode!==parsed.data.mode || receipt.source!==parsed.data.source) throw new LocationFailure(502,'The selected area could not be confirmed.')
  if (!receipt.usable) throw new LocationFailure(409,'That search location has expired or changed. Choose it again.')
  response.json(receipt)
 })
 router.post('/browser', async (request, response) => {
  const parsed = BrowserSearchLocationSchema.safeParse(request.body)
  if (!parsed.success || Object.keys(request.query ?? {}).length) throw new LocationFailure(400,'Use an explicitly permitted, recent and accurate device location.')
  const call = actor(response).browserSearchLocation
  const receipt = await read(call && (() => call(parsed.data)),SearchLocationReceiptSchema)
  if (receipt.mode!==parsed.data.mode || receipt.source!=='temporary' || receipt.method!=='device-reported') throw new LocationFailure(502,'Device location could not be confirmed.')
  if (!receipt.usable) throw new LocationFailure(409,'That device location has expired or changed. Choose it again.')
  response.json(receipt)
 })
 router.get('/:mode/:referenceId', async (request, response) => {
  const mode = SearchModeSchema.safeParse(request.params.mode), reference = z.uuid().transform(value => value.toLowerCase()).safeParse(request.params.referenceId)
  if (!mode.success || !reference.success || Object.keys(request.query ?? {}).length || !empty.safeParse(request.body === undefined ? {} : request.body).success) throw new LocationFailure(400,'Invalid location receipt request.')
  const call = actor(response).searchLocationReceipt
  const receipt = await read(call && (() => call(mode.data,reference.data)),SearchLocationReceiptSchema)
  if (receipt.mode!==mode.data || receipt.id!==reference.data) throw new LocationFailure(502,'Location receipt identity could not be confirmed.')
  response.json(receipt)
 })
  router.use((error: unknown,_request: Request,response: Response,next: NextFunction) => { void next; const failure=error instanceof LocationFailure || error instanceof MapLocationFailure?error:new LocationFailure(503,'Location resolution could not be confirmed. Check your current selection before retrying.');response.status(failure.status).json({error:failure.message}) })
 return router
}
