import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { DatingAggregateSchema, SaveDatingAggregateSchema, sameDatingProfile, sameDatingSearch } from '../shared/dating.js'
import type { UserContextTransport } from './matchmaking.js'

class DatingFailure extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message) }
}
type Actor = ReturnType<UserContextTransport['actor']>
function unwrap(result: { data: unknown; error: { code?: string } | null }) {
  if (result.error) {
    const code = result.error.code ?? ''
    if (['PGRST301', 'PGRST302', 'PGRST303', '28000'].includes(code)) throw new DatingFailure(401, 'auth', 'Your session has expired. Sign in again.')
    if (code === 'DA409') throw new DatingFailure(409, 'conflict', 'Dating preferences changed. Reload the whole aggregate before saving.')
    if (code === 'LC409') throw new DatingFailure(400, 'invalid', 'Your search location expired or changed. Choose it again; no changes were saved.')
    if (['22023', '23514', '22P05', '22021'].includes(code)) throw new DatingFailure(400, 'invalid', 'Invalid Dating draft or eligibility. No changes were saved.')
    if (['PGRST202', '42883', '42P01', '42501', '25001'].includes(code)) throw new DatingFailure(503, 'unavailable', 'Dating preferences are not available yet.')
    throw new DatingFailure(503, 'provider', 'Dating save/read could not be confirmed. Reload before retrying.')
  }
  const parsed = DatingAggregateSchema.safeParse(result.data)
  if (!parsed.success) throw new DatingFailure(502, 'malformed', 'Dating preferences could not be confirmed. Reload before retrying.')
  return parsed.data
}
// Owner-only aggregate. This route does not expose candidates, public identity,
// queue admission or matching. Only mounted behind verified-user middleware.
export function createDatingRouter() {
  const router = Router()
  router.use((request, response, next) => {
    response.set('Cache-Control', 'no-store')
    if (!z.uuid().length(36).safeParse(response.locals.actorId).success || !response.locals.actor) return next(new DatingFailure(401, 'auth', 'Sign in to access Dating preferences.'))
    if (Object.keys(request.query ?? {}).length) return next(new DatingFailure(400, 'invalid', 'Unexpected Dating request fields.'))
    next()
  })
  router.get('/', async (request, response) => {
    if (request.body !== undefined && !z.object({}).strict().safeParse(request.body).success) throw new DatingFailure(400, 'invalid', 'Unexpected Dating request fields.')
    const actor = response.locals.actor as Actor
    if (!actor.datingAggregate) throw new DatingFailure(503, 'unavailable', 'Dating preferences are not available yet.')
    response.json(unwrap(await actor.datingAggregate()))
  })
  router.put('/', async (request, response) => {
    const parsed = SaveDatingAggregateSchema.safeParse(request.body)
    if (!parsed.success) throw new DatingFailure(400, 'invalid', 'Invalid Dating aggregate. No changes were saved.')
    const actor = response.locals.actor as Actor
    if (!actor.saveDatingAggregate || !actor.datingAggregate) throw new DatingFailure(503, 'unavailable', 'Dating preferences are not available yet.')
    const saved = unwrap(await actor.saveDatingAggregate(parsed.data))
    if (saved.profileRevision !== parsed.data.expectedProfileRevision + 1 || saved.searchRevision !== parsed.data.expectedSearchRevision + 1 || !sameDatingProfile(saved.profile, parsed.data.profile) || !sameDatingSearch(saved.search, parsed.data.search)) throw new DatingFailure(502, 'malformed', 'Dating save could not be confirmed. Reload before retrying.')
    // One atomic RPC writes both domains. A separate canonical owner GET must
    // agree; no compensation/partial-success response or automatic write retry.
    try {
      const confirmed = unwrap(await actor.datingAggregate())
      if (confirmed.profileRevision !== saved.profileRevision || confirmed.searchRevision !== saved.searchRevision || !sameDatingProfile(confirmed.profile, saved.profile) || !sameDatingSearch(confirmed.search, saved.search)) throw new DatingFailure(502, 'malformed', 'Dating readback changed.')
      response.json(confirmed)
    } catch (failure) {
      // The atomic write returned successfully. Even an auth/input/dependency
      // error from this subsequent GET cannot establish that nothing was saved.
      const malformed = failure instanceof DatingFailure && failure.code === 'malformed'
      throw new DatingFailure(malformed ? 502 : 503, malformed ? 'malformed' : 'provider', 'Dating readback could not be confirmed. Changes may already be saved. Sign in if needed, then reload the whole aggregate before retrying.')
    }
  })
  router.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
    void next
    const failure = error instanceof DatingFailure ? error : new DatingFailure(503, 'provider', 'Dating save/read could not be confirmed. Reload before retrying.')
    response.status(failure.status).json({ code: failure.code, error: failure.message })
  })
  return router
}
