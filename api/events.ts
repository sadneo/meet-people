import { Router } from 'express'
import type { Request, Response } from 'express'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { EventQuerySchema, EventSchema } from '../shared/events.js'

const uuid = z.string().uuid()
type ListingRow = Record<string, unknown> & { id: string; latitude: number | null; longitude: number | null }

export function distanceMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radians = (value: number) => value * Math.PI / 180
  const a = Math.sin(radians(lat2 - lat1) / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(radians(lon2 - lon1) / 2) ** 2
  return Math.round(3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a))) * 10) / 10
}

// Public reads are identical for every viewer, so a short cache absorbs repeat page views.
// Concurrent misses share one load; failed loads are dropped so the next request retries.
function ttlCache<T>(ttlMs: number, now: () => number, maxEntries = 500) {
  const entries = new Map<string, { expires: number; value: Promise<T> }>()
  return (key: string, load: () => Promise<T>) => {
    if (ttlMs <= 0) return load()
    const hit = entries.get(key)
    if (hit && hit.expires > now()) return hit.value
    entries.delete(key)
    if (entries.size >= maxEntries) entries.delete(entries.keys().next().value!)
    const value = load()
    entries.set(key, { expires: now() + ttlMs, value })
    value.catch(() => { if (entries.get(key)?.value === value) entries.delete(key) })
    return value
  }
}

export function createEventsRouter(client: SupabaseClient | null, { cacheMs = 60_000, now = Date.now }: { cacheMs?: number; now?: () => number } = {}) {
  const router = Router()
  const listCache = ttlCache<{ rows: ListingRow[]; categories: string[]; hasMore: boolean }>(cacheMs, now)
  const detailCache = ttlCache<ListingRow | null>(cacheMs, now)
  const cachePublicly = (response: Response) => {
    if (cacheMs > 0) response.set('Cache-Control', `public, max-age=${Math.round(cacheMs / 1000)}`)
  }
  router.use((_request, response, next) => {
    if (!client) { response.status(503).json({ error: 'Events service is not configured.' }); return }
    next()
  })
  // The database function applies the live-event filter and bounds every page.
  const live = (args: { category?: string; offset?: number; limit?: number; id?: string }) => client!.rpc('public_live_events', {
    p_category: args.category ?? null, p_offset: args.offset ?? 0, p_limit: args.limit ?? 1, p_id: args.id ?? null,
  })

  router.get('/', async (request, response) => {
    const parsed = EventQuerySchema.safeParse(request.query)
    if (!parsed.success) { response.status(400).json({ error: 'Invalid event filters.' }); return }
    const { category, page, limit, latitude, longitude } = parsed.data
    // Distance depends on the viewer, so it is computed after the shared lookup.
    const { rows, categories, hasMore } = await listCache(JSON.stringify([category ?? null, page, limit]), async () => {
      // Read one extra row to determine whether another page exists.
      const [list, categories] = await Promise.all([
        live({ category, offset: (page - 1) * limit, limit: limit + 1 }),
        client!.rpc('event_categories'),
      ])
      if (list.error) throw list.error
      if (categories.error) throw categories.error
      const found: ListingRow[] = list.data ?? []
      return { rows: found.slice(0, limit), categories: categories.data ?? [], hasMore: found.length > limit }
    })
    cachePublicly(response)
    response.json({
      events: rows.map(row => EventSchema.parse({ ...row,
        distance_miles: latitude !== undefined && longitude !== undefined && row.latitude != null && row.longitude != null
          ? distanceMiles(latitude, longitude, row.latitude, row.longitude) : null,
      })),
      categories, page, hasMore,
    })
  })
  router.get('/:id', async (request, response) => {
    const parsed = uuid.safeParse(request.params.id)
    if (!parsed.success) { response.status(400).json({ error: 'Invalid event ID.' }); return }
    const row = await detailCache(parsed.data, async () => {
      const { data, error } = await live({ id: parsed.data }).maybeSingle<ListingRow>()
      if (error) throw error
      return data
    })
    if (!row) { response.status(404).json({ error: 'This event is no longer available.' }); return }
    cachePublicly(response)
    response.json(EventSchema.parse({ ...row, distance_miles: null }))
  })
  router.use((error: unknown, _request: Request, response: Response, _next: (error?: unknown) => void) => {
    void _next
    console.error('Events request failed:', error)
    response.status(503).json({ error: 'Events are temporarily unavailable. Please try again.' })
  })
  return router
}
