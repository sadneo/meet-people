import express from 'express'
import { createClient } from '@supabase/supabase-js'
import { env } from './env.js'
import { createEventsRouter } from './events.js'
import { createMatchmakingRouter, createUserContextTransport } from './matchmaking.js'
import { HealthResponseSchema, HelloRequestSchema, HelloResponseSchema } from '../shared/schemas.js'
import cors from 'cors'
import { boundedMatchingBodyError } from './matching-body-errors.js'

export const app = express()

const allowedOrigins = new Set(['https://localhost', 'capacitor://localhost', ...(process.env.CORS_ORIGINS?.split(',') ?? [])])
app.use(cors({
  origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)),
  allowedHeaders: ['Authorization', 'Content-Type'],
  maxAge: 600,
}))

app.use(express.json())
const eventsClient = env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null
app.use('/api/events', createEventsRouter(eventsClient))
app.use('/api/matchmaking', boundedMatchingBodyError, createMatchmakingRouter(env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY
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
