import { FriendsSearchPreferencesSchema, FriendsSearchErrorSchema, SaveFriendsSearchPreferencesSchema, sameFriendsPreferences, type FriendsSearchPreferences, type SaveFriendsSearchPreferences } from '../../../shared/friends-search-preferences'
import { apiUrl } from '../../platform/native'

export class FriendsPreferencesClientError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) { super(message) }
}
// Captured canonical actor session, no session replacement or mutation retry.
export function friendsPreferencesClient(token: string) {
  async function request(method: 'GET' | 'PUT', body?: SaveFriendsSearchPreferences, signal?: AbortSignal): Promise<FriendsSearchPreferences> {
    const controller = new AbortController(), abort = () => controller.abort()
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) controller.abort()
    const timer = setTimeout(abort, 15000)
    try {
      const response = await fetch(apiUrl('/api/matchmaking/friends-search-preferences'), { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', signal: controller.signal })
      let data: unknown
      try { data = await response.json() } catch { throw new FriendsPreferencesClientError('malformed', 502, 'Friends preference response could not be read.') }
      if (controller.signal.aborted) throw new Error('Aborted')
      if (!response.ok) {
        const parsed = FriendsSearchErrorSchema.safeParse(data), statuses = { auth: 401, invalid: 400, conflict: 409, unavailable: 503, provider: 503, malformed: 502 }
        if (parsed.success && statuses[parsed.data.code] === response.status) throw new FriendsPreferencesClientError(parsed.data.code, response.status, parsed.data.error)
        throw new FriendsPreferencesClientError('provider', response.status, 'Friends preferences could not be confirmed. Reload before retrying.')
      }
      const parsed = FriendsSearchPreferencesSchema.safeParse(data)
      if (!parsed.success) throw new FriendsPreferencesClientError('malformed', 502, 'Friends preferences could not be confirmed.')
      return parsed.data
    } catch (failure) {
      if (failure instanceof FriendsPreferencesClientError && !controller.signal.aborted) throw failure
      throw new FriendsPreferencesClientError('provider', 503, 'Friends request could not be confirmed. Reload saved filters before retrying.')
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort) }
  }
  return {
    read: (signal?: AbortSignal) => request('GET', undefined, signal),
    async save(value: SaveFriendsSearchPreferences, signal?: AbortSignal) {
      const parsed = SaveFriendsSearchPreferencesSchema.safeParse(value)
      if (!parsed.success) throw new FriendsPreferencesClientError('invalid', 400, 'Check your Friends filters before saving.')
      const saved = await request('PUT', parsed.data, signal)
      if (saved.revision !== parsed.data.expectedRevision + 1 || !saved.preferences || !sameFriendsPreferences(saved.preferences, parsed.data.preferences)) throw new FriendsPreferencesClientError('malformed', 502, 'Friends save could not be confirmed. Reload before retrying.')
      return saved
    },
  }
}
