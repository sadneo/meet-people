import { z } from 'zod'
import { MessageSchema, ParticipantSchema } from './messaging.js'
const id = z.uuid().transform(value => value.toLowerCase())
export const ActiveQueueInputSchema = z.object({
  requestId: id, preferredNewFriends: z.number().int().min(1).max(8),
  minimumGroupSize: z.number().int().min(2).max(9).default(2),
  maximumGroupSize: z.number().int().min(2).max(9).optional(),
  allowExistingGroups: z.boolean().default(false),
}).strict().transform(value => ({ ...value, maximumGroupSize: value.maximumGroupSize ?? value.preferredNewFriends + 1 }))
  .refine(value => value.minimumGroupSize <= value.preferredNewFriends + 1 && value.maximumGroupSize >= value.preferredNewFriends + 1)
export const ActiveRequestSchema = z.object({ requestId: id }).strict()
export const ActiveSmallerRosterSchema = ActiveRequestSchema.extend({ memberIds: z.array(id).min(2).max(9).refine(values => new Set(values).size === values.length) }).strict()
export const ActiveReadySchema = ActiveRequestSchema.extend({ ready: z.boolean() }).strict()
export const ActiveRenameSchema = ActiveRequestSchema.extend({ name: z.string().trim().min(1).max(80) }).strict()
const member = z.object({ id, name: z.string().max(120), age: z.number().int().min(18).max(99), response: z.enum(['pending', 'accepted']), avatar: z.string().nullable() }).strict()
export const ActiveProposalSchema = z.object({
  id, expiresAt: z.iso.datetime({ offset: true }), groupId: id.nullable(),
  members: z.array(member).min(2).max(9).refine(values => new Set(values.map(item => item.id)).size === values.length),
  meetingArea: z.string().max(120),
  commonWindow: z.object({ start: z.iso.datetime({ offset: true }), end: z.iso.datetime({ offset: true }) }).strict().nullable(),
}).strict()
export const ActiveStatusSchema = z.object({
  enabled: z.boolean().default(false),
  state: z.enum(['idle', 'queued', 'reserved', 'accepted', 'formed', 'declined', 'expired', 'cancelled']),
  lastOutcome: z.enum(['expired', 'cancelled', 'declined']).nullable().default(null),
  choices: z.object({ preferredGroupSize: z.number().int().min(2).max(9), minimumGroupSize: z.number().int().min(2).max(9), maximumGroupSize: z.number().int().min(2).max(9), allowExistingGroups: z.boolean() }).strict().nullable().default(null),
  entryId: id.nullable(), queuedAt: z.iso.datetime({ offset: true }).nullable(),
  proposal: ActiveProposalSchema.nullable(), groupId: id.nullable(),
}).strict().refine(value => (value.state === 'reserved' || value.state === 'accepted') === (value.proposal !== null))
export const ActiveGroupSchema = z.object({
  id, name: z.string().max(80).nullable(), targetSize: z.number().int().min(2).max(9),
  kind: z.literal('friends_group'), createdAt: z.iso.datetime({ offset: true }),
  latestMessage: MessageSchema.nullable(), unreadCount: z.number().int().nonnegative().safe(),
  members: z.array(ParticipantSchema).min(1).max(9),
  searchState: z.enum(['idle', 'readying', 'queued', 'reserved']),
  readyMemberIds: z.array(id).max(9),
}).strict()
export const ActiveGroupsSchema = z.object({ groups: z.array(ActiveGroupSchema).max(100) }).strict()
export const ActiveHistorySchema = z.object({ messages: z.array(MessageSchema).max(100), nextCursor: z.number().int().positive().safe().nullable() }).strict()
export const ActiveWorkerResultSchema = z.object({ state: z.enum(['paused', 'idle', 'waiting', 'reserved', 'uncertain']), processed: z.number().int().min(0).max(1) }).strict()
export type ActiveStatus = z.infer<typeof ActiveStatusSchema>
export type ActiveQueueInput = z.infer<typeof ActiveQueueInputSchema>
export type ActiveCommand = { action: 'join' | 'cancel' | 'accept' | 'decline' | 'smaller' | 'ready' | 'cancel-growth' | 'leave' | 'rename'; requestId: string; data: Record<string, unknown> }
