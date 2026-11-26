import { Router, type NextFunction, type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import sharp from 'sharp'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'

// Usage dashboard API.
//
//   POST /api/usage/heartbeat      signed-in app, every ~30s while visible
//   POST /api/usage/profile-open   signed-in app, when a profile card is opened
//   GET  /api/usage/summary        PUBLIC: aggregate totals only, nothing per-user
//   GET  /api/usage/admin/users    ADMIN: per-user table (allowlisted account IDs)
//   GET  /api/usage/admin/photo/:id ADMIN: 96px thumbnail of an uploaded photo
//
// `client` must be the service-role client; every database function used here
// is granted to service_role only.

const Count = z.number().int().nonnegative()
export const PublicSummarySchema = z.object({
  generatedAt: z.string(),
  totalUsers: Count,
  onlineNow: Count,
  activeToday: Count,
  active7d: Count,
  active30d: Count,
  minutesTotal: Count,
  profileOpensTotal: Count,
  messagesTotal: Count,
  messages24h: Count,
  messages7d: Count,
  series: z.array(z.object({ day: z.string(), activeUsers: Count, minutes: Count, profileOpens: Count })).max(31),
})
export const AdminUserSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  joinedAt: z.string(),
  lastSeen: z.string().nullable(),
  online: z.boolean(),
  minutesUsed: Count,
  daysActive: Count,
  profileOpens: Count,
  messagesSent: Count,
  messagesReceived: Count,
  hasUploadedPhoto: z.boolean(),
})
const AdminUsersSchema = z.array(AdminUserSchema)

const bearer = (request: Request) => /^Bearer\s+(\S+)$/i.exec(request.header('authorization') ?? '')?.[1]

// Short-lived memo so a 30-second heartbeat does not become a Supabase auth
// call every 30 seconds per user. Only used for telemetry, never for admin.
function createTokenMemo(ttlMs = 60_000, max = 5000) {
  const seen = new Map<string, { id: string; expires: number }>()
  return {
    get(token: string) {
      const hit = seen.get(token)
      if (!hit) return null
      if (hit.expires < Date.now()) { seen.delete(token); return null }
      return hit.id
    },
    set(token: string, id: string) {
      if (seen.size >= max) seen.delete(seen.keys().next().value as string)
      seen.set(token, { id, expires: Date.now() + ttlMs })
    },
  }
}

function cached<T>(ttlMs: number, load: () => Promise<T>) {
  let value: { at: number; data: T } | null = null
  let pending: Promise<T> | null = null
  return async () => {
    if (value && Date.now() - value.at < ttlMs) return value.data
    pending ??= load().then(data => { value = { at: Date.now(), data }; return data }).finally(() => { pending = null })
    return pending
  }
}

export function createUsageRouter(client: SupabaseClient | null, adminIds: string[]) {
  const router = Router()
  const admins = new Set(adminIds.map(id => id.toLowerCase()))
  const memo = createTokenMemo()

  const unavailable = (response: Response) => response.status(503).json({ error: 'Usage tracking is not available right now.' })

  // Verifies the caller's Supabase token and stores the user ID on the response.
  const signedIn = (fresh: boolean) => async (request: Request, response: Response, next: NextFunction) => {
    response.set('Cache-Control', 'no-store')
    if (!client) { unavailable(response); return }
    const token = bearer(request)
    if (!token) { response.status(401).json({ error: 'Sign in required.' }); return }
    try {
      let id = fresh ? null : memo.get(token)
      if (!id) {
        const { data, error } = await client.auth.getUser(token)
        if (error || !data.user) { response.status(401).json({ error: 'Sign in again.' }); return }
        const verified: string = data.user.id
        id = verified
        if (!fresh) memo.set(token, verified)
      }
      response.locals.userId = id
      next()
    } catch { response.status(503).json({ error: 'Could not verify your session. Try again.' }) }
  }

  const adminOnly = async (request: Request, response: Response, next: NextFunction) => {
    await signedIn(true)(request, response, () => {
      const id = String(response.locals.userId ?? '').toLowerCase()
      // Fail closed: with no allowlist configured nobody is an admin.
      if (!admins.size || !admins.has(id)) { response.status(403).json({ error: 'This account does not have dashboard access.' }); return }
      next()
    })
  }

  const perUser = (limit: number, windowMs: number) => rateLimit({
    windowMs, limit, standardHeaders: true, legacyHeaders: false,
    keyGenerator: (_request, response) => String(response.locals.userId ?? 'anonymous'),
    message: { error: 'Too many requests. Slow down.' },
  })

  router.post('/heartbeat', signedIn(false), perUser(12, 60_000), async (_request, response) => {
    try {
      const { error } = await client!.rpc('usage_heartbeat', { actor_in: response.locals.userId })
      if (error) throw error
      response.status(204).end()
    } catch { response.status(503).json({ error: 'Not recorded.' }) }
  })

  router.post('/profile-open', signedIn(false), perUser(300, 60 * 60_000), async (_request, response) => {
    try {
      const { error } = await client!.rpc('usage_profile_open', { actor_in: response.locals.userId })
      if (error) throw error
      response.status(204).end()
    } catch { response.status(503).json({ error: 'Not recorded.' }) }
  })

  const loadSummary = cached(30_000, async () => {
    if (!client) throw new Error('unavailable')
    const { data, error } = await client.rpc('usage_public_summary')
    if (error) throw error
    return PublicSummarySchema.parse(data)
  })
  router.get('/summary',
    rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests.' } }),
    async (_request, response) => {
      response.set('Cache-Control', 'no-store')
      if (!client) { unavailable(response); return }
      try { response.json(await loadSummary()) } catch { unavailable(response) }
    })

  const loadUsers = cached(15_000, async () => {
    if (!client) throw new Error('unavailable')
    const { data, error } = await client.rpc('usage_admin_users')
    if (error) throw error
    return AdminUsersSchema.parse(data)
  })
  router.get('/admin/users', adminOnly, perUser(60, 60_000), async (_request, response) => {
    try { response.json({ users: await loadUsers() }) } catch { unavailable(response) }
  })

  router.get('/admin/photo/:id', adminOnly, perUser(600, 60_000), async (request, response) => {
    const id = z.uuid().safeParse(request.params.id)
    if (!id.success) { response.status(400).json({ error: 'Invalid user.' }); return }
    try {
      const { data, error } = await client!.rpc('usage_admin_photo', { owner_in: id.data })
      if (error) throw error
      if (typeof data !== 'string' || !data) { response.status(404).json({ error: 'No photo.' }); return }
      const thumbnail = await sharp(Buffer.from(data, 'base64'), { limitInputPixels: 16_000_000, failOn: 'error' })
        .timeout({ seconds: 5 }).autoOrient().resize(96, 96, { fit: 'cover' }).jpeg({ quality: 70 }).toBuffer()
      response.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' }).send(thumbnail)
    } catch { response.status(503).json({ error: 'Photo unavailable.' }) }
  })

  return router
}
