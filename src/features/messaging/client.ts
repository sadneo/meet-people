import type { ZodType } from 'zod'
import { authorizedRequest } from '../../auth/authorizedRequest'

export function messagingRequest<T>(path: string, schema: ZodType<T>, options: { body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  return authorizedRequest(`/api/conversations${path}`, schema, options)
}

export function conversationPath(id: string) { return `/messages/chat?conversation=${encodeURIComponent(id)}` }
