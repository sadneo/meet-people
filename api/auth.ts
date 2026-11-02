import { Router } from 'express'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

const emailRequest = z.object({ email: z.string().trim().max(254).email() }).strict()

export function createAuthRouter(client: SupabaseClient | null, emailRequestsPerWindow = 10) {
  if (!Number.isInteger(emailRequestsPerWindow) || emailRequestsPerWindow < 1 || emailRequestsPerWindow > 300) throw new Error('Invalid email-check request limit')
  const router = Router()
  // ponytail: single-process limits; use shared edge limits before adding API replicas.
  const attempts = new Map<string, number>()
  let windowEnds = 0, total = 0
  router.use((request, response, next) => {
    response.set('Cache-Control', 'no-store')
    const now = Date.now()
    if (now >= windowEnds) { attempts.clear(); total = 0; windowEnds = now + 10 * 60_000 }
    const ip = request.socket.remoteAddress ?? 'unknown', count = attempts.get(ip) ?? 0
    if (count >= emailRequestsPerWindow || total >= 1000) {
      response.set('Retry-After', String(Math.ceil((windowEnds - now) / 1000))).status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' })
      return
    }
    attempts.set(ip, count + 1); total++
    if (request.headers['sec-fetch-site'] === 'cross-site' || !request.is('application/json')) {
      response.status(403).json({ error: 'Please continue from the Pebble sign-in page.' }); return
    }
    next()
  })
  router.post('/email', async (request, response) => {
    const parsed = emailRequest.safeParse(request.body)
    if (!parsed.success) { response.status(400).json({ error: 'Enter a valid email address.' }); return }
    if (!client) { response.status(503).json({ error: 'Email sign-in is temporarily unavailable. Please try again.' }); return }
    try {
      const { data, error } = await client.rpc('auth_email_exists', { email_in: parsed.data.email.toLowerCase() }).abortSignal(AbortSignal.timeout(8000))
      if (error || typeof data !== 'boolean') throw new Error('Lookup unavailable')
      response.json({ exists: data })
    } catch { response.status(503).json({ error: 'Email sign-in is temporarily unavailable. Please try again.' }) }
  })
  return router
}
