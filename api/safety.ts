import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { SafetyIdSchema, OwnerBlockStateSchema, OwnerBlocklistSchema, SubmitSafetyReportSchema, SafetyReportReceiptSchema } from '../shared/safety.js'
import type { UserContextTransport } from './matchmaking.js'

class SafetyFailure extends Error { constructor(readonly status: number, readonly code: string, message: string) { super(message) } }
type Actor = ReturnType<UserContextTransport['actor']>
type Result = { data: unknown; error: { code?: string } | null }
function unwrap<T>(result: Result, schema: z.ZodType<T>): T {
  if (result.error) {
    const code = result.error.code ?? ''
    if (['28000', 'PGRST301', 'PGRST302', 'PGRST303'].includes(code)) throw new SafetyFailure(401, 'auth', 'Sign in again to access safety preferences.')
    if (['22023', '23514', '23503', '22P05', '22021'].includes(code)) throw new SafetyFailure(400, 'invalid', 'Invalid safety request. No change was saved.')
    if (code === 'SR409') throw new SafetyFailure(409, 'conflict', 'That report request ID was used for different content.')
    if (code === 'SR429') throw new SafetyFailure(429, 'rate_limited', 'Report intake limit reached. Try again later with the same request ID.')
    if (code === 'PT404') throw new SafetyFailure(404, 'not_found', 'No report receipt exists for this owner request.')
    if (['PT503', 'PGRST202', '42883', '42P01', '42501', '25001'].includes(code)) throw new SafetyFailure(503, 'unavailable', 'Safety operations are not available yet.')
    throw new SafetyFailure(503, 'provider', 'Safety request could not be confirmed. Read current state before retrying.')
  }
  const parsed = schema.safeParse(result.data)
  if (!parsed.success) throw new SafetyFailure(502, 'malformed', 'Safety response could not be confirmed. Read current state before retrying.')
  return parsed.data
}
const emptyBody = z.object({}).strict()
function noBody(request: Request) {
  if (!emptyBody.safeParse(request.body === undefined ? {} : request.body).success) throw new SafetyFailure(400, 'invalid', 'Unexpected safety request fields.')
}
function id(value: unknown, actorId?: string) {
  const parsed = SafetyIdSchema.safeParse(value)
  if (!parsed.success || parsed.data === actorId?.toLowerCase()) throw new SafetyFailure(400, 'invalid', 'Use a valid other-account target or request ID.')
  return parsed.data
}
async function reconcile<T>(read: () => PromiseLike<Result>, schema: z.ZodType<T>, matches: (value: T) => boolean): Promise<T> {
  try {
    const current = unwrap(await read(), schema)
    if (!matches(current)) throw new Error('Changed readback')
    return current
  } catch {
    throw new SafetyFailure(503, 'provider', 'Safety change could not be confirmed. Changes may already be saved. Read current state before retrying; do not automatically repeat mutations.')
  }
}
// Verified owner middleware is provided by matchmaking. No UI adapter is wired:
// contact-mutation containment is not completed all-surface blocking.
export function createSafetyRouter() {
  const router = Router()
  router.use((request, response, next) => {
    response.set('Cache-Control', 'no-store')
    if (!SafetyIdSchema.safeParse(response.locals.actorId).success || !response.locals.actor) return next(new SafetyFailure(401, 'auth', 'Sign in to use owner safety operations.'))
    if (Object.keys(request.query ?? {}).length) return next(new SafetyFailure(400, 'invalid', 'Unexpected safety query fields.'))
    next()
  })
  router.get('/blocks', async (request, response) => {
    noBody(request)
    const actor = response.locals.actor as Actor
    if (!actor.ownerBlocklist) throw new SafetyFailure(503, 'unavailable', 'Owner blocklist is unavailable.')
    response.json(unwrap(await actor.ownerBlocklist(), OwnerBlocklistSchema))
  })
  router.get('/blocks/:targetId', async (request, response) => {
    noBody(request)
    const target = id(request.params.targetId, response.locals.actorId), actor = response.locals.actor as Actor
    if (!actor.ownerBlockState) throw new SafetyFailure(503, 'unavailable', 'Owner block state is unavailable.')
    const current = unwrap(await actor.ownerBlockState(target), OwnerBlockStateSchema)
    if (current.targetId !== target) throw new SafetyFailure(502, 'malformed', 'Owner block target could not be confirmed.')
    response.json(current)
  })
  const mutate = (blocked: boolean) => async (request: Request, response: Response) => {
    noBody(request)
    const target = id(request.params.targetId, response.locals.actorId), actor = response.locals.actor as Actor
    const write = blocked ? actor.blockOwnerTarget : actor.unblockOwnerTarget, read = actor.ownerBlockState
    if (!write || !read) throw new SafetyFailure(503, 'unavailable', 'Owner safety mutation is unavailable.')
    const saved = unwrap(await write(target), OwnerBlockStateSchema)
    if (saved.targetId !== target || saved.outgoingBlocked !== blocked) throw new SafetyFailure(502, 'malformed', 'Owner block change could not be confirmed. Read current state.')
    response.json(await reconcile(() => read(target), OwnerBlockStateSchema, current => current.targetId === target && current.outgoingBlocked === blocked))
  }
  router.put('/blocks/:targetId', mutate(true)); router.delete('/blocks/:targetId', mutate(false))
  router.post('/reports', async (request, response) => {
    const parsed = SubmitSafetyReportSchema.safeParse(request.body)
    if (!parsed.success || parsed.data.targetId === String(response.locals.actorId).toLowerCase()) throw new SafetyFailure(400, 'invalid', 'Invalid report request. No report was saved.')
    const actor = response.locals.actor as Actor, write = actor.submitSafetyReport, read = actor.ownerSafetyReport
    if (!write || !read) throw new SafetyFailure(503, 'unavailable', 'Report intake is unavailable.')
    const receipt = unwrap(await write(parsed.data), SafetyReportReceiptSchema)
    if (receipt.requestId !== parsed.data.requestId || receipt.targetId !== parsed.data.targetId) throw new SafetyFailure(502, 'malformed', 'Report receipt could not be confirmed. Look up the request before retrying.')
    response.json(await reconcile(() => read(parsed.data.requestId), SafetyReportReceiptSchema, current => current.id === receipt.id && current.requestId === receipt.requestId && current.targetId === receipt.targetId && current.receivedAt === receipt.receivedAt))
  })
  router.get('/reports/:requestId', async (request, response) => {
    noBody(request)
    const requestId = id(request.params.requestId), actor = response.locals.actor as Actor
    if (!actor.ownerSafetyReport) throw new SafetyFailure(503, 'unavailable', 'Report receipt lookup is unavailable.')
    const receipt = unwrap(await actor.ownerSafetyReport(requestId), SafetyReportReceiptSchema)
    if (receipt.requestId !== requestId) throw new SafetyFailure(502, 'malformed', 'Report request could not be confirmed.')
    response.json(receipt)
  })
  router.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
    void next
    const failure = error instanceof SafetyFailure ? error : new SafetyFailure(503, 'provider', 'Safety request could not be confirmed. Read current state before retrying.')
    response.status(failure.status).json({ code: failure.code, error: failure.message })
  })
  return router
}
