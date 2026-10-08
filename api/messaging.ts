import { Router, type Request, type Response } from 'express'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { ConversationIdSchema, ConversationsSchema, HistorySchema, MessageSchema, SendMessageSchema } from '../shared/messaging.js'

// Trusted server integration only. Call AFTER the matching owner verifies mutual
// acceptance. IDs are auth.users IDs, never prototype names or client claims.
export async function ensureConversationForParticipants(client: SupabaseClient, participantIds: string[]) {
  const ids = z.array(z.string().uuid()).min(2).max(5).parse(participantIds)
  const { data, error } = await client.rpc('messaging_ensure_conversation', { p_participant_ids: ids })
  if (error) throw error
  return ConversationIdSchema.parse({ conversationId: data })
}

export function createMessagingRouter(client: SupabaseClient | null) {
  const router = Router()
  router.use(async (request, response, next) => {
    if (!client) { response.status(503).json({ error: 'Messaging is not configured.' }); return }
    const token = request.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1]
    if (!token) { response.status(401).json({ error: 'Sign in to open your messages.' }); return }
    const { data, error } = await client.auth.getUser(token)
    if (error || !data.user) { response.status(401).json({ error: 'Your session has expired. Sign in again.' }); return }
    response.locals.userId = data.user.id
    next()
  })
  router.get('/', async (request, response) => {
    const query = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1) }).strict().safeParse(request.query)
    if (!query.success) { response.status(400).json({ error: 'Invalid conversation page.' }); return }
    const { data, error } = await client!.rpc('messaging_list_conversations', { p_user_id: response.locals.userId, p_page: query.data.page })
    if (error) throw error
    response.json(ConversationsSchema.parse(data))
  })
  router.post('/', async (request, response) => {
    // An event group is the only verified matching source currently in this repo.
    // Resolve its participants in SQL; never let a browser add arbitrary users.
    const parsed = z.object({ eventGroupId: z.string().uuid() }).strict().safeParse(request.body)
    if (!parsed.success) { response.status(400).json({ error: 'Provide a valid event group.' }); return }
    const { data, error } = await client!.rpc('messaging_ensure_event_conversation', { p_user_id: response.locals.userId, p_group_id: parsed.data.eventGroupId })
    if (error) throw error
    response.json(ConversationIdSchema.parse({ conversationId: data }))
  })
  router.use('/:id/messages', (request, response, next) => {
    if (!z.string().uuid().safeParse(request.params.id).success) { response.status(400).json({ error: 'Invalid conversation ID.' }); return }
    next()
  })
  router.get('/:id/messages', async (request, response) => {
    const query = z.object({ before: z.string().uuid().optional() }).strict().safeParse(request.query)
    if (!query.success) { response.status(400).json({ error: 'Invalid message cursor.' }); return }
    const { data, error } = await client!.rpc('messaging_history', {
      p_user_id: response.locals.userId, p_conversation_id: request.params.id, p_before: query.data.before ?? null,
    })
    if (error) throw error
    response.json(HistorySchema.parse(data))
  })
  router.post('/:id/messages', async (request, response) => {
    const parsed = SendMessageSchema.safeParse(request.body)
    if (!parsed.success) { response.status(400).json({ error: 'Enter a message of 1–2000 characters and a valid request ID.' }); return }
    const { data, error } = await client!.rpc('messaging_send', {
      p_user_id: response.locals.userId, p_conversation_id: request.params.id,
      p_body: parsed.data.body, p_request_id: parsed.data.clientRequestId,
    })
    if (error) throw error
    response.json(MessageSchema.parse(data))
  })
  router.use((error: unknown, _request: Request, response: Response, _next: (error?: unknown) => void) => {
    void _next
    const code = error && typeof error === 'object' && 'code' in error ? error.code : null
    const known = code === 'P0002' ? [404, 'Conversation or group not found.'] as const
      : code === '42501' ? [403, 'You are not a participant in this conversation or group.'] as const
        : code === '22023' ? [400, 'This conversation request is not valid. A group needs at least two people.'] as const : null
    if (known) { response.status(known[0]).json({ error: known[1] }); return }
    // Do not forward database details or credentials to clients or logs.
    response.status(503).json({ error: 'Messaging is temporarily unavailable. Please try again.' })
  })
  return router
}
