import type { ZodType } from 'zod'
import { authorizedRequest } from '../../auth/authorizedRequest'
import { ConversationIdSchema } from '../../../shared/messaging'

export function messagingRequest<T>(path: string, schema: ZodType<T>, options: { body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  return authorizedRequest(`/api/conversations${path}`, schema, options)
}

export function conversationPath(id: string) { return `/messages/chat?conversation=${encodeURIComponent(id)}` }
export function ensureEventConversation(eventGroupId: string) {
  return messagingRequest('', ConversationIdSchema, { body: { eventGroupId } })
}
