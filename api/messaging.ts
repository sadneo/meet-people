import { Router } from 'express'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { ConversationIdSchema, ConversationsSchema, HistorySchema, MarkReadSchema, MessageSchema, MessagingActivitySchema, ReadStateSchema, SendMessageSchema } from '../shared/messaging.js'
import { expectedErrors, requireVerifiedUser } from './service-router.js'

const cursor = z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER)

const expected: Record<string, readonly [number, string]> = {
  MSG01: [404, 'Conversation not found.'],
  MSG02: [404, 'Group not found.'],
  MSG03: [403, 'You are not in this conversation.'],
  MSG04: [403, 'You are not in this group.'],
  // Same text whichever side blocked, so nobody learns they were blocked.
  MSG05: [403, 'You can’t send messages in this conversation.'],
  MSG06: [409, 'A group needs at least two people before it has a conversation.'],
  MSG07: [409, 'No one else is in this conversation.'],
  MSG08: [400, 'Invalid conversation page or cursor.'],
  MSG09: [400, 'Enter a message of 1–2000 characters.'],
  MSG10: [409, 'This request was already used for a different message.'],
  MSG11: [429, 'You’re sending messages too quickly. Wait a moment and try again.'],
  MSG12: [409, 'Direct conversations end when the connection ends.'],
}

export function createMessagingRouter(client: SupabaseClient | null) {
  const router = Router()
  router.use(requireVerifiedUser(client, { unconfigured: 'Messaging is not configured.', signIn: 'Sign in to open your messages.' }))
  router.param('id', (request, response, next, id) => {
    if (!z.string().uuid().safeParse(id).success) { response.status(400).json({ error: 'Invalid conversation ID.' }); return }
    next()
  })
  router.get('/', async (request, response) => {
    const query = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1) }).strict().safeParse(request.query)
    if (!query.success) { response.status(400).json({ error: 'Invalid conversation page.' }); return }
    const { data, error } = await client!.rpc('messaging_list_conversations', { p_user_id: response.locals.userId, p_page: query.data.page })
    if (error) throw error
    response.json(ConversationsSchema.parse(data))
  })
  // Unread conversations and incoming connection requests, for the navigation dot.
  router.get('/activity', async (_request, response) => {
    const { data, error } = await client!.rpc('messaging_activity', { p_user_id: response.locals.userId })
    if (error) throw error
    response.json(MessagingActivitySchema.parse(data))
  })
  router.post('/', async (request, response) => {
    // Direct chats open when a connection is accepted. Event groups are resolved
    // in SQL; a browser never chooses who is in a conversation.
    const parsed = z.object({ eventGroupId: z.string().uuid() }).strict().safeParse(request.body)
    if (!parsed.success) { response.status(400).json({ error: 'Provide a valid event group.' }); return }
    const { data, error } = await client!.rpc('messaging_ensure_event_conversation', { p_user_id: response.locals.userId, p_group_id: parsed.data.eventGroupId })
    if (error) throw error
    response.json(ConversationIdSchema.parse({ conversationId: data }))
  })
  router.get('/:id/messages', async (request, response) => {
    // `before` pages back through history; `after` polls for newer messages.
    const query = z.object({ before: cursor.min(1).optional(), after: cursor.optional() }).strict()
      .refine(value => value.before === undefined || value.after === undefined).safeParse(request.query)
    if (!query.success) { response.status(400).json({ error: 'Invalid message cursor.' }); return }
    const { data, error } = await client!.rpc('messaging_history', {
      p_user_id: response.locals.userId, p_conversation_id: request.params.id,
      p_before: query.data.before ?? null, p_after: query.data.after ?? null,
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
  router.post('/:id/read', async (request, response) => {
    const parsed = MarkReadSchema.safeParse(request.body)
    if (!parsed.success) { response.status(400).json({ error: 'Invalid message cursor.' }); return }
    const { data, error } = await client!.rpc('messaging_mark_read', { p_user_id: response.locals.userId, p_conversation_id: request.params.id, p_seq: parsed.data.seq })
    if (error) throw error
    response.json(ReadStateSchema.parse({ lastReadSeq: data }))
  })
  router.post('/:id/leave', async (request, response) => {
    if (!z.object({}).strict().safeParse(request.body ?? {}).success) { response.status(400).json({ error: 'Invalid request.' }); return }
    const { error } = await client!.rpc('messaging_leave', { p_user_id: response.locals.userId, p_conversation_id: request.params.id })
    if (error) throw error
    response.status(204).end()
  })
  router.use(expectedErrors(expected, 'Messaging', 'Messaging is temporarily unavailable. Please try again.'))
  return router
}
