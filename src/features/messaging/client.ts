import type { ZodType } from 'zod'
import { supabase } from '../../supabase'
import { ConversationIdSchema } from '../../../shared/messaging'

export async function messagingRequest<T>(path: string, schema: ZodType<T>, options: { body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const session = supabase ? (await supabase.auth.getSession()).data.session : null
  const response = await fetch(`/api/conversations${path}`, {
    method: options.body ? 'POST' : 'GET', signal: options.signal,
    headers: { ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}), ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const data = await response.json()
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Messaging is unavailable. Try again.')
  return schema.parse(data)
}

export function conversationPath(id: string) { return `/messages/chat?conversation=${encodeURIComponent(id)}` }
export function ensureEventConversation(eventGroupId: string) {
  return messagingRequest('', ConversationIdSchema, { body: { eventGroupId } })
}
