import { type z } from 'zod'
import { AccountSchema, SaveAccountSchema, type Account } from '../../../shared/account'
import { JoinQueueSchema, QueueStatusSchema, MatchResultSchema, MatchingProfileSchema, ProfileResponseSchema, SavedProfileResponseSchema, MatchingErrorSchema, type MatchingMode, type MatchingProfile } from '../../../shared/matchmaking'
import { EventGroupQueueSchema, MatchingNotificationsSchema, EventCompatibilityResponseSchema, ListingIdSchema, ListingMatchmakingStatusSchema } from '../../../shared/matchmaking'
import { AccountProfileSchema, AccountProfileResponseSchema, SavedAccountProfileResponseSchema, type AccountProfile } from '../../../shared/account-profile'
import { apiUrl } from '../../platform/native'

export class MatchmakingClientError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) { super(message) }
}
export function matchmakingClient(token: string) {
  async function request<T>(path: string, schema: z.ZodType<T>, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) controller.abort()
    // Keep the deadline alive through JSON/body consumption, not just headers.
    const timer = setTimeout(() => controller.abort(), 15000)
    try {
      const response = await fetch(apiUrl(`/api/matchmaking/${path}`), { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', signal: controller.signal })
      let data: unknown
      try { data = await response.json() } catch { throw new MatchmakingClientError('malformed', response.status, 'Matching service returned an invalid response.') }
      if (!response.ok) {
        const error = MatchingErrorSchema.safeParse(data)
        throw new MatchmakingClientError(error.success ? error.data.code : 'provider', response.status, error.success ? error.data.error : 'Matching service is unavailable. Please try again.')
      }
      const parsed = schema.safeParse(data)
      if (!parsed.success) throw new MatchmakingClientError('malformed', 502, 'Matching service returned an invalid response.')
      return parsed.data
    } catch (failure) {
      // Aborting local transport does not prove a write was rolled back.
      if (controller.signal.aborted) throw new MatchmakingClientError('provider', 503, 'Matching request timed out. Its outcome may be uncertain; refresh to confirm.')
      throw failure
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort) }
  }
  return {
    accountProfile: () => request('account-profile', AccountProfileResponseSchema),
    saveAccountProfile: (profile: AccountProfile) => request('account-profile', SavedAccountProfileResponseSchema, 'PUT', AccountProfileSchema.parse(profile)),
    account: () => request('account', AccountSchema),
    saveAccount: (account: Account) => request('account', AccountSchema, 'PUT', SaveAccountSchema.parse(account)),
    status: () => request('status', QueueStatusSchema),
    join: (mode: MatchingMode) => request('queue', QueueStatusSchema, 'POST', JoinQueueSchema.parse({ mode })),
    leave: () => request('queue', QueueStatusSchema, 'DELETE'),
    result: () => request('result', MatchResultSchema),
    profile: () => request('profile', ProfileResponseSchema),
    save: (profile: MatchingProfile) => request('profile', SavedProfileResponseSchema, 'PUT', MatchingProfileSchema.parse(profile)),
    eventStatus: (listingId: string) => request(`events/${ListingIdSchema.parse(listingId)}/status`, ListingMatchmakingStatusSchema),
    eventInterest: (listingId: string) => request(`events/${ListingIdSchema.parse(listingId)}/interest`, ListingMatchmakingStatusSchema, 'POST', {}),
    eventWithdraw: (listingId: string) => request(`events/${ListingIdSchema.parse(listingId)}/interest`, ListingMatchmakingStatusSchema, 'DELETE'),
    eventMatches: (listingId: string) => request(`events/${ListingIdSchema.parse(listingId)}/matches`, EventCompatibilityResponseSchema),
    groupQueue: (listingId: string, signal?: AbortSignal) => request(`events/${ListingIdSchema.parse(listingId)}/group-queue`, EventGroupQueueSchema, 'GET', undefined, signal),
    groupJoin: (listingId: string) => request(`events/${ListingIdSchema.parse(listingId)}/group-queue`, EventGroupQueueSchema, 'POST', {}),
    groupLeave: (listingId: string) => request(`events/${ListingIdSchema.parse(listingId)}/group-queue`, EventGroupQueueSchema, 'DELETE'),
    notifications: () => request('notifications', MatchingNotificationsSchema),
    notificationRead: (id: string) => request(`notifications/${ListingIdSchema.parse(id)}/read`, MatchingNotificationsSchema, 'POST', {}),
  }
}
