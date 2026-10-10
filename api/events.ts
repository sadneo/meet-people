import { Router } from 'express'
import type { Request, Response } from 'express'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { authenticate as verifySession } from './auth.js'
import { EventQuerySchema, EventSchema, EventCompanySchema } from '../shared/events.js'

const columns = 'id,title,description,category,starts_at,ends_at,location_name,address,city,image_url,source,source_url,status,latitude,longitude'
const uuid = z.string().uuid()

export function distanceMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radians = (value: number) => value * Math.PI / 180
  const a = Math.sin(radians(lat2 - lat1) / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(radians(lon2 - lon1) / 2) ** 2
  return Math.round(3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a))) * 10) / 10
}

export function createEventsRouter(client: SupabaseClient | null) {
  const router = Router()
  router.use((_request, response, next) => {
    if (!client) { response.status(503).json({ error: 'Events service is not configured.' }); return }
    next()
  })
  const live = () => client!.from('listings').select(columns)
    .eq('listing_type', 'event').in('status', ['active', 'rescheduled'])
    .or(`starts_at.gte.${new Date().toISOString()},ends_at.gte.${new Date().toISOString()}`)

  const authenticate = (request: Request, response: Response) =>
    verifySession(client!, request, response, 'Sign in to find company for this event.')
  async function findEvent(request: Request, response: Response) {
    const parsed = uuid.safeParse(request.params.id)
    if (!parsed.success) { response.status(400).json({ error: 'Invalid event ID.' }); return null }
    const { data, error } = await live().eq('id', parsed.data).maybeSingle()
    if (error) throw error
    if (!data) { response.status(404).json({ error: 'This event is no longer available.' }); return null }
    return data
  }

  router.get('/', async (request, response) => {
    const parsed = EventQuerySchema.safeParse(request.query)
    if (!parsed.success) { response.status(400).json({ error: 'Invalid event filters.' }); return }
    const { category, page, limit, latitude, longitude } = parsed.data
    let query = live().order('starts_at', { ascending: true }).order('id', { ascending: true })
    if (category) query = query.eq('category', category)
    // Read one extra row to determine whether another page exists.
    const [list, categories] = await Promise.all([
      query.range((page - 1) * limit, page * limit),
      client!.rpc('event_categories'),
    ])
    if (list.error) throw list.error
    if (categories.error) throw categories.error
    const rows = (list.data ?? []).slice(0, limit)
    const counts = await client!.rpc('event_interest_counts', { p_event_ids: rows.map(row => row.id) })
    if (counts.error) throw counts.error
    response.json({
      events: rows.map(row => EventSchema.parse({ ...row, interested_count: counts.data?.[row.id] ?? 0,
        distance_miles: latitude !== undefined && longitude !== undefined && row.latitude != null && row.longitude != null
          ? distanceMiles(latitude, longitude, row.latitude, row.longitude) : null,
      })),
      categories: categories.data ?? [], page, hasMore: (list.data?.length ?? 0) > limit,
    })
  })
  router.get('/:id', async (request, response) => {
    const row = await findEvent(request, response)
    if (row) {
      const counts = await client!.rpc('event_interest_counts', { p_event_ids: [row.id] })
      if (counts.error) throw counts.error
      response.json(EventSchema.parse({ ...row, distance_miles: null, interested_count: counts.data?.[row.id] ?? 0 }))
    }
  })
  router.get('/:id/company', async (request, response) => {
    const user = await authenticate(request, response)
    if (!user || !await findEvent(request, response)) return
    const { data, error } = await client!.rpc('event_company_snapshot', { p_event_id: request.params.id, p_user_id: user.id })
    if (error) throw error
    response.json(EventCompanySchema.parse(data))
  })
  router.post('/:id/company', async (request, response) => {
    const action = z.object({ action: z.enum(['interest', 'uninterest', 'join', 'leave']), name: z.string().trim().min(1).max(80).optional() }).strict().safeParse(request.body)
    if (!action.success || !uuid.safeParse(request.params.id).success) { response.status(400).json({ error: 'Invalid event action.' }); return }
    const user = await authenticate(request, response)
    if (!user) return
    const metadataName: unknown = user.user_metadata?.display_name ?? user.user_metadata?.name
    const name = action.data.name ?? (typeof metadataName === 'string' && metadataName.trim() ? metadataName.trim().slice(0, 80) : 'Student')
    const { error } = await client!.rpc('event_company_action', { p_event_id: request.params.id, p_user_id: user.id, p_name: name, p_action: action.data.action })
    if (error?.code === 'P0002') { response.status(404).json({ error: 'This event is no longer available.' }); return }
    if (error) throw error
    const snapshot = await client!.rpc('event_company_snapshot', { p_event_id: request.params.id, p_user_id: user.id })
    if (snapshot.error) throw snapshot.error
    response.json(EventCompanySchema.parse(snapshot.data))
  })
  router.use((error: unknown, _request: Request, response: Response, _next: (error?: unknown) => void) => {
    void _next
    console.error('Events request failed:', error)
    response.status(503).json({ error: 'Events are temporarily unavailable. Please try again.' })
  })
  return router
}
