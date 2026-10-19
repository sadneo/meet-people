import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { DetailedSettingsSchema, SaveDetailedSettingsSchema, sameDetailedSettings } from '../shared/detailed-settings.js'
import type { UserContextTransport } from './matchmaking.js'

class SettingsFailure extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message) }
}
type Actor = ReturnType<UserContextTransport['actor']>
function unwrap(result: { data: unknown; error: { code?: string } | null }) {
  if (result.error) {
    const code = result.error.code ?? ''
    if (['PGRST301', 'PGRST302', 'PGRST303', '28000'].includes(code)) throw new SettingsFailure(401, 'auth', 'Your session has expired. Sign in again.')
    if (code === 'DS409') throw new SettingsFailure(409, 'conflict', 'Detailed settings changed. Reload before saving again.')
    if (['22023', '23514', '22P05', '22021'].includes(code)) throw new SettingsFailure(400, 'invalid', 'Invalid detailed settings. No changes were saved.')
    if (['PGRST202', '42883', '42P01', '42501', '25001'].includes(code)) throw new SettingsFailure(503, 'unavailable', 'Detailed settings are not available yet.')
    throw new SettingsFailure(503, 'provider', 'Detailed settings could not be confirmed. Reload before retrying.')
  }
  const parsed = DetailedSettingsSchema.safeParse(result.data)
  if (!parsed.success) throw new SettingsFailure(502, 'malformed', 'Detailed settings could not be confirmed. Reload before retrying.')
  return parsed.data
}
// Mounted after the existing verified-user middleware, never a service actor.
export function createDetailedSettingsRouter() {
  const router = Router()
  router.use((request, response, next) => {
    response.set('Cache-Control', 'no-store')
    if (!z.uuid().length(36).safeParse(response.locals.actorId).success || !response.locals.actor) return next(new SettingsFailure(401, 'auth', 'Sign in to access detailed settings.'))
    if (Object.keys(request.query ?? {}).length) return next(new SettingsFailure(400, 'invalid', 'Unexpected detailed settings request fields.'))
    next()
  })
  router.get('/', async (request, response) => {
    if (request.body !== undefined && !z.object({}).strict().safeParse(request.body).success) throw new SettingsFailure(400, 'invalid', 'Unexpected detailed settings request fields.')
    const actor = response.locals.actor as Actor
    if (!actor.detailedSettings) throw new SettingsFailure(503, 'unavailable', 'Detailed settings are not available yet.')
    response.json(unwrap(await actor.detailedSettings()))
  })
  router.put('/', async (request, response) => {
    const parsed = SaveDetailedSettingsSchema.safeParse(request.body)
    if (!parsed.success) throw new SettingsFailure(400, 'invalid', 'Invalid detailed settings. No changes were saved.')
    const actor = response.locals.actor as Actor
    if (!actor.saveDetailedSettings) throw new SettingsFailure(503, 'unavailable', 'Detailed settings are not available yet.')
    const saved = unwrap(await actor.saveDetailedSettings(parsed.data))
    if (saved.revision !== parsed.data.expectedRevision + 1 || !sameDetailedSettings(saved.settings, parsed.data.settings)) throw new SettingsFailure(502, 'malformed', 'Detailed settings could not be confirmed. Reload before retrying.')
    response.json(saved)
  })
  router.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
    void next
    const failure = error instanceof SettingsFailure ? error : new SettingsFailure(503, 'provider', 'Detailed settings could not be confirmed. Reload before retrying.')
    response.status(failure.status).json({ code: failure.code, error: failure.message })
  })
  return router
}
