import { z } from 'zod'
import { RelationshipModeSchema } from './connections.js'

export const MESSAGE_MAX_LENGTH = 2000
const seq = z.number().int().nonnegative()
export const ParticipantSchema = z.object({
  id: z.string().uuid(), display_name: z.string(),
  // https only; render with no referrer.
  avatar_url: z.string().nullable(),
  last_read_seq: seq,
})
export const MessageSchema = z.object({
  id: z.string().uuid(), conversation_id: z.string().uuid(), seq,
  // Null once the sender has deleted their account.
  sender_id: z.string().uuid().nullable(),
  body: z.string(), created_at: z.string(),
})
export const ConversationKindSchema = z.enum(['direct', 'event_group', 'friends_group'])
export const ConversationSchema = z.object({
  mode: RelationshipModeSchema.nullable().optional(),
  id: z.string().uuid(), kind: ConversationKindSchema, created_at: z.string(),
  participants: z.array(ParticipantSchema), latest_message: MessageSchema.nullable(), unread_count: seq,
})
export const ConversationsSchema = z.object({ conversations: z.array(ConversationSchema), hasMore: z.boolean() })
export const HistorySchema = z.object({
  kind: ConversationKindSchema, canSend: z.boolean(),
  messages: z.array(MessageSchema), participants: z.array(ParticipantSchema), nextCursor: seq.nullable(),
})
export const ConversationIdSchema = z.object({ conversationId: z.string().uuid() })
export const SendMessageSchema = z.object({
  body: z.string().trim().min(1).max(MESSAGE_MAX_LENGTH), clientRequestId: z.string().uuid(),
}).strict()
export const MarkReadSchema = z.object({ seq }).strict()
export const ReadStateSchema = z.object({ lastReadSeq: seq })
export const MessagingActivitySchema = z.object({ unreadConversations: seq, incomingRequests: seq })
export type Message = z.infer<typeof MessageSchema>
export type Conversation = z.infer<typeof ConversationSchema>
export type Participant = z.infer<typeof ParticipantSchema>
export type History = z.infer<typeof HistorySchema>
