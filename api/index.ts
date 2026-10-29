import express from 'express'
import { createClient } from '@supabase/supabase-js'
import { env } from './env.js'
import { createEventsRouter } from './events.js'
import { createAuthRouter } from './auth.js'
import { createMatchmakingRouter, createUserContextTransport } from './matchmaking.js'
import { HealthResponseSchema, HelloRequestSchema, HelloResponseSchema } from '../shared/schemas.js'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { createSocialRouter } from './social.js'
import { boundedMatchingBodyError } from './matching-body-errors.js'
import { createDatingScoringTransport } from './matching/dating-recommendations.js'
import { createFriendsScoringTransport } from './matching/friends-recommendations.js'
import { createActiveFriendsWorker } from './matching/active-worker.js'

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
app.use('/api/auth', createAuthRouter(eventsClient))
const ownerTransport = env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY
  ? createUserContextTransport({ url: env.SUPABASE_URL, publicKey: env.SUPABASE_PUBLISHABLE_KEY, verificationKey: env.SUPABASE_SERVICE_ROLE_KEY })
  : null
if (env.DATING_RULES_ENABLED === 'true' && (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !ownerTransport)) {
  throw new Error('Dating rules require server scoring credentials and authenticated actor transport.')
}
const datingScoring = env.DATING_RULES_ENABLED === 'true'
  ? createDatingScoringTransport(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!)
  : null
if (env.FRIENDS_RULES_ENABLED === 'true' && (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !ownerTransport)) {
  throw new Error('Friends rules require server scoring credentials and authenticated actor transport.')
}
const friendsScoring = env.FRIENDS_RULES_ENABLED === 'true'
  ? createFriendsScoringTransport(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!)
  : null
if (env.ACTIVE_FRIENDS_ENABLED === 'true' && (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !ownerTransport)) {
  throw new Error('Active Friends requires server worker credentials and authenticated actor transport.')
}
const activeWorker = env.ACTIVE_FRIENDS_ENABLED === 'true'
  ? createActiveFriendsWorker(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!)
  : null
app.use('/api/matchmaking', boundedMatchingBodyError, createMatchmakingRouter(ownerTransport, datingScoring, friendsScoring, activeWorker))
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
