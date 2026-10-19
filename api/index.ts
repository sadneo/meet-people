import express from 'express'
import { createClient } from '@supabase/supabase-js'
import { env } from './env.js'
import { createEventsRouter } from './events.js'
import { createMatchmakingRouter, createUserContextTransport } from './matchmaking.js'
import { HealthResponseSchema, HelloRequestSchema, HelloResponseSchema } from '../shared/schemas.js'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { createSocialRouter } from './social.js'
import { boundedMatchingBodyError } from './matching-body-errors.js'
import { z } from 'zod'

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
const emailLookupSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254) })
app.post('/api/auth/email', rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Please try again later.' },
}), async (request, response) => {
  const parsed = emailLookupSchema.safeParse(request.body)
  if (!parsed.success) { response.status(400).json({ error: 'Invalid email address.' }); return }
  try {
    if (!eventsClient) throw new Error('Service not configured')
    const { data, error } = await eventsClient.rpc('auth_email_exists', { email_in: parsed.data.email })
      .abortSignal(AbortSignal.timeout(5000))
    if (error || typeof data !== 'boolean') throw new Error('Email lookup failed')
    response.json({ exists: data })
  } catch {
    response.status(503).json({ error: 'Email sign-in is temporarily unavailable. Please try again.' })
  }
})
const ownerTransport = env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY
  ? createUserContextTransport({ url: env.SUPABASE_URL, publicKey: env.SUPABASE_PUBLISHABLE_KEY, verificationKey: env.SUPABASE_SERVICE_ROLE_KEY })
  : null
app.use('/api/matchmaking', boundedMatchingBodyError, createMatchmakingRouter(ownerTransport))
app.use('/api/connections', boundedMatchingBodyError, createSocialRouter(ownerTransport, 'connections'))
app.use('/api/conversations', boundedMatchingBodyError, createSocialRouter(ownerTransport, 'conversations'))

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
