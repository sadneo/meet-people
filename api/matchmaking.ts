import { Router, type Request, type Response, type NextFunction } from 'express'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { AccountSchema, SaveAccountSchema, completedAccountChapters, type Account } from '../shared/account.js'
import { isPublicSupabaseKey } from './env.js'
import { JoinQueueSchema, MatchingProfileSchema, RawMatchSchema, RawQueueStatusSchema, type MatchingProfile } from '../shared/matchmaking.js'
import { EventGroupQueueSchema, MatchingNotificationsSchema, ListingIdSchema, ListingInterestRequestSchema, ListingMatchmakingStatusSchema, RawListingEventMatchesSchema } from '../shared/matchmaking.js'
import { AccountProfileSchema, type AccountProfile } from '../shared/account-profile.js'
import type { SaveProfileDetails } from '../shared/profile-details.js'
import { createProfileDetailsRouter } from './profile-details.js'
import type { SaveFriendsSearchPreferences } from '../shared/friends-search-preferences.js'
import { createFriendsSearchPreferencesRouter } from './friends-search-preferences.js'
import type { SaveDetailedSettings } from '../shared/detailed-settings.js'
import { createDetailedSettingsRouter } from './detailed-settings.js'
import type { SaveDatingAggregate } from '../shared/dating.js'
import { createDatingRouter } from './dating.js'

type RpcResponse = { data: unknown; error: { code?: string } | null }
export interface UserContextTransport {
  verify(token: string): Promise<{ id: string } | null>
  actor(token: string): {
    join(qtype: 'matchmaking' | 'downtime'): PromiseLike<RpcResponse>
    leave(): PromiseLike<RpcResponse>
    status(): PromiseLike<RpcResponse>
    result(): PromiseLike<RpcResponse>
    profile(): PromiseLike<RpcResponse>
    save(profile: MatchingProfile): PromiseLike<RpcResponse>
    accountProfile?(): PromiseLike<RpcResponse>
    saveAccountProfile?(profile: AccountProfile): PromiseLike<RpcResponse>
    account?(): PromiseLike<RpcResponse>
    saveAccount?(account: Account): PromiseLike<RpcResponse>
    profileDetails?(): PromiseLike<RpcResponse>
    saveProfileDetails?(details: SaveProfileDetails): PromiseLike<RpcResponse>
    friendsSearchPreferences?(): PromiseLike<RpcResponse>
    saveFriendsSearchPreferences?(preferences: SaveFriendsSearchPreferences): PromiseLike<RpcResponse>
    detailedSettings?(): PromiseLike<RpcResponse>
    saveDetailedSettings?(settings: SaveDetailedSettings): PromiseLike<RpcResponse>
    datingAggregate?(): PromiseLike<RpcResponse>
    saveDatingAggregate?(aggregate: SaveDatingAggregate): PromiseLike<RpcResponse>
    listingStatus(listingId: string): PromiseLike<RpcResponse>
    listingInterest(listingId: string): PromiseLike<RpcResponse>
    listingWithdraw(listingId: string): PromiseLike<RpcResponse>
    listingMatches(listingId: string): PromiseLike<RpcResponse>
    groupQueue(listingId: string): PromiseLike<RpcResponse>
    groupJoin(listingId: string): PromiseLike<RpcResponse>
    groupLeave(listingId: string): PromiseLike<RpcResponse>
    notifications(): PromiseLike<RpcResponse>
    notificationRead(notificationId: string): PromiseLike<RpcResponse>
  }
}

