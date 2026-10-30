import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { ActiveQueueInputSchema, ActiveRequestSchema, ActiveSmallerRosterSchema, ActiveReadySchema, ActiveRenameSchema, ActiveStatusSchema, ActiveGroupsSchema, ActiveGroupSchema, ActiveHistorySchema, type ActiveCommand } from '../shared/active-friends.js'
import { SendMessageSchema, MessageSchema, MarkReadSchema, ReadStateSchema } from '../shared/messaging.js'
import { runActiveFriendsCycle, type ActiveFriendsWorker } from './matching/active-worker.js'
import type { UserContextTransport } from './matchmaking.js'
type Actor = ReturnType<UserContextTransport['actor']>
type Rpc = { data: unknown; error: { code?: string } | null }
class Failure extends Error { constructor(readonly status: number, message: string) { super(message) } }
const empty = z.object({}).strict(), id = z.uuid().transform(value => value.toLowerCase())
function parse<T>(schema: z.ZodType<T>, value: unknown, status = 400): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new Failure(status, status === 400 ? 'Check active matching fields.' : 'Active matching response could not be confirmed.')
  return result.data
}
async function result<T>(call: (() => PromiseLike<Rpc>) | undefined, schema: z.ZodType<T>): Promise<T> {
  if (!call) throw new Failure(503, 'Active Friends matching is not available yet.')
  const response = await call()
  if (response.error) {
    const code = response.error.code ?? ''
    if (['28000', 'PGRST301', 'PGRST302', 'PGRST303'].includes(code)) throw new Failure(401, 'Sign in again to continue.')
    if (code === '42501') throw new Failure(403, 'This group or proposal is unavailable.')
    if (code === 'AF409') throw new Failure(409, 'The queue or roster changed. Reload and review before trying again.')
    if (code === 'AF503') throw new Failure(503, 'Active Friends matching is paused.')
    if (['22023', '23514', '22P02'].includes(code)) throw new Failure(400, 'Check active matching fields.')
    throw new Failure(503, 'The operation could not be confirmed. Reload before retrying; changes may already be saved.')
  }
  return parse(schema, response.data, 502)
}
export function createActiveFriendsRouter(worker: ActiveFriendsWorker | null) {
  const router = Router(), actor = (res: Response) => res.locals.actor as Actor
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store')
    if (!id.safeParse(res.locals.actorId).success || !res.locals.actor) return next(new Failure(401, 'Sign in to find a group.'))
    const path = req.path ?? req.url.split('?')[0]
    const startsMatching = req.method === 'POST' && (path === '/queue' || path === '/check' || /\/proposals\/[^/]+\/(accept|smaller)$/.test(path) || path.endsWith('/ready') && req.body?.ready !== false)
    if (!worker && startsMatching) return next(new Failure(503, 'Active Friends matching is not configured.'))
    if (!path.endsWith('/messages') && Object.keys(req.query ?? {}).length) return next(new Failure(400, 'Unexpected matching query fields.'))
    next()
  })
  async function status(res: Response) {
    const snapshot = await result(actor(res).activeFriendsStatus, ActiveStatusSchema)
    return { ...snapshot, enabled: !!worker && snapshot.enabled }
  }
  async function command(res: Response, value: ActiveCommand) {
    const call = actor(res).activeFriendsCommand
    const saved = await result(call && (() => call(value)), ActiveStatusSchema)
    if (saved.state === 'queued' && ['join', 'ready'].includes(value.action)) {
      await runActiveFriendsCycle(worker)
      return status(res)
    }
    return { ...saved, enabled: !!worker && saved.enabled }
  }
  router.get('/status', async (req, res) => { parse(empty, req.body ?? {}); res.json(await status(res)) })
  router.post('/check', async (req, res) => { parse(empty, req.body); await runActiveFriendsCycle(worker); res.json(await status(res)) })
  router.post('/queue', async (req, res) => {
    const { requestId, ...data } = parse(ActiveQueueInputSchema, req.body)
    res.json(await command(res, { action: 'join', requestId, data }))
  })
  router.delete('/queue', async (req, res) => {
    const { requestId } = parse(ActiveRequestSchema, req.body)
    res.json(await command(res, { action: 'cancel', requestId, data: {} }))
  })
  for (const action of ['accept', 'decline', 'smaller'] as const) router.post(`/proposals/:proposalId/${action}`, async (req, res) => {
    const proposalId = parse(id, req.params.proposalId)
    const input = action === 'smaller' ? parse(ActiveSmallerRosterSchema, req.body) : parse(ActiveRequestSchema, req.body)
    res.json(await command(res, { action, requestId: input.requestId, data: { proposalId, ...('memberIds' in input ? { memberIds: input.memberIds } : {}) } }))
  })
  router.get('/groups', async (req, res) => { parse(empty, req.body ?? {}); res.json(await result(actor(res).activeFriendsGroups, ActiveGroupsSchema)) })
  router.get('/groups/:groupId', async (req, res) => {
    parse(empty, req.body ?? {}); const group = parse(id, req.params.groupId), call = actor(res).activeFriendsGroup
    res.json(await result(call && (() => call(group)), ActiveGroupSchema))
  })
  for (const action of ['ready', 'cancel-growth', 'leave', 'rename'] as const) router.post(`/groups/:groupId/${action}`, async (req, res) => {
    const groupId = parse(id, req.params.groupId)
    const input = action === 'ready' ? parse(ActiveReadySchema, req.body) : action === 'rename' ? parse(ActiveRenameSchema, req.body) : parse(ActiveRequestSchema, req.body)
    res.json(await command(res, { action, requestId: input.requestId, data: { groupId, ...('ready' in input ? { ready: input.ready } : {}), ...('name' in input ? { name: input.name } : {}) } }))
  })
  router.get('/groups/:groupId/messages', async (req, res) => {
    parse(empty, req.body ?? {}); const group = parse(id, req.params.groupId)
    const values = parse(z.object({ before: z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional() }).strict(), req.query ?? {})
    const call = actor(res).activeFriendsHistory
    res.json(await result(call && (() => call(group, values.before ?? null)), ActiveHistorySchema))
  })
  router.post('/groups/:groupId/messages', async (req, res) => {
    parse(empty, req.query ?? {}); const group = parse(id, req.params.groupId), value = parse(SendMessageSchema, req.body), call = actor(res).activeFriendsSend
    res.json(await result(call && (() => call(group, value.body, value.clientRequestId)), MessageSchema))
  })
  router.post('/groups/:groupId/read', async (req, res) => {
    const group = parse(id, req.params.groupId), value = parse(MarkReadSchema, req.body), call = actor(res).activeFriendsRead
    if (!Number.isSafeInteger(value.seq)) throw new Failure(400, 'Invalid read position.')
    res.json(await result(call && (() => call(group, value.seq)), ReadStateSchema))
  })
  router.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    void next
    const failure = error instanceof Failure ? error : new Failure(503, 'The operation could not be confirmed. Reload before retrying; changes may already be saved.')
    res.status(failure.status).json({ error: failure.message })
  })
  return router
}
