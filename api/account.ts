import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'

// The typed word is checked on the server too, so a stray DELETE request cannot remove an account.
const DeleteAccountBody = z.object({ confirm: z.literal('DELETE') }).strict()

// Permanently deletes the signed-in user's own account (Google Play requires an in-app path).
// `client` must be the service-role client; it is only used to verify the caller's token and to
// remove that same user. Related rows are removed by the database's ON DELETE rules on auth.users.
export function createAccountRouter(client: Pick<SupabaseClient, 'auth'> | null) {
  const router = Router()
  router.use(rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts. Try again later.' },
  }))
  router.delete('/', async (request, response) => {
    response.set('Cache-Control', 'no-store')
    if (!client) { response.status(503).json({ error: 'Account deletion is not available right now.' }); return }
    const token = /^Bearer\s+(\S+)$/i.exec(request.header('authorization') ?? '')?.[1]
    if (!token) { response.status(401).json({ error: 'Sign in to delete your account.' }); return }
    if (!DeleteAccountBody.safeParse(request.body).success) { response.status(400).json({ error: 'Type DELETE to confirm.' }); return }

    const { data, error } = await client.auth.getUser(token)
    if (error || !data.user) { response.status(401).json({ error: 'Sign in again to delete your account.' }); return }

    const { error: deleteError } = await client.auth.admin.deleteUser(data.user.id)
    if (deleteError) {
      console.error('Account deletion failed', { userId: data.user.id, status: deleteError.status, code: deleteError.code })
      response.status(502).json({ error: 'Account deletion could not be confirmed. Check whether you can still sign in, or email support before trying again.' })
      return
    }
    response.status(204).end()
  })
  return router
}
