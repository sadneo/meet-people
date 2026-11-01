import { z } from 'zod'
export const RelationshipModeSchema = z.enum(['friends', 'dating'])
export const ConnectionRequestAllowanceSchema = z.object({
  limit: z.literal(10),
  used: z.number().int().nonnegative().safe(),
  remaining: z.number().int().min(0).max(10),
  availableAt: z.iso.datetime({ offset: true }).nullable(),
}).strict().refine(value => value.remaining === Math.max(0, value.limit - value.used)
  && (value.remaining === 0 ? value.availableAt !== null : value.availableAt === null))
export type ConnectionRequestAllowance = z.infer<typeof ConnectionRequestAllowanceSchema>

export const ConnectionStateSchema = z.object({
  status: z.enum(['none', 'sent', 'incoming', 'connected']),
  // The direct chat, once connected.
  conversationId: z.string().uuid().nullable(),
})
const PersonSchema = z.object({ id: z.string().uuid(), display_name: z.string(), avatar_url: z.string().nullable(), mode: RelationshipModeSchema.nullable().optional() })
export const ConnectionRequestSchema = PersonSchema.extend({ requested_at: z.string() })
export const ConnectionListSchema = z.object({
  incoming: z.array(ConnectionRequestSchema),
  sent: z.array(ConnectionRequestSchema),
  connected: z.array(PersonSchema.extend({ conversationId: z.string().uuid().nullable() })),
})
export type ConnectionState = z.infer<typeof ConnectionStateSchema>
export type ConnectionRequest = z.infer<typeof ConnectionRequestSchema>
