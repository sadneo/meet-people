import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { FriendsBatchRequestSchema, FriendsDiscoveryStatusSchema } from '../shared/friends-discovery.js'
import { MatchingScoringSettingsResponseSchema, SaveMatchingScoringSettingsSchema } from '../shared/matching-scoring.js'
import { ConnectionStateSchema } from '../shared/connections.js'
import { rankedFriendsBatch, FriendsEligibilityError, type FriendsScoringTransport } from './matching/friends-recommendations.js'
import type { UserContextTransport } from './matchmaking.js'

type Actor = ReturnType<UserContextTransport['actor']>
class Failure extends Error { constructor(readonly status: number, message: string, readonly code?: string) { super(message) } }
function unwrap(result: { data: unknown; error: { code?: string } | null }) {
  if (!result.error) return result.data
  const code = result.error.code ?? ''
  if (['28000', 'PGRST301', 'PGRST302', 'PGRST303'].includes(code)) throw new Failure(401, 'Sign in again to use Friends discovery.')
  if (['FR409', 'DA409'].includes(code)) throw new Failure(409, 'Friends settings or connection state changed. Reload before trying again.')
  if (code === 'CON04') throw new Failure(429, 'Daily request limit reached (10 per 24 hours). Try again later.', 'request_limit')
  if (['22023', '23514'].includes(code)) throw new Failure(400, 'Check Friends fields before trying again.')
  if (code === '42501') throw new Failure(403, 'This Friends connection is unavailable.')
  throw new Failure(503, 'Friends discovery could not be confirmed. Reload before retrying.')
}
function parsed<T>(schema: z.ZodType<T>, value: unknown) {
  const result = schema.safeParse(value)
  if (!result.success) throw new Failure(502, 'Friends response could not be confirmed.')
  return result.data
}
export function createFriendsDiscoveryRouter(scoring: FriendsScoringTransport | null) {
  const router = Router(), actor = (res: Response) => res.locals.actor as Actor
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store')
    if (!z.uuid().safeParse(res.locals.actorId).success || !res.locals.actor) return next(new Failure(401, 'Sign in to use Friends discovery.'))
    if (Object.keys(req.query ?? {}).length) return next(new Failure(400, 'Unexpected Friends request fields.'))
    if (!scoring) return next(new Failure(503, 'Friends discovery is not configured.'))
    next()
  })
  router.post('/recommendations', async (req, res) => {
    const input = FriendsBatchRequestSchema.safeParse(req.body)
    if (!input.success) throw new Failure(400, 'Use up to 200 distinct excluded profiles and a batch size of 1–10.')
    const project = actor(res).projectFriendsCandidates
    if (!project) throw new Failure(503, 'Friends discovery is not available yet.')
    res.json(await rankedFriendsBatch(scoring!, res.locals.actorId, input.data.excludedIds, input.data.limit, project))
  })
  router.get('/status', async (req, res) => {
    if (req.body !== undefined && !z.object({}).strict().safeParse(req.body).success) throw new Failure(400, 'Unexpected Friends fields.')
    const read = actor(res).friendsDiscoveryStatus
    if (!read) throw new Failure(503, 'Friends discovery setup is not available yet.')
    res.json(parsed(FriendsDiscoveryStatusSchema, unwrap(await read())))
  })
  router.get('/scoring-settings', async (req, res) => {
    if (req.body !== undefined && !z.object({}).strict().safeParse(req.body).success) throw new Failure(400, 'Unexpected Friends fields.')
    const read = actor(res).matchingScoringSettings
    if (!read) throw new Failure(503, 'Schedule settings are not available yet.')
    res.json(parsed(MatchingScoringSettingsResponseSchema, unwrap(await read())))
  })
  router.put('/scoring-settings', async (req, res) => {
    const input = SaveMatchingScoringSettingsSchema.safeParse(req.body)
    if (!input.success) throw new Failure(400, 'Choose a valid timezone, revision and visibility.')
    const save = actor(res).saveMatchingScoringSettings, read = actor(res).matchingScoringSettings
    if (!save || !read) throw new Failure(503, 'Schedule settings are not available yet.')
    const saved = parsed(MatchingScoringSettingsResponseSchema, unwrap(await save(input.data)))
    if (saved.revision !== input.data.expectedRevision + 1 || saved.timeZone !== input.data.timeZone || saved.showAvailability !== input.data.showAvailability) throw new Failure(502, 'Schedule save could not be confirmed. Reload before retrying.')
    try {
      const confirmed = parsed(MatchingScoringSettingsResponseSchema, unwrap(await read()))
      if (confirmed.revision !== saved.revision || confirmed.timeZone !== saved.timeZone || confirmed.showAvailability !== saved.showAvailability) throw new Error('Changed readback')
      res.json(confirmed)
    } catch { throw new Failure(503, 'Schedule settings may already be saved. Reload before retrying.') }
  })
  for (const action of ['request', 'accept'] as const) {
    router.post(action === 'request' ? '/requests/:target' : '/requests/:target/accept', async (req, res) => {
      const target = z.uuid().transform(value => value.toLowerCase()).safeParse(req.params.target)
      if (!target.success || target.data === res.locals.actorId || !z.object({}).strict().safeParse(req.body).success) throw new Failure(400, 'Choose another Friends profile without extra fields.')
      const write = actor(res).friendsDiscoveryConnection, read = actor(res).socialConnection
      if (!write || !read) throw new Failure(503, 'Friends requests are not available yet.')
      const saved = parsed(ConnectionStateSchema, unwrap(await write(target.data, action)))
      if (action === 'accept' ? saved.status !== 'connected' : !['sent', 'connected'].includes(saved.status)) throw new Failure(502, 'Friends request could not be confirmed.')
      try {
        const confirmed = parsed(ConnectionStateSchema, unwrap(await read(target.data, 'get')))
        if (confirmed.status !== saved.status || confirmed.conversationId !== saved.conversationId) throw new Error('Changed connection')
        res.json(confirmed)
      } catch { throw new Failure(503, 'Your Friends action may already be saved. Check Connections before retrying.') }
    })
  }
  router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    void _next
    const failure = error instanceof Failure ? error : error instanceof FriendsEligibilityError
      ? new Failure(409, error.message, 'friends_setup_required') : new Failure(503, 'Friends discovery could not be confirmed. Reload before retrying.')
    res.status(failure.status).json({ error: failure.message, ...(failure.code ? { code: failure.code } : {}) })
  })
  return router
}