// No service key is ever passed to the actor client. Names are fixed here, not request-controlled.
export function createUserContextTransport(config: { url: string; publicKey: string; verificationKey?: string; fetch?: typeof fetch }): UserContextTransport {
  if (!isPublicSupabaseKey(config.publicKey)) throw new Error('Matching actor transport requires a public Supabase key.')
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: config.fetch } }
  const verifier = createClient(config.url, config.verificationKey ?? config.publicKey, options)
  return {
    async verify(token) {
      const { data, error } = await verifier.auth.getUser(token)
      if (error && (!error.status || error.status >= 500)) throw new Error('Verification unavailable')
      return !error && data.user && z.uuid().safeParse(data.user.id).success ? { id: data.user.id } : null
    },
    actor(token) {
      const client = createClient(config.url, config.publicKey, { ...options, global: { fetch: config.fetch, headers: { Authorization: `Bearer ${token}` } } })
      return {
        account: () => client.rpc('get_account'),
        saveAccount: account => client.rpc('save_account', { account_in: account }),
        profileDetails: () => client.rpc('get_profile_details'),
        saveProfileDetails: details => client.rpc('save_profile_details', { details_in: details }),
        friendsSearchPreferences: () => client.rpc('get_friends_search_preferences'),
        saveFriendsSearchPreferences: preferences => client.rpc('save_friends_search_preferences', { preferences_in: preferences }),
        detailedSettings: () => client.rpc('get_detailed_settings'),
        saveDetailedSettings: settings => client.rpc('save_detailed_settings', { settings_in: settings }),
        datingAggregate: () => client.rpc('get_dating_preferences'),
        saveDatingAggregate: aggregate => client.rpc('save_dating_preferences', { aggregate_in: aggregate }),
        join: qtype => client.rpc('join_queue', { qtype }), leave: () => client.rpc('leave_queue'), status: () => client.rpc('get_queue_status'), result: () => client.rpc('get_queue_match'), profile: () => client.rpc('get_matchmaking_profile'), save: profile => client.rpc('save_matchmaking_profile', { profile_in: profile }),
        listingStatus: listingId => client.rpc('get_listing_matchmaking_status', { listing_id_in: listingId }),
        listingInterest: listingId => client.rpc('express_listing_matchmaking_interest', { listing_id_in: listingId }),
        listingWithdraw: listingId => client.rpc('withdraw_listing_matchmaking_interest', { listing_id_in: listingId }),
        listingMatches: listingId => client.rpc('get_listing_event_matches', { listing_id_in: listingId }),
        groupQueue: listingId => client.rpc('get_event_group_queue', { listing_id_in: listingId }),
        groupJoin: listingId => client.rpc('join_event_group_queue', { listing_id_in: listingId }),
        groupLeave: listingId => client.rpc('leave_event_group_queue', { listing_id_in: listingId }),
        notifications: () => client.rpc('get_matching_notifications'),
        notificationRead: notificationId => client.rpc('mark_matching_notification_read', { notification_id_in: notificationId }),
      }
    },
  }
}

