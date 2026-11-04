import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'

const DeviceBody = z.object({ token: z.string().min(20).max(4096), platform: z.literal('android').default('android') }).strict()
const RemoveBody = z.object({ token: z.string().min(20).max(4096) }).strict()

// Registers / removes the signed-in user's push token. `client` is the service-role client:
// it verifies the caller's token and writes public.push_devices (clients have no table access).
export function createPushRouter(client: Pick<SupabaseClient, 'auth' | 'from'> | null) {
  const router = Router()
  router.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests. Try again later.' } }))

  async function caller(authorization: string | undefined) {
    const token = /^Bearer\s+(\S+)$/i.exec(authorization ?? '')?.[1]
    if (!token || !client) return null
    const { data, error } = await client.auth.getUser(token)
    return error || !data.user ? null : data.user.id
  }

  router.post('/devices', async (request, response) => {
    response.set('Cache-Control', 'no-store')
    if (!client) { response.status(503).json({ error: 'Notifications are not available right now.' }); return }
    const userId = await caller(request.header('authorization'))
    if (!userId) { response.status(401).json({ error: 'Sign in to enable notifications.' }); return }
    const body = DeviceBody.safeParse(request.body)
    if (!body.success) { response.status(400).json({ error: 'Invalid device registration.' }); return }
    // A token belongs to one account at a time: signing in as someone else on this phone moves it.
    const { error } = await client.from('push_devices').upsert(
      { token: body.data.token, user_id: userId, platform: body.data.platform, last_seen_at: new Date().toISOString() },
      { onConflict: 'token' })
    if (error) { console.error('Push device save failed', { code: error.code }); response.status(502).json({ error: 'Could not enable notifications. Try again.' }); return }
    response.status(204).end()
  })

  router.delete('/devices', async (request, response) => {
    response.set('Cache-Control', 'no-store')
    if (!client) { response.status(503).json({ error: 'Notifications are not available right now.' }); return }
    const userId = await caller(request.header('authorization'))
    if (!userId) { response.status(401).json({ error: 'Sign in again.' }); return }
    const body = RemoveBody.safeParse(request.body)
    if (!body.success) { response.status(400).json({ error: 'Invalid device.' }); return }
    // Only the owner can remove a token.
    const { error } = await client.from('push_devices').delete().eq('token', body.data.token).eq('user_id', userId)
    if (error) { console.error('Push device removal failed', { code: error.code }); response.status(502).json({ error: 'Could not update notifications. Try again.' }); return }
    response.status(204).end()
  })

  return router
}
