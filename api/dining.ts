import { Router, type Request, type Response, type NextFunction } from 'express'
import type { SupabaseClient } from '@supabase/supabase-js'
import rateLimit from 'express-rate-limit'
import { DiningQuerySchema, DiningResponseSchema } from '../shared/dining.js'
import type { UserContextTransport } from './matchmaking.js'

// The storage table stays service-role-only. Browsers receive validated display
// fields through this authenticated read; ingestion secrets never leave the API.
export function createDiningRouter(client: SupabaseClient | null, transport: Pick<UserContextTransport, 'verify'> | null) {
  const router = Router()
  const unavailable = 'Food menus are unavailable. Try again in a moment.'
  router.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false, message: { error: 'Please wait a moment before refreshing menus.' } }))
  router.use(async (request, response, next) => {
    response.set('Cache-Control', 'private, no-store')
    if (!client || !transport) { response.status(503).json({ error: unavailable }); return }
    const token = request.headers.authorization?.match(/^Bearer (\S{1,8192})$/i)?.[1]
    if (!token || !await transport.verify(token)) { response.status(401).json({ error: 'Sign in to browse food menus.' }); return }
    next()
  })
  router.get('/', async (request, response) => {
    const query = DiningQuerySchema.safeParse(request.query)
    if (!query.success) { response.status(400).json({ error: 'Choose a valid menu date.' }); return }
    const { data, error } = await client!.from('dining_menus')
      .select('id,source,location_slug,location_name,menu_slug,menu_name,menu_date,source_url,items,notices,last_synced_at')
      .eq('menu_date', query.data.date)
      .order('location_name').order('menu_name').limit(501)
    // Never present a truncated day as a complete menu catalog.
    if (error || (data?.length ?? 0) > 500) { response.status(503).json({ error: unavailable }); return }
    const parsed = DiningResponseSchema.safeParse({ date: query.data.date, menus: data ?? [] })
    if (!parsed.success) { response.status(503).json({ error: unavailable }); return }
    response.json(parsed.data)
  })
  router.use((_error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    void _next
    response.status(503).json({ error: unavailable })
  })
  return router
}
