import { Router } from 'express'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { ConnectionListSchema, ConnectionStateSchema } from '../shared/connections.js'
import { expectedErrors, requireVerifiedUser } from './service-router.js'

const expected: Record<string, readonly [number, string]> = {
  CON01: [400, 'You can’t connect with yourself.'],
  // Same text for a block and a missing profile, so nobody learns they were blocked.
  CON02: [404, 'This person isn’t available.'],
  CON03: [409, 'There’s no request from this person to accept.'],
  CON04: [429, 'You’ve sent a lot of requests today. Try again tomorrow.'],
  CON05: [409, 'Set up your matching profile before connecting with people.'],
}

// Every write goes through narrow SQL functions; browsers cannot write connections.
// Routes are keyed by the other person's user ID.
export function createConnectionsRouter(client: SupabaseClient | null) {
  const router = Router()
  router.use(requireVerifiedUser(client, { unconfigured: 'Connections are not configured.', signIn: 'Sign in to connect with people.' }))
  router.param('userId', (_request, response, next, id) => {
    if (!z.string().uuid().safeParse(id).success) { response.status(400).json({ error: 'Invalid person.' }); return }
    next()
  })
  const empty = (body: unknown) => z.object({}).strict().safeParse(body ?? {}).success
  async function call(name: string, args: Record<string, unknown>) {
    const { data, error } = await client!.rpc(name, args)
    if (error) throw error
    return data
  }
  router.get('/', async (_request, response) => {
    response.json(ConnectionListSchema.parse(await call('connection_list', { p_user_id: response.locals.userId })))
  })
  router.get('/:userId', async (request, response) => {
    response.json(ConnectionStateSchema.parse(await call('connection_state', { p_user_id: response.locals.userId, p_other_id: request.params.userId })))
  })
  // Sends a request, or accepts if this person already asked.
  router.post('/:userId', async (request, response) => {
    if (!empty(request.body)) { response.status(400).json({ error: 'Invalid request.' }); return }
    response.json(ConnectionStateSchema.parse(await call('connection_request', { p_user_id: response.locals.userId, p_other_id: request.params.userId })))
  })
  router.post('/:userId/accept', async (request, response) => {
    if (!empty(request.body)) { response.status(400).json({ error: 'Invalid request.' }); return }
    response.json(ConnectionStateSchema.parse(await call('connection_accept', { p_user_id: response.locals.userId, p_other_id: request.params.userId })))
  })
  // Declines, cancels or disconnects; disconnecting closes the direct chat.
  router.delete('/:userId', async (request, response) => {
    response.json(ConnectionStateSchema.parse(await call('connection_remove', { p_user_id: response.locals.userId, p_other_id: request.params.userId })))
  })
  router.use(expectedErrors(expected, 'Connections', 'Connections are temporarily unavailable. Please try again.'))
  return router
}