class MatchingFailure extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message) }
}
function unwrap(result: RpcResponse): unknown {
  if (result.error) {
    if (['PGRST301', 'PGRST302', 'PGRST303', '28000'].includes(result.error.code ?? '')) throw new MatchingFailure(401, 'auth', 'Your session has expired. Sign in again.')
    if (['PGRST202', '42883'].includes(result.error.code ?? '')) throw new MatchingFailure(503, 'unavailable', 'Matching RPC is not available yet.')
    if (['22023', '23505', '23514'].includes(result.error.code ?? '')) throw new MatchingFailure(400, 'invalid', 'Check your profile fields and onboarding steps. No changes were saved.')
    if (result.error.code === 'PT404') throw new MatchingFailure(404, 'unavailable', 'This event is no longer available.')
    if (result.error.code === 'PT409') throw new MatchingFailure(409, 'unavailable', 'Event matching prerequisites are not met. Check your saved profile, event availability and consent for this queue or compatibility action.')
    throw new MatchingFailure(503, 'provider', 'Matching service failed. Please try again.')
  }
  return result.data
}
function validate<T>(schema: z.ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data)
  if (!parsed.success) throw new MatchingFailure(502, 'malformed', 'Matching service returned an invalid response.')
  return parsed.data
}
export function createMatchmakingRouter(transport: UserContextTransport | null) {
  const router = Router()
  router.use(async (request, response, next) => {
    response.set('Cache-Control', 'no-store')
    try {
      if (!transport) throw new MatchingFailure(503, 'unavailable', 'Matching service is not configured.')
      const token = request.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1]
      if (!token || token.length > 8192) throw new MatchingFailure(401, 'auth', 'Sign in with a valid session to use matching.')
      const user = await transport.verify(token)
      if (!user || !z.uuid().safeParse(user.id).success) throw new MatchingFailure(401, 'auth', 'Sign in with a valid session to use matching.')
      response.locals.actor = transport.actor(token)
      response.locals.actorId = user.id
      next()
    } catch (error) { next(error) }
  })
  const actor = (response: Response): ReturnType<UserContextTransport['actor']> => response.locals.actor
  router.use('/profile-details', createProfileDetailsRouter())
  router.use('/friends-search-preferences', createFriendsSearchPreferencesRouter())
  router.use('/detailed-settings', createDetailedSettingsRouter())
  router.use('/dating-preferences', createDatingRouter())
  const readAccount = async (response: Response) => {
    const read = actor(response).account
    if (!read) throw new MatchingFailure(503, 'unavailable', 'Unified account RPC is not available yet.')
    return validate(AccountSchema, unwrap(await read()))
  }
  const writeAccount = async (response: Response, next: Account, previous: Account) => {
    const save = actor(response).saveAccount
    if (!save) throw new MatchingFailure(503, 'unavailable', 'Unified account RPC is not available yet.')
    const before = completedAccountChapters(previous).length
    if (completedAccountChapters(next).length < before || next.completed.length > before + 1) throw new MatchingFailure(400, 'invalid', 'Preserve required fields and complete chapters sequentially.')
    return validate(AccountSchema, unwrap(await save(SaveAccountSchema.parse(next))))
  }
  const status = async (response: Response) => {
    const [row] = validate(RawQueueStatusSchema, unwrap(await actor(response).status()))
    if (row.my_queue === 'dating') throw new MatchingFailure(409, 'unavailable', 'You are in a queue outside active or downtime matching.')
    return { mode: row.my_queue === 'matchmaking' ? 'active' : row.my_queue }
  }
  router.post('/queue', async (request, response) => {
    const parsed = JoinQueueSchema.safeParse(request.body)
    if (!parsed.success) throw new MatchingFailure(400, 'invalid', 'Invalid matching mode or request fields.')
    unwrap(await actor(response).join(parsed.data.mode === 'active' ? 'matchmaking' : 'downtime'))
    response.json(await status(response))
  })
  router.delete('/queue', async (_request, response) => {
    unwrap(await actor(response).leave())
    response.json(await status(response))
  })
  router.get('/status', async (_request, response) => { response.json(await status(response)) })
  router.get('/result', async (_request, response) => {
    const current = await status(response)
    if (!current.mode) throw new MatchingFailure(409, 'unavailable', 'Join a queue before checking for a match.')
    const [row] = validate(RawMatchSchema, unwrap(await actor(response).result()))
    if (row && (row.queue_kind === 'matchmaking' ? 'active' : 'downtime') !== current.mode) throw new MatchingFailure(502, 'malformed', 'Matching service returned an invalid response.')
    response.json({ candidate: row ? {
      id: row.match_profile_id, name: row.match_display_name, avatar: row.match_avatar_url,
      interests: row.shared_interests, mode: row.queue_kind === 'matchmaking' ? 'active' : 'downtime',
      overlap: row.overlap_minutes === 0 ? 'none' : row.overlap_minutes < 120 ? 'some' : 'extended',
      meetup: row.event_id === null ? null : { id: row.event_id, title: row.event_title, location: row.event_location, startsAt: row.event_starts_at },
    } : null })
  })
  router.get('/profile', async (_request, response) => {
    const data = unwrap(await actor(response).profile())
    response.json({ profile: data === null ? null : validate(MatchingProfileSchema, data) })
  })
  router.get('/account-profile', async (_request, response) => {
    const account = await readAccount(response)
    const profile = account.profile
    response.json({ profile: profile ? AccountProfileSchema.parse({ username: profile.username, display_name: profile.display_name, bio: profile.bio, avatar_url: profile.avatar_url }) : null })
  })
  router.put('/account-profile', async (request, response) => {
    const parsed = AccountProfileSchema.safeParse(request.body)
    if (!parsed.success) throw new MatchingFailure(400, 'invalid', 'Invalid account profile. No changes were saved.')
    const previous = await readAccount(response)
    if (previous.profile && previous.profile.username !== parsed.data.username) throw new MatchingFailure(409, 'unavailable', 'Reload your existing identity before editing.')
    const saved = await writeAccount(response, { ...previous, profile: { ...(previous.profile ?? { birthdate: null, location_city: null, interests: [], availability: [] }), ...parsed.data }, completed: previous.completed.length ? previous.completed : [0] }, previous)
    response.json({ profile: AccountProfileSchema.parse({ username: saved.profile!.username, display_name: saved.profile!.display_name, bio: saved.profile!.bio, avatar_url: saved.profile!.avatar_url }) })
  })
  router.get('/account', async (_request, response) => {
    response.json(await readAccount(response))
  })
  router.put('/account', async (request, response) => {
    const parsed = SaveAccountSchema.safeParse(request.body)
    if (!parsed.success) throw new MatchingFailure(400, 'invalid', 'Invalid account data. No changes were saved.')
    response.json(await writeAccount(response, parsed.data, await readAccount(response)))
  })
  router.put('/profile', async (request, response) => {
    const parsed = MatchingProfileSchema.safeParse(request.body)
    if (!parsed.success) throw new MatchingFailure(400, 'invalid', 'Invalid matching profile. No changes were saved.')
    const previous = await readAccount(response)
    if (!previous.profile) throw new MatchingFailure(409, 'unavailable', 'Create your identity through onboarding first.')
    if (['username', 'display_name', 'bio', 'avatar_url'].some(key => parsed.data[key as keyof MatchingProfile] !== previous.profile![key as keyof MatchingProfile])) throw new MatchingFailure(400, 'invalid', 'Edit identity on Profile, not matching preferences.')
    const saved = await writeAccount(response, { ...previous, profile: parsed.data }, previous)
    response.json({ profile: saved.profile })
  })
  const listingId = (request: Request) => {
    const parsed = ListingIdSchema.safeParse(request.params.listingId)
    if (!parsed.success || Object.keys(request.query ?? {}).length || !ListingInterestRequestSchema.safeParse(request.body === undefined ? {} : request.body).success) {
      throw new MatchingFailure(400, 'invalid', 'Use a valid listing ID without extra request fields.')
    }
    return parsed.data
  }
  const requireProfile = async (response: Response) => {
    const profile = unwrap(await actor(response).profile())
    if (profile === null) throw new MatchingFailure(409, 'unavailable', 'Save a matching profile before joining or checking event matching.')
    validate(MatchingProfileSchema, profile)
  }
  const groupSnapshot = (response: Response, id: string, data: unknown) => {
    const snapshot = validate(EventGroupQueueSchema, data)
    if (snapshot.proposal && (snapshot.proposal.eventId !== id || !snapshot.proposal.members.some(member => member.id === response.locals.actorId))) {
      throw new MatchingFailure(502, 'malformed', 'Matching service returned an invalid response.')
    }
    return snapshot
  }
  router.get('/events/:listingId/group-queue', async (request, response) => {
    const id = listingId(request)
    response.json(groupSnapshot(response, id, unwrap(await actor(response).groupQueue(id))))
  })
  router.post('/events/:listingId/group-queue', async (request, response) => {
    const id = listingId(request)
    await requireProfile(response)
    response.json(groupSnapshot(response, id, unwrap(await actor(response).groupJoin(id))))
  })
  router.delete('/events/:listingId/group-queue', async (request, response) => {
    const id = listingId(request)
    response.json(groupSnapshot(response, id, unwrap(await actor(response).groupLeave(id))))
  })
  const emptyRequest = (request: Request) => {
    if (Object.keys(request.query ?? {}).length || !ListingInterestRequestSchema.safeParse(request.body === undefined ? {} : request.body).success) throw new MatchingFailure(400, 'invalid', 'Unexpected notification request fields.')
  }
  router.get('/notifications', async (request, response) => {
    emptyRequest(request)
    response.json(validate(MatchingNotificationsSchema, unwrap(await actor(response).notifications())))
  })
  router.post('/notifications/:id/read', async (request, response) => {
    emptyRequest(request)
    const id = ListingIdSchema.safeParse(request.params.id)
    if (!id.success) throw new MatchingFailure(400, 'invalid', 'Invalid notification ID.')
    response.json(validate(MatchingNotificationsSchema, unwrap(await actor(response).notificationRead(id.data))))
  })
  router.get('/events/:listingId/status', async (request, response) => {
    response.json(validate(ListingMatchmakingStatusSchema, unwrap(await actor(response).listingStatus(listingId(request)))))
  })
  router.post('/events/:listingId/interest', async (request, response) => {
    const id = listingId(request)
    await requireProfile(response)
    response.json(validate(ListingMatchmakingStatusSchema, unwrap(await actor(response).listingInterest(id))))
  })
  router.delete('/events/:listingId/interest', async (request, response) => {
    response.json(validate(ListingMatchmakingStatusSchema, unwrap(await actor(response).listingWithdraw(listingId(request)))))
  })
  router.get('/events/:listingId/matches', async (request, response) => {
    const id = listingId(request)
    await requireProfile(response)
    const current = validate(ListingMatchmakingStatusSchema, unwrap(await actor(response).listingStatus(id)))
    if (!current.available || !current.isInterested) throw new MatchingFailure(409, 'unavailable', 'Opt in to compatibility for an available event before checking matches.')
    const rows = validate(RawListingEventMatchesSchema, unwrap(await actor(response).listingMatches(id)))
    response.json({ candidates: rows.map(row => ({ id: row.profile_id, name: row.display_name, avatar: row.avatar_url, interests: row.shared_interests })) })
  })
  router.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
    void next
    const failure = error instanceof MatchingFailure ? error : new MatchingFailure(503, 'provider', 'Matching service failed. Please try again.')
    response.status(failure.status).json({ code: failure.code, error: failure.message })
  })
  return router
}
