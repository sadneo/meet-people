import express from 'express'
import { createClient } from '@supabase/supabase-js'
import { env } from './env.js'
import { createConnectionsRouter } from './connections.js'
import { createEventsRouter } from './events.js'
import { createAuthRouter } from './auth.js'
import { createMatchmakingRouter, createUserContextTransport } from './matchmaking.js'
import { createMessagingRouter } from './messaging.js'
import { HealthResponseSchema, HelloRequestSchema, HelloResponseSchema } from '../shared/schemas.js'
import cors from 'cors'
import rateLimit from 'express-rate-limit'

export const app = express()
app.set('trust proxy', 1); 

app.use('/api', (_request, response, next) => {
  response.set('Cache-Control', 'private, no-store')
  next()
})
const allowedOrigins = new Set(['https://localhost', 'capacitor://localhost', ...(process.env.CORS_ORIGINS?.split(',') ?? [])])
app.use(cors({
  origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)),
  allowedHeaders: ['Authorization', 'Content-Type'],
  maxAge: 600,
}))

app.use(express.json())

const eventsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: { error: 'Too many requests from this IP, please try again later.' }
});

const eventsClient = env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null
app.use('/api/events', eventsLimiter, createEventsRouter(eventsClient))
app.use('/api/conversations', createMessagingRouter(eventsClient))
app.use('/api/connections', createConnectionsRouter(eventsClient))
app.use('/api/auth', createAuthRouter(eventsClient))
app.use('/api/matchmaking', createMatchmakingRouter(env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY
  ? createUserContextTransport({ url: env.SUPABASE_URL, publicKey: env.SUPABASE_PUBLISHABLE_KEY, verificationKey: env.SUPABASE_SERVICE_ROLE_KEY })
  : null))

app.get('/api/health', (_request, response) => {
  response.json(HealthResponseSchema.parse({ status: 'ok' }))
})

app.get('/api/hello', (request, response) => {
  const result = HelloRequestSchema.safeParse(request.query)

  if (!result.success) {
    response.status(400).json({ error: 'Invalid request.' })
    return
  }

  response.json(HelloResponseSchema.parse({ message: result.data.name ? `Hello ${result.data.name}!` : 'Hello world!' }))
})

// JSON parsing happens before the router. Keep parse/size errors bounded too.
app.use((error: unknown, request: express.Request, response: express.Response, next: express.NextFunction) => {
  if (request.path.startsWith('/api/auth/')) { response.set('Cache-Control', 'no-store').status(400).json({ error: 'Invalid sign-in request.' }); return }
  if (!request.path.startsWith('/api/matchmaking/')) { next(error); return }
  response.set('Cache-Control', 'no-store').status(400).json({ code: 'invalid', error: 'Invalid matching request body.' })
})
