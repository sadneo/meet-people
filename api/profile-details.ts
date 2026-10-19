import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { ProfileDetailsSchema, SaveProfileDetailsSchema } from '../shared/profile-details.js'
import type { UserContextTransport } from './matchmaking.js'

class DetailsFailure extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message) }
}
type Actor = ReturnType<UserContextTransport['actor']>
function unwrap(result: { data: unknown; error: { code?: string } | null }) {
  if (result.error) {
    const code = result.error.code ?? ''
    if (['PGRST301', 'PGRST302', 'PGRST303', '28000'].includes(code)) throw new DetailsFailure(401, 'auth', 'Your session has expired. Sign in again.')
    if (code === 'PD409') throw new DetailsFailure(409, 'conflict', 'Profile details changed. Reload before saving again.')
    if (['22023', '23514', '22P05', '22021'].includes(code)) throw new DetailsFailure(400, 'invalid', 'Invalid profile details. No changes were saved.')
    if (['PGRST202', '42883', '42P01', '42501', '25001'].includes(code)) throw new DetailsFailure(503, 'unavailable', 'Profile details are not available yet.')
    throw new DetailsFailure(503, 'provider', 'Profile details could not be confirmed. Reload before retrying.')
  }
  const parsed = ProfileDetailsSchema.safeParse(result.data)
  if (!parsed.success) throw new DetailsFailure(502, 'malformed', 'Profile details could not be confirmed. Reload before retrying.')
  return parsed.data
}
// Mounted ONLY after createMatchmakingRouter's verified-user middleware.
export function createProfileDetailsRouter() {
  const router = Router()
  router.use((request, response, next) => {
    response.set('Cache-Control', 'no-store')
    if (!z.uuid().safeParse(response.locals.actorId).success || !response.locals.actor) return next(new DetailsFailure(401, 'auth', 'Sign in to access profile details.'))
    if (Object.keys(request.query ?? {}).length) return next(new DetailsFailure(400, 'invalid', 'Unexpected profile details request fields.'))
    next()
  })
  router.get('/', async (request, response) => {
    if (request.body !== undefined && !z.object({}).strict().safeParse(request.body).success) throw new DetailsFailure(400, 'invalid', 'Unexpected profile details request fields.')
    const actor = response.locals.actor as Actor
    if (!actor.profileDetails) throw new DetailsFailure(503, 'unavailable', 'Profile details are not available yet.')
    response.json(unwrap(await actor.profileDetails()))
  })
  router.put('/', async (request, response) => {
    const parsed = SaveProfileDetailsSchema.safeParse(request.body)
    if (!parsed.success) throw new DetailsFailure(400, 'invalid', 'Invalid profile details. No changes were saved.')
    const actor = response.locals.actor as Actor
    if (!actor.saveProfileDetails) throw new DetailsFailure(503, 'unavailable', 'Profile details are not available yet.')
    const saved = unwrap(await actor.saveProfileDetails(parsed.data))
    // A well-shaped but unrelated/stale snapshot is not successful readback.
    const expected = parsed.data.facts
    if (saved.revision !== parsed.data.expectedRevision + 1 || saved.facts.education !== expected.education || saved.facts.occupation !== expected.occupation ||
      saved.facts.languages.length !== expected.languages.length || saved.facts.languages.some((value, index) => value !== expected.languages[index]) ||
      saved.facts.visibility.education !== expected.visibility.education || saved.facts.visibility.occupation !== expected.visibility.occupation || saved.facts.visibility.languages !== expected.visibility.languages) {
      throw new DetailsFailure(502, 'malformed', 'Profile details could not be confirmed. Reload before retrying.')
    }
    response.json(saved)
  })
  router.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
    void next
    const failure = error instanceof DetailsFailure ? error : new DetailsFailure(503, 'provider', 'Profile details could not be confirmed. Reload before retrying.')
    response.status(failure.status).json({ code: failure.code, error: failure.message })
  })
  return router
}
