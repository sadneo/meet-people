import express from 'express'
import { createClient } from '@supabase/supabase-js'
import { env } from './env.js'
import { createEventsRouter } from './events.js'
import { HealthResponseSchema, HelloRequestSchema, HelloResponseSchema } from '../shared/schemas.js'

export const app = express()

app.use(express.json())
const eventsClient = env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null
app.use('/api/events', createEventsRouter(eventsClient))

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
