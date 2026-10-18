import { z } from 'zod'

export const ConnectionStateSchema = z.object({
  status: z.enum(['none', 'sent', 'incoming', 'connected']),
  // The direct chat, once connected.
  conversationId: z.string().uuid().nullable(),
})
const PersonSchema = z.object({ id: z.string().uuid(), display_name: z.string(), avatar_url: z.string().nullable() })
export const ConnectionRequestSchema = PersonSchema.extend({ requested_at: z.string() })
export const ConnectionListSchema = z.object({
  incoming: z.array(ConnectionRequestSchema),
  sent: z.array(ConnectionRequestSchema),
  connected: z.array(PersonSchema.extend({ conversationId: z.string().uuid().nullable() })),
})
export type ConnectionState = z.infer<typeof ConnectionStateSchema>
export type ConnectionRequest = z.infer<typeof ConnectionRequestSchema>
