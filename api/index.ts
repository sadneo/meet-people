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
// Trust exactly the proxies in front of Cloud Run so clients cannot choose their own
// rate-limit address. Locally nothing sits in front, so trust none.
app.set('trust proxy', env.TRUST_PROXY_HOPS ?? (env.NODE_ENV === 'production' ? 1 : 0))

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

// A per-IP ceiling for every API route. Signed-in writes also have per-user limits in the
// database (messages, connection requests), which hold across instances and restarts.
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  skip: request => request.path === '/health',
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
}))

// Each event page view makes about two requests; repeat views are served from cache.
const eventsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Limit each IP to 300 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: { error: 'Too many requests from this IP, please try again later.' }
});

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } }
const serviceClient = env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, clientOptions)
  : null
// Event reads only call public_live_events and event_categories, which are service-only so
// every request passes the limiter and cache above.
app.use('/api/events', eventsLimiter, createEventsRouter(serviceClient))
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
    if (!serviceClient) throw new Error('Service not configured')
    const { data, error } = await serviceClient.rpc('auth_email_exists', { email_in: parsed.data.email })
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

// Temporary: set LOG_CLIENT_IP=1 to log how the proxies report a caller, then choose
// TRUST_PROXY_HOPS. This logs IP addresses, so turn it off once measured.
if (env.LOG_CLIENT_IP) {
  app.get('/api/health', (request, _response, next) => {
    console.log('Client address check:', JSON.stringify({ ip: request.ip, forwardedFor: request.headers['x-forwarded-for'] ?? null, socket: request.socket.remoteAddress ?? null }))
    next()
  })
}

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
