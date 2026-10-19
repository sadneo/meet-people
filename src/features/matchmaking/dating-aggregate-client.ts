import { DatingAggregateSchema, DatingErrorSchema, SaveDatingAggregateSchema, sameDatingProfile, sameDatingSearch, type DatingAggregate, type SaveDatingAggregate } from '../../../shared/dating'
import { apiUrl } from '../../platform/native'

export class DatingClientError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) { super(message) }
}
// Capture the canonical verified session; no session acquisition or PUT retries.
export function datingAggregateClient(token: string) {
  async function request(method: 'GET' | 'PUT', body?: SaveDatingAggregate, signal?: AbortSignal): Promise<DatingAggregate> {
    const controller = new AbortController(), abort = () => controller.abort()
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) controller.abort()
    const timer = setTimeout(abort, 15000)
    try {
      const response = await fetch(apiUrl('/api/matchmaking/dating-preferences'), { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', signal: controller.signal })
      let data: unknown
      try { data = await response.json() } catch { throw new DatingClientError('malformed', 502, 'Dating response could not be read.') }
      if (controller.signal.aborted) throw new Error('Aborted')
      if (!response.ok) {
        const error = DatingErrorSchema.safeParse(data), statuses = { auth: 401, invalid: 400, conflict: 409, unavailable: 503, provider: 503, malformed: 502 }
        if (error.success && statuses[error.data.code] === response.status) throw new DatingClientError(error.data.code, response.status, error.data.error)
        throw new DatingClientError('provider', response.status, 'Dating preferences could not be confirmed. Reload before retrying.')
      }
      const parsed = DatingAggregateSchema.safeParse(data)
      if (!parsed.success) throw new DatingClientError('malformed', 502, 'Dating aggregate response could not be confirmed.')
      return parsed.data
    } catch (failure) {
      if (failure instanceof DatingClientError && !controller.signal.aborted) throw failure
      throw new DatingClientError('provider', 503, 'Dating request could not be confirmed. Reload saved preferences before retrying.')
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort) }
  }
  return {
    read: (signal?: AbortSignal) => request('GET', undefined, signal),
    async save(value: SaveDatingAggregate, signal?: AbortSignal) {
      const parsed = SaveDatingAggregateSchema.safeParse(value)
      // This UI boundary can only save disabled drafts, never activate Dating.
      if (!parsed.success || parsed.data.profile.enabled) throw new DatingClientError('invalid', 400, 'Only disabled Dating drafts can be saved here.')
      const saved = await request('PUT', parsed.data, signal)
      if (saved.profileRevision !== parsed.data.expectedProfileRevision + 1 || saved.searchRevision !== parsed.data.expectedSearchRevision + 1 || !sameDatingProfile(saved.profile, parsed.data.profile) || !sameDatingSearch(saved.search, parsed.data.search)) throw new DatingClientError('malformed', 502, 'Dating save could not be confirmed. Reload before retrying.')
      return saved
    },
  }
}
