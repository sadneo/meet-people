import { Router, type Request, type Response, type NextFunction } from 'express'
import rateLimit from 'express-rate-limit'
import { GardenCommandSchema, GardenResponseSchema } from '../shared/garden.js'
import type { UserContextTransport } from './matchmaking.js'

export function createGardenRouter(transport: UserContextTransport | null) {
  const router = Router()
  router.use(rateLimit({ windowMs: 60000, limit: 120, standardHeaders: true, legacyHeaders: false, message: { error: 'Please wait a moment before another Garden action.' } }))
  router.use(async (req, res, next) => {
    res.set('Cache-Control', 'no-store')
    if (!transport) { res.status(503).json({ error: 'Account Gardens are not available yet.' }); return }
    const token = req.headers.authorization?.match(/^Bearer (\S{1,8192})$/i)?.[1]
    if (!token || !await transport.verify(token)) { res.status(401).json({ error: 'Sign in to open your Garden.' }); return }
    res.locals.actor = transport.actor(token)
    next()
  })
  const run = async (req: Request, res: Response) => {
    if (Object.keys(req.query).length) { res.status(400).json({error:'Unexpected Garden parameters.'}); return }
    const parsed = req.method === 'POST' ? GardenCommandSchema.safeParse(req.body) : null
    if (parsed && !parsed.success) { res.status(400).json({error:'Invalid Garden action.'}); return }
    const call = (res.locals.actor as ReturnType<UserContextTransport['actor']>).garden
    if (!call) { res.status(503).json({error:'Account Gardens are not available yet.'}); return }
    const result = await call(parsed?.success ? parsed.data : null)
    if (result.error) {
      const code = result.error.code
      const [status, error] = code === 'GR409' ? [409, 'Your Garden changed. Refresh it before trying again.']
        : code === 'GR400' || code === '22023' ? [400, 'This Garden action is not available. Check your balance and rewards.']
        : code === 'GR429' ? [429, 'Please wait a moment before another Garden action.']
        : code === '28000' || code === '42501' ? [403, 'Sign in with a confirmed account to use your Garden.']
        : [503, 'Could not confirm your Garden. Refresh before trying again.']
      res.status(status as number).json({error}); return
    }
    const data = GardenResponseSchema.safeParse(result.data)
    if (!data.success) { res.status(502).json({error:'Could not confirm your Garden. Refresh before trying again.'}); return }
    res.json(data.data)
  }
  router.get('/', run)
  router.post('/', run)
  router.use((_error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    void _next
    res.status(503).json({error:'Could not confirm your Garden. Refresh before trying again.'})
  })
  return router
}
