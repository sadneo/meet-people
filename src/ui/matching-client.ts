import { z } from 'zod'
import { apiUrl } from '../platform/native'
import { FriendsBatchRequestSchema, FriendsBatchResponseSchema } from '../../shared/friends-discovery'
import { DatingBatchRequestSchema, DatingBatchResponseSchema } from '../../shared/dating-live'
import { ActiveStatusSchema, ActiveGroupsSchema, ActiveGroupSchema, ActiveHistorySchema, type ActiveCommand } from '../../shared/active-friends'
import { MatchingScoringSettingsResponseSchema, SaveMatchingScoringSettingsSchema, type SaveMatchingScoringSettings } from '../../shared/matching-scoring'
import { ConnectionStateSchema } from '../../shared/connections'
import { MessageSchema, ReadStateSchema } from '../../shared/messaging'
export class MatchingError extends Error { constructor(readonly status: number, message: string, readonly code?: string) { super(message) } }
export function matchingClient(token: string) {
  async function request<T>(path: string, schema: z.ZodType<T>, options: { body?: unknown; method?: string; signal?: AbortSignal } = {}): Promise<T> {
    const controller = new AbortController(), abort = () => controller.abort()
    options.signal?.addEventListener('abort', abort, { once: true }); if (options.signal?.aborted) abort()
    const timer = setTimeout(abort, 15000)
    try {
      const response = await fetch(apiUrl(`/api/matchmaking${path}`), { method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
        headers: { Authorization: `Bearer ${token}`, ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: options.body === undefined ? undefined : JSON.stringify(options.body), signal: controller.signal, cache: 'no-store' })
      const data: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        const error = z.object({ error: z.string().max(250), code: z.string().max(50).optional() }).safeParse(data)
        throw new MatchingError(response.status, error.success ? error.data.error : 'Matching could not be confirmed. Refresh before trying again.', error.success ? error.data.code : undefined)
      }
      const parsed = schema.safeParse(data)
      if (!parsed.success) throw new MatchingError(502, 'The response could not be confirmed. Refresh before trying again.')
      return parsed.data
    } catch (error) {
      if (error instanceof MatchingError) throw error
      throw new MatchingError(0, 'Connection interrupted. Refresh before trying again; changes may already be saved.')
    } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort) }
  }
  return {
    friends: (excludedIds: string[], signal?: AbortSignal) => request('/friends/recommendations', FriendsBatchResponseSchema, { body: FriendsBatchRequestSchema.parse({ excludedIds, limit: 10 }), signal }),
    dating: (excludedIds: string[], signal?: AbortSignal) => request('/dating/recommendations', DatingBatchResponseSchema, { body: DatingBatchRequestSchema.parse({ excludedIds, limit: 10 }), signal }),
    connect: (mode: 'Friends' | 'Dating', target: string) => request(mode === 'Friends' ? `/friends/requests/${encodeURIComponent(target)}` : `/dating/requests/${encodeURIComponent(target)}`, ConnectionStateSchema, { body: {} }),
    acceptFriend: (target: string) => request(`/friends/requests/${encodeURIComponent(target)}/accept`, ConnectionStateSchema, { body: {} }),
    schedule: (signal?: AbortSignal) => request('/schedule', MatchingScoringSettingsResponseSchema, { signal }),
    saveSchedule: (value: SaveMatchingScoringSettings, signal?: AbortSignal) => request('/schedule', MatchingScoringSettingsResponseSchema, { body: SaveMatchingScoringSettingsSchema.parse(value), method: 'PUT', signal }),
    status: (signal?: AbortSignal) => request('/active-friends/status', ActiveStatusSchema, { signal }),
    check: () => request('/active-friends/check', ActiveStatusSchema, { body: {} }),
    command: (action: ActiveCommand['action'], data: Record<string, unknown>, requestId = crypto.randomUUID()) => {
      const prefix = '/active-friends', { proposalId, groupId, ...rest } = data
      const path = action === 'join' || action === 'cancel' ? '/queue' : ['accept', 'decline', 'smaller'].includes(action)
        ? `/proposals/${encodeURIComponent(String(proposalId))}/${action}` : `/groups/${encodeURIComponent(String(groupId))}/${action}`
      return request(prefix + path, ActiveStatusSchema, { body: { requestId, ...rest }, method: action === 'cancel' ? 'DELETE' : 'POST' })
    },
    groups: (signal?: AbortSignal) => request('/active-friends/groups', ActiveGroupsSchema, { signal }),
    group: (id: string, signal?: AbortSignal) => request(`/active-friends/groups/${encodeURIComponent(id)}`, ActiveGroupSchema, { signal }),
    history: (id: string, before?: number, signal?: AbortSignal) => request(`/active-friends/groups/${encodeURIComponent(id)}/messages${before === undefined ? '' : `?before=${before}`}`, ActiveHistorySchema, { signal }),
    send: (id: string, body: { body: string; clientRequestId: string }) => request(`/active-friends/groups/${encodeURIComponent(id)}/messages`, MessageSchema, { body }),
    read: (id: string, seq: number, signal?: AbortSignal) => request(`/active-friends/groups/${encodeURIComponent(id)}/read`, ReadStateSchema, { body: { seq }, signal }),
  }
}
