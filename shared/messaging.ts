import { z } from 'zod'

export const MESSAGE_MAX_LENGTH = 2000
export const ParticipantSchema = z.object({
  id: z.string().uuid(), display_name: z.string(),
  // Reserved for Xuhan's future profile contract; no fictional photos.
  avatar_url: z.string().nullable(),
})
export const MessageSchema = z.object({
  id: z.string().uuid(), conversation_id: z.string().uuid(), sender_id: z.string().uuid(),
  body: z.string(), created_at: z.string(), client_request_id: z.string().uuid(),
})
export const ConversationSchema = z.object({
  id: z.string().uuid(), created_at: z.string(),
  participants: z.array(ParticipantSchema), latest_message: MessageSchema.nullable(),
})
export const ConversationsSchema = z.object({ conversations: z.array(ConversationSchema), hasMore: z.boolean() })
export const HistorySchema = z.object({ messages: z.array(MessageSchema), participants: z.array(ParticipantSchema), nextCursor: z.string().uuid().nullable() })
export const ConversationIdSchema = z.object({ conversationId: z.string().uuid() })
export const SendMessageSchema = z.object({
  body: z.string().trim().min(1).max(MESSAGE_MAX_LENGTH), clientRequestId: z.string().uuid(),
}).strict()
export type Message = z.infer<typeof MessageSchema>
export type Conversation = z.infer<typeof ConversationSchema>
export type Participant = z.infer<typeof ParticipantSchema>
