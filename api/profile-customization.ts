import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { ProfileCustomizationSchema, ProfileShowcaseSchema, PublicProfilePromptsSchema, SaveProfileCustomizationSchema, sameCustomization } from '../shared/profile-customization.js'
import type { UserContextTransport } from './matchmaking.js'

class CustomizationFailure extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message) }
}
type Actor = ReturnType<UserContextTransport['actor']>
function unwrap(result: { data: unknown; error: { code?: string } | null }) {
  if (result.error) {
    const code = result.error.code ?? ''
    if (['PGRST301', 'PGRST302', 'PGRST303', '28000'].includes(code)) throw new CustomizationFailure(401, 'auth', 'Your session has expired. Sign in again.')
    if (code === 'PC409') throw new CustomizationFailure(409, 'conflict', 'Your profile changed. Reload before saving again.')
    if (code === 'PC404') throw new CustomizationFailure(404, 'not_found', 'This profile isn’t available.')
    if (['22023', '23514', '22P05', '22021'].includes(code)) throw new CustomizationFailure(400, 'invalid', 'Check your profile choices. No changes were saved.')
    if (['PGRST202', '42883', '42P01', '42501', '25001'].includes(code)) throw new CustomizationFailure(503, 'unavailable', 'Profile choices are not available yet.')
    throw new CustomizationFailure(503, 'provider', 'Profile choices could not be confirmed. Reload before retrying.')
  }
  return result.data
}
// Mounted ONLY after createMatchmakingRouter's verified-user middleware.
export function createProfileCustomizationRouter() {
  const router = Router()
  router.use((request, response, next) => {
    response.set('Cache-Control', 'no-store')
    if (!z.uuid().safeParse(response.locals.actorId).success || !response.locals.actor) return next(new CustomizationFailure(401, 'auth', 'Sign in to change your profile.'))
    if (Object.keys(request.query ?? {}).length) return next(new CustomizationFailure(400, 'invalid', 'Unexpected profile request fields.'))
    next()
  })
  router.get('/', async (request, response) => {
    if (request.body !== undefined && !z.object({}).strict().safeParse(request.body).success) throw new CustomizationFailure(400, 'invalid', 'Unexpected profile request fields.')
    const actor = response.locals.actor as Actor
    if (!actor.profileCustomization) throw new CustomizationFailure(503, 'unavailable', 'Profile choices are not available yet.')
    const parsed = ProfileCustomizationSchema.safeParse(unwrap(await actor.profileCustomization()))
    if (!parsed.success) throw new CustomizationFailure(502, 'malformed', 'Profile choices could not be confirmed. Reload before retrying.')
    response.json(parsed.data)
  })
  router.put('/', async (request, response) => {
    const parsed = SaveProfileCustomizationSchema.safeParse(request.body)
    if (!parsed.success) throw new CustomizationFailure(400, 'invalid', 'Check your profile choices. No changes were saved.')
    const actor = response.locals.actor as Actor
    if (!actor.saveProfileCustomization) throw new CustomizationFailure(503, 'unavailable', 'Profile choices are not available yet.')
    const saved = ProfileCustomizationSchema.safeParse(unwrap(await actor.saveProfileCustomization(parsed.data)))
    // A well-shaped but unrelated or stale snapshot is not a confirmed save.
    // A save that omits prompts or the Dating bio keeps what's stored; compare only what was sent.
    const sent = saved.success ? {
      ...parsed.data.customization,
      prompts: parsed.data.customization.prompts ?? saved.data.customization.prompts,
      datingBio: parsed.data.customization.datingBio === undefined ? saved.data.customization.datingBio : parsed.data.customization.datingBio,
    } : parsed.data.customization
    if (!saved.success || saved.data.revision !== parsed.data.expectedRevision + 1 || !sameCustomization(saved.data.customization, sent)) {
      throw new CustomizationFailure(502, 'malformed', 'Profile choices could not be confirmed. Reload before retrying.')
    }
    response.json(saved.data)
  })
  router.get('/:owner/prompts/:mode', async (request, response) => {
    const params = z.object({ owner: z.uuid(), mode: z.enum(['friends', 'dating']) }).safeParse(request.params)
    if (!params.success) throw new CustomizationFailure(400, 'invalid', 'Invalid profile reference.')
    const actor = response.locals.actor as Actor
    if (!actor.profilePrompts) throw new CustomizationFailure(503, 'unavailable', 'Profile prompts are not available yet.')
    const parsed = PublicProfilePromptsSchema.safeParse(unwrap(await actor.profilePrompts(params.data.owner, params.data.mode)))
    if (!parsed.success) throw new CustomizationFailure(502, 'malformed', 'Profile prompts could not be confirmed.')
    response.json({ prompts: parsed.data })
  })
  router.get('/:owner', async (request, response) => {
    const owner = z.uuid().safeParse(request.params.owner)
    if (!owner.success) throw new CustomizationFailure(400, 'invalid', 'Invalid profile reference.')
    const actor = response.locals.actor as Actor
    if (!actor.profileShowcase) throw new CustomizationFailure(503, 'unavailable', 'Profile choices are not available yet.')
    const parsed = ProfileShowcaseSchema.safeParse(unwrap(await actor.profileShowcase(owner.data)))
    if (!parsed.success) throw new CustomizationFailure(502, 'malformed', 'Profile choices could not be confirmed.')
    response.json(parsed.data)
  })
  router.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
    void next
    const failure = error instanceof CustomizationFailure ? error : new CustomizationFailure(503, 'provider', 'Profile choices could not be confirmed. Reload before retrying.')
    response.status(failure.status).json({ code: failure.code, error: failure.message })
  })
  return router
}
