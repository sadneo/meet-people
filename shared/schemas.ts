import { z } from 'zod'

export const HelloResponseSchema = z.object({
  message: z.string(),
})

export const HelloRequestSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
})

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
})

export type HelloResponse = z.infer<typeof HelloResponseSchema>
