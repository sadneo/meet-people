import { Router } from 'express'
import type { Request, Response } from 'express'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { EventQuerySchema, EventSchema } from '../shared/events.js'

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
  router.get('/', async (request, response) => {
    const parsed = EventQuerySchema.safeParse(request.query)
    if (!parsed.success) { response.status(400).json({ error: 'Invalid event filters.' }); return }
    const { category, page, limit, latitude, longitude } = parsed.data
    // Read one extra row to determine whether another page exists.
    const [list, categories] = await Promise.all([
      client!.rpc('public_live_events', { p_category: category ?? null, p_offset: (page - 1) * limit, p_limit: limit + 1 }),
      client!.rpc('event_categories'),
    ])
    if (list.error) throw list.error
    if (categories.error) throw categories.error
    const rows = (list.data ?? []).slice(0, limit)
    response.json({
      events: rows.map((row: { latitude: number | null; longitude: number | null }) => EventSchema.parse({ ...row,
        distance_miles: latitude !== undefined && longitude !== undefined && row.latitude != null && row.longitude != null
          ? distanceMiles(latitude, longitude, row.latitude, row.longitude) : null,
      })),
      categories: categories.data ?? [], page, hasMore: (list.data?.length ?? 0) > limit,
    })
  })
  router.get('/:id', async (request, response) => {
    const parsed = uuid.safeParse(request.params.id)
    if (!parsed.success) { response.status(400).json({ error: 'Invalid event ID.' }); return }
    const { data, error } = await client!.rpc('public_live_events', { p_id: parsed.data, p_limit: 1 }).maybeSingle()
    if (error) throw error
    if (!data) { response.status(404).json({ error: 'This event is no longer available.' }); return }
    response.json(EventSchema.parse({ ...data, distance_miles: null }))
  })
  router.use((error: unknown, _request: Request, response: Response, _next: (error?: unknown) => void) => {
    void _next
    console.error('Events request failed:', error)
    response.status(503).json({ error: 'Events are temporarily unavailable. Please try again.' })
  })
  return router
}
