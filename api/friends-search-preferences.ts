import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { FriendsSearchPreferencesSchema, SaveFriendsSearchPreferencesSchema, sameFriendsPreferences } from '../shared/friends-search-preferences.js'
import type { UserContextTransport } from './matchmaking.js'

class PreferencesFailure extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message) }
}
type Actor = ReturnType<UserContextTransport['actor']>
function unwrap(result: { data: unknown; error: { code?: string } | null }) {
  if (result.error) {
    const code = result.error.code ?? ''
    if (['PGRST301', 'PGRST302', 'PGRST303', '28000'].includes(code)) throw new PreferencesFailure(401, 'auth', 'Your session has expired. Sign in again.')
    if (code === 'FP409') throw new PreferencesFailure(409, 'conflict', 'Friends preferences changed. Reload before saving again.')
    if (['22023', '23514', '22P05', '22021'].includes(code)) throw new PreferencesFailure(400, 'invalid', 'Invalid Friends preferences or location reference. No changes were saved.')
    if (['PGRST202', '42883', '42P01', '42501', '25001'].includes(code)) throw new PreferencesFailure(503, 'unavailable', 'Friends search preferences are not available yet.')
    throw new PreferencesFailure(503, 'provider', 'Friends preferences could not be confirmed. Reload before retrying.')
  }
  const parsed = FriendsSearchPreferencesSchema.safeParse(result.data)
  if (!parsed.success) throw new PreferencesFailure(502, 'malformed', 'Friends preferences could not be confirmed. Reload before retrying.')
  return parsed.data
}
// Shares the existing verified-user middleware and parser-error mounting.
export function createFriendsSearchPreferencesRouter() {
  const router = Router()
  router.use((request, response, next) => {
    response.set('Cache-Control', 'no-store')
    if (!z.uuid().length(36).safeParse(response.locals.actorId).success || !response.locals.actor) return next(new PreferencesFailure(401, 'auth', 'Sign in to access Friends preferences.'))
    if (Object.keys(request.query ?? {}).length) return next(new PreferencesFailure(400, 'invalid', 'Unexpected Friends preference request fields.'))
    next()
  })
  router.get('/', async (request, response) => {
    if (request.body !== undefined && !z.object({}).strict().safeParse(request.body).success) throw new PreferencesFailure(400, 'invalid', 'Unexpected Friends preference request fields.')
    const actor = response.locals.actor as Actor
    if (!actor.friendsSearchPreferences) throw new PreferencesFailure(503, 'unavailable', 'Friends search preferences are not available yet.')
    response.json(unwrap(await actor.friendsSearchPreferences()))
  })
  router.put('/', async (request, response) => {
    const parsed = SaveFriendsSearchPreferencesSchema.safeParse(request.body)
    if (!parsed.success) throw new PreferencesFailure(400, 'invalid', 'Invalid Friends preferences. No changes were saved.')
    const actor = response.locals.actor as Actor
    if (!actor.saveFriendsSearchPreferences) throw new PreferencesFailure(503, 'unavailable', 'Friends search preferences are not available yet.')
    const saved = unwrap(await actor.saveFriendsSearchPreferences(parsed.data))
    if (saved.revision !== parsed.data.expectedRevision + 1 || !saved.preferences || !sameFriendsPreferences(saved.preferences, parsed.data.preferences)) throw new PreferencesFailure(502, 'malformed', 'Friends preferences could not be confirmed. Reload before retrying.')
    response.json(saved)
  })
  router.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
    void next
    const failure = error instanceof PreferencesFailure ? error : new PreferencesFailure(503, 'provider', 'Friends preferences could not be confirmed. Reload before retrying.')
    response.status(failure.status).json({ code: failure.code, error: failure.message })
  })
  return router
}
