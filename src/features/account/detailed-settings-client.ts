import { DetailedSettingsSchema, DetailedSettingsErrorSchema, SaveDetailedSettingsSchema, sameDetailedSettings, type DetailedSettings, type SaveDetailedSettings } from '../../../shared/detailed-settings'
import { apiUrl } from '../../platform/native'

export class DetailedSettingsClientError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) { super(message) }
}
// Capture the existing verified session token; never replace the actor midway
// through a request or blindly retry an uncertain mutation.
export function detailedSettingsClient(token: string) {
  async function request(method: 'GET' | 'PUT', body?: SaveDetailedSettings, signal?: AbortSignal): Promise<DetailedSettings> {
    const controller = new AbortController(), abort = () => controller.abort()
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) controller.abort()
    const timer = setTimeout(abort, 15000)
    try {
      const response = await fetch(apiUrl('/api/matchmaking/detailed-settings'), {
        method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', signal: controller.signal,
      })
      let data: unknown
      try { data = await response.json() } catch { throw new DetailedSettingsClientError('malformed', 502, 'Detailed preferences response could not be read.') }
      if (controller.signal.aborted) throw new Error('Aborted')
      if (!response.ok) {
        const parsed = DetailedSettingsErrorSchema.safeParse(data)
        const statuses = { auth: 401, invalid: 400, conflict: 409, unavailable: 503, provider: 503, malformed: 502 }
        if (parsed.success && statuses[parsed.data.code] === response.status) throw new DetailedSettingsClientError(parsed.data.code, response.status, parsed.data.error)
        throw new DetailedSettingsClientError('provider', response.status, 'Detailed preferences service is unavailable.')
      }
      const parsed = DetailedSettingsSchema.safeParse(data)
      if (!parsed.success) throw new DetailedSettingsClientError('malformed', 502, 'Detailed preferences response could not be confirmed.')
      return parsed.data
    } catch (failure) {
      if (failure instanceof DetailedSettingsClientError && !controller.signal.aborted) throw failure
      throw new DetailedSettingsClientError('provider', 503, 'Detailed preferences request could not be confirmed. Reload saved preferences before trying again.')
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort) }
  }
  return {
    read: (signal?: AbortSignal) => request('GET', undefined, signal),
    async save(draft: SaveDetailedSettings, signal?: AbortSignal) {
      const parsed = SaveDetailedSettingsSchema.safeParse(draft)
      if (!parsed.success) throw new DetailedSettingsClientError('invalid', 400, 'Check your detailed preferences before saving.')
      const saved = await request('PUT', parsed.data, signal)
      if (saved.revision !== parsed.data.expectedRevision + 1 || !sameDetailedSettings(saved.settings, parsed.data.settings)) throw new DetailedSettingsClientError('malformed', 502, 'Detailed preferences save could not be confirmed.')
      return saved
    },
  }
}
