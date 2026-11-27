import { Router, type NextFunction, type Request, type Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { UserContextTransport } from './matchmaking.js'
import { rankEventPicks } from './matching/event-picks-scoring.js'

export interface EventPoolTransport {
  pool(actorId: string, conversationId: string): Promise<unknown>
}
export class ConversationUnavailableError extends Error {
  constructor() { super('This conversation is unavailable.') }
}
class PicksFailure extends Error { constructor(readonly status: number, message: string) { super(message) } }

export function createEventPoolTransport(url: string, serviceKey: string): EventPoolTransport {
  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  return {
    async pool(actorId, conversationId) {
      const { data, error } = await client.rpc('get_conversation_event_pool', {
        actor_in: z.uuid().parse(actorId), conversation_in: z.uuid().parse(conversationId),
      }).abortSignal(AbortSignal.timeout(5000)).retry(false)
      if (error?.code === '42501') throw new ConversationUnavailableError()
      if (error) throw new Error('Event pool unavailable')
      return data
    },
  }
}

const uuid = z.uuid()

/** Event picks for one direct conversation, for its signed-in participant only. */
export function createEventPicksRouter(auth: Pick<UserContextTransport, 'verify'> | null, events: EventPoolTransport | null, now = () => new Date()) {
  const router = Router()
  router.get('/:conversationId', async (request: Request, response: Response, next: NextFunction) => {
    response.set('Cache-Control', 'no-store')
    try {
      if (!auth || !events) throw new PicksFailure(503, 'Event ideas are not available yet.')
      if (Object.keys(request.query).length) throw new PicksFailure(400, 'Invalid request parameters.')
      const token = request.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1]
      if (!token || token.length > 8192) throw new PicksFailure(401, 'Sign in to continue.')
      const user = await auth.verify(token)
      if (!user || !uuid.safeParse(user.id).success) throw new PicksFailure(401, 'Sign in to continue.')
      const conversation = uuid.safeParse(request.params.conversationId)
      if (!conversation.success) throw new PicksFailure(400, 'Invalid conversation.')
      let pool: unknown
      try { pool = await events.pool(user.id, conversation.data) }
      catch (error) {
        if (error instanceof ConversationUnavailableError) throw new PicksFailure(403, error.message)
        throw error
      }
      response.json(rankEventPicks(pool, now()))
    } catch (error) { next(error) }
  })
  router.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    void _next
    if (!(error instanceof PicksFailure)) console.error('Event picks failed:', error instanceof Error ? error.message : 'unknown error')
    const failure = error instanceof PicksFailure ? error : new PicksFailure(503, 'Event ideas are temporarily unavailable.')
    response.status(failure.status).json({ error: failure.message })
  })
  return router
}
