import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { ConnectionListSchema, ConnectionStateSchema } from '../shared/connections.js'
import { ConversationsSchema, HistorySchema, MarkReadSchema, MessageSchema, MessagingActivitySchema, ReadStateSchema, SendMessageSchema } from '../shared/messaging.js'
import type { UserContextTransport } from './matchmaking.js'

type Actor = ReturnType<UserContextTransport['actor']>
class SocialFailure extends Error { constructor(readonly status: number, message: string) { super(message) } }
const empty = z.object({}).strict()
const uuid = z.uuid()
function body(request: Request) { if (!empty.safeParse(request.body === undefined ? {} : request.body).success) throw new SocialFailure(400, 'Unexpected request fields.') }
function query(request: Request, schema: z.ZodType) { const parsed = schema.safeParse(request.query); if (!parsed.success) throw new SocialFailure(400, 'Invalid request parameters.'); return parsed.data }
function id(value: unknown) { const parsed = uuid.safeParse(value); if (!parsed.success) throw new SocialFailure(400, 'Invalid account or conversation.'); return parsed.data }
async function result<T>(call: (() => PromiseLike<{ data: unknown; error: { code?: string } | null }>) | undefined, schema: z.ZodType<T>) {
  if (!call) throw new SocialFailure(503, 'This service is not available yet.')
  const response = await call()
  if (response.error) {
    const code = response.error.code
    if (['28000', 'PGRST301', 'PGRST302', 'PGRST303'].includes(code ?? '')) throw new SocialFailure(401, 'Sign in again to continue.')
    if (code === '42501') throw new SocialFailure(403, 'This conversation or connection is unavailable.')
    if (code === 'SC409') throw new SocialFailure(409, 'That message request was used for different content. Reload before retrying.')
    if (['22023', '23514', '22021', '22P05'].includes(code ?? '')) throw new SocialFailure(400, 'Check the request fields.')
    throw new SocialFailure(503, 'The operation could not be confirmed. Reload before retrying; changes may already be saved.')
  }
  const parsed = schema.safeParse(response.data)
  if (!parsed.success) throw new SocialFailure(502, 'The response could not be confirmed. Reload before retrying; changes may already be saved.')
  return parsed.data
}
const page = z.coerce.number().int().min(1).max(10000)
const cursor = z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)

/** Fixed actor RPCs only. UUID aliases preserve the existing frontend contract.
 * Event-group creation/leave stays unavailable until its lifecycle is approved.
 */
export function createSocialRouter(transport: UserContextTransport | null, kind: 'connections' | 'conversations') {
  const router = Router()
  router.use(async (request, response, next) => {
    response.set('Cache-Control', 'no-store')
    try {
      if (!transport) throw new SocialFailure(503, 'This service is not configured.')
      const token = request.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1]
      if (!token || token.length > 8192) throw new SocialFailure(401, 'Sign in to continue.')
      const user = await transport.verify(token)
      if (!user || !uuid.safeParse(user.id).success) throw new SocialFailure(401, 'Sign in to continue.')
      response.locals.actor = transport.actor(token)
      next()
    } catch (error) { next(error) }
  })
  const actor = (response: Response) => response.locals.actor as Actor
  const noQuery = (request: Request) => query(request, empty)
  if (kind === 'connections') {
    router.get('/', async (request, response) => { body(request); noQuery(request); response.json(await result(actor(response).socialConnectionList, ConnectionListSchema)) })
    const connection = (action: 'get' | 'request' | 'accept' | 'remove') => async (request: Request, response: Response) => {
      body(request); noQuery(request); const target = id(request.params.targetId), call = actor(response).socialConnection
      response.json(await result(call && (() => call(target, action)), ConnectionStateSchema))
    }
    router.get('/:targetId', connection('get')); router.post('/:targetId', connection('request'))
    router.post('/:targetId/accept', connection('accept')); router.delete('/:targetId', connection('remove'))
  } else {
    router.get('/activity', async (request, response) => { body(request); noQuery(request); response.json(await result(actor(response).socialActivity, MessagingActivitySchema)) })
    router.get('/', async (request, response) => {
      body(request); const values = query(request, z.object({ page: page.optional() }).strict()) as { page?: number }, call = actor(response).socialInbox
      response.json(await result(call && (() => call(values.page ?? 1)), ConversationsSchema))
    })
    router.get('/:conversationId/messages', async (request, response) => {
      body(request); const conversation = id(request.params.conversationId)
      const values = query(request, z.object({ before: cursor.optional(), after: cursor.optional() }).strict().refine(value => value.before === undefined || value.after === undefined)) as { before?: number; after?: number }
      const call = actor(response).socialHistory
      response.json(await result(call && (() => call(conversation, values.before ?? null, values.after ?? null)), HistorySchema))
    })
    router.post('/:conversationId/messages', async (request, response) => {
      noQuery(request); const conversation = id(request.params.conversationId), parsed = SendMessageSchema.safeParse(request.body)
      if (!parsed.success) throw new SocialFailure(400, 'Use a message of 1–2000 characters and a valid request ID.')
      const call = actor(response).socialSend
      response.json(await result(call && (() => call(conversation, parsed.data.body, parsed.data.clientRequestId)), MessageSchema))
    })
    router.post('/:conversationId/read', async (request, response) => {
      noQuery(request); const conversation = id(request.params.conversationId), parsed = MarkReadSchema.safeParse(request.body)
      if (!parsed.success || !Number.isSafeInteger(parsed.data.seq)) throw new SocialFailure(400, 'Invalid read position.')
      const call = actor(response).socialRead
      response.json(await result(call && (() => call(conversation, parsed.data.seq)), ReadStateSchema))
    })
    router.post('/', async () => { throw new SocialFailure(503, 'Event-group conversations are not available yet.') })
    router.post('/:conversationId/leave', async () => { throw new SocialFailure(503, 'Event-group conversation changes are not available yet.') })
  }
  router.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    const failure = error instanceof SocialFailure ? error : new SocialFailure(503, 'The operation could not be confirmed. Reload before retrying; changes may already be saved.')
    response.status(failure.status).json({ error: failure.message })
  })
  return router
}
