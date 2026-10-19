import { ProfileDetailsSchema, ProfileDetailsErrorSchema, SaveProfileDetailsSchema, type ProfileDetails, type SaveProfileDetails } from '../../../shared/profile-details'
import { apiUrl } from '../../platform/native'

export class ProfileDetailsClientError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) { super(message) }
}
export function sameProfileFacts(a: ProfileDetails['facts'], b: ProfileDetails['facts']) {
  return a.education === b.education && a.occupation === b.occupation &&
    a.languages.length === b.languages.length && a.languages.every((value, index) => value === b.languages[index]) &&
    a.visibility.education === b.visibility.education && a.visibility.occupation === b.visibility.occupation && a.visibility.languages === b.visibility.languages
}
// Token comes from the existing canonical account/session boundary. Do not fetch
// a potentially different actor's session midway through a save or retry writes.
export function profileDetailsClient(token: string) {
  async function request(method: 'GET' | 'PUT', body?: SaveProfileDetails, signal?: AbortSignal): Promise<ProfileDetails> {
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) controller.abort()
    const timer = setTimeout(abort, 15000)
    try {
      const response = await fetch(apiUrl('/api/matchmaking/profile-details'), {
        method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', signal: controller.signal,
      })
      let data: unknown
      try { data = await response.json() } catch { throw new ProfileDetailsClientError('malformed', 502, 'Profile details response could not be read.') }
      if (controller.signal.aborted) throw new Error('Aborted')
      if (!response.ok) {
        const parsed = ProfileDetailsErrorSchema.safeParse(data)
        const statuses = { auth: 401, invalid: 400, conflict: 409, unavailable: 503, provider: 503, malformed: 502 }
        if (parsed.success && statuses[parsed.data.code] === response.status) throw new ProfileDetailsClientError(parsed.data.code, response.status, parsed.data.error)
        throw new ProfileDetailsClientError('provider', response.status, 'Profile details service is unavailable.')
      }
      const parsed = ProfileDetailsSchema.safeParse(data)
      if (!parsed.success) throw new ProfileDetailsClientError('malformed', 502, 'Profile details response could not be confirmed.')
      return parsed.data
    } catch (failure) {
      if (failure instanceof ProfileDetailsClientError && !controller.signal.aborted) throw failure
      throw new ProfileDetailsClientError('provider', 503, 'Profile details request could not be confirmed. Reload saved details before trying again.')
    } finally {
      clearTimeout(timer); signal?.removeEventListener('abort', abort)
    }
  }
  return {
    read: (signal?: AbortSignal) => request('GET', undefined, signal),
    async save(draft: SaveProfileDetails, signal?: AbortSignal) {
      const parsed = SaveProfileDetailsSchema.safeParse(draft)
      if (!parsed.success) throw new ProfileDetailsClientError('invalid', 400, 'Check your profile details before saving.')
      const saved = await request('PUT', parsed.data, signal)
      if (saved.revision !== parsed.data.expectedRevision + 1 || !sameProfileFacts(saved.facts, parsed.data.facts)) throw new ProfileDetailsClientError('malformed', 502, 'Profile details save could not be confirmed.')
      return saved
    },
  }
}
