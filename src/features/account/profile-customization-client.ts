import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import {
  ProfileCustomizationErrorSchema, ProfileCustomizationSchema, ProfileShowcaseSchema, defaultProfileCustomization,
  type ProfileCustomization, type ProfileCustomizationValue, type ProfileShowcase,
} from '../../../shared/profile-customization'
import { apiUrl } from '../../platform/native'
import { useAccount } from '../../auth/account-context'

export class ProfileCustomizationError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) { super(message) }
}

export function profileCustomizationClient(token: string) {
  async function request<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) controller.abort()
    const timer = setTimeout(abort, 15000)
    try {
      const response = await fetch(apiUrl(`/api/matchmaking/profile-customization${path}`), {
        ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, cache: 'no-store', signal: controller.signal,
      })
      let data: unknown
      try { data = await response.json() } catch { throw new ProfileCustomizationError('malformed', 502, 'Profile choices could not be read.') }
      if (!response.ok) {
        const parsed = ProfileCustomizationErrorSchema.safeParse(data)
        throw new ProfileCustomizationError(parsed.success ? parsed.data.code : 'provider', response.status, parsed.success ? parsed.data.error : 'Profile choices are unavailable.')
      }
      const parsed = schema.safeParse(data)
      if (!parsed.success) throw new ProfileCustomizationError('malformed', 502, 'Profile choices could not be confirmed.')
      return parsed.data
    } catch (failure) {
      if (failure instanceof ProfileCustomizationError && !controller.signal.aborted) throw failure
      throw new ProfileCustomizationError('provider', 503, 'Profile choices could not be confirmed. Reload before trying again.')
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
    }
  }
  return {
    read: (signal?: AbortSignal) => request('', ProfileCustomizationSchema, {}, signal),
    save: (expectedRevision: number, customization: ProfileCustomizationValue) =>
      request('', ProfileCustomizationSchema, { method: 'PUT', body: JSON.stringify({ expectedRevision, customization }) }),
    showcase: (owner: string, signal?: AbortSignal) => request(`/${encodeURIComponent(owner)}`, ProfileShowcaseSchema, {}, signal),
  }
}

const ownKey = (owner: string | undefined) => ['profile-customization', owner]

// The signed-in person's own choices, with a revisioned save.
export function useProfileCustomization() {
  const account = useAccount()
  const token = account?.loaded ? account.session?.access_token : undefined
  const owner = account?.session?.user.id
  const client = useMemo(() => token ? profileCustomizationClient(token) : null, [token])
  const cache = useQueryClient()
  const query = useQuery({
    queryKey: ownKey(owner),
    enabled: !!client && !!owner,
    staleTime: 30_000,
    retry: false,
    queryFn: ({ signal }) => client!.read(signal),
  })
  async function save(customization: ProfileCustomizationValue): Promise<ProfileCustomization> {
    if (!client || !query.data) throw new ProfileCustomizationError('unavailable', 503, 'Reload your profile before saving.')
    const saved = await client.save(query.data.revision, customization)
    cache.setQueryData(ownKey(owner), saved)
    void cache.invalidateQueries({ queryKey: ['profile-showcase', owner] })
    return saved
  }
  return { query, value: query.data?.customization ?? defaultProfileCustomization, save }
}

// Another person's public choices (top interest order and Garden showcase).
export function useProfileShowcase(owner: string | undefined, enabled = true) {
  const account = useAccount()
  const token = account?.loaded ? account.session?.access_token : undefined
  return useQuery<ProfileShowcase>({
    queryKey: ['profile-showcase', owner],
    enabled: !!token && !!owner && enabled,
    staleTime: 60_000,
    retry: false,
    queryFn: ({ signal }) => profileCustomizationClient(token!).showcase(owner!, signal),
  })
}
