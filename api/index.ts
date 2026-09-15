import express from 'express'
import { HealthResponseSchema, HelloRequestSchema, HelloResponseSchema } from '../shared/schemas.js'

export const app = express()

app.use(express.json())

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
