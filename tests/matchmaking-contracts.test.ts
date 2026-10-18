import type { Request, Response } from 'express'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMatchmakingRouter, createUserContextTransport, type UserContextTransport } from '../api/matchmaking'
import { MatchingProfileSchema } from '../shared/matchmaking'
import { parseApiEnv } from '../api/env'
import { matchmakingClient } from '../src/features/matchmaking/client'
import { accountFixture } from './complete-profile-fixture'

const id = 'a0000000-0000-4000-8000-000000000001'
const profile = { username: 'sam', display_name: 'Sam', bio: null, birthdate: null, location_city: null, avatar_url: null, interests: ['Coffee'], availability: [] }
let mode: string | null = null
let result: unknown = []
let providerError: { code: string } | null = null
let listingStatus = { isInterested: false, available: true }
let listingMatches: unknown = []
let groupQueue: unknown = { state: 'idle', proposal: null }
const notificationId = 'd0000000-0000-4000-8000-000000000001'
let notifications: unknown = { notifications: [], unreadCount: 0 }
const actor = {
  join: vi.fn(async (qtype: string) => { mode = qtype; return { data: null, error: providerError } }),
  leave: vi.fn(async () => { if (!providerError) mode = null; return { data: null, error: providerError } }),
  status: vi.fn(async () => ({ data: [{ my_queue: mode, others_in_my_queue: 42 }], error: null })),
  result: vi.fn(async () => ({ data: result, error: providerError })),
  profile: vi.fn(async () => ({ data: profile, error: providerError })),
  save: vi.fn(async (value: unknown) => ({ data: value, error: providerError })),
  account: vi.fn(async () => ({ data: accountFixture(profile), error: providerError })),
  saveAccount: vi.fn(async (value: unknown) => ({ data: value, error: providerError })),
  listingStatus: vi.fn(async (listingId: string) => { void listingId; return { data: listingStatus, error: providerError } }),
  listingInterest: vi.fn(async (listingId: string) => { void listingId; return { data: { ...listingStatus, isInterested: true }, error: providerError } }),
  listingWithdraw: vi.fn(async (listingId: string) => { void listingId; return { data: { ...listingStatus, isInterested: false }, error: providerError } }),
  listingMatches: vi.fn(async (listingId: string) => { void listingId; return { data: listingMatches, error: providerError } }),
  groupQueue: vi.fn(async (listingId: string) => { void listingId; return { data: groupQueue, error: providerError } }),
  groupJoin: vi.fn(async (listingId: string) => { void listingId; return { data: { state: 'waiting', proposal: null }, error: providerError } }),
  groupLeave: vi.fn(async (listingId: string) => { void listingId; return { data: { state: 'idle', proposal: null }, error: providerError } }),
  notifications: vi.fn(async () => ({ data: notifications, error: providerError })),
  notificationRead: vi.fn(async (id: string) => { void id; return { data: notifications, error: providerError } }),
}
const transport: UserContextTransport = { verify: vi.fn(async token => token === 'user-jwt' ? { id } : null), actor: vi.fn(() => actor) }

// Exercise Express routing in memory: no listening service or database is needed.
function request(path: string, method = 'GET', body?: unknown, token = 'user-jwt', configured: UserContextTransport | null = transport) {
  return new Promise<{ status: number; data: unknown }>((resolve, reject) => {
    let status = 200
    const req = { method, url: path, query: Object.fromEntries(new URL(path, 'http://test').searchParams), headers: { authorization: `Bearer ${token}` }, body } as unknown as Request
    const res = { locals: {}, set: vi.fn(), status(value: number) { status = value; return this }, json(data: unknown) { resolve({ status, data }); return this } } as unknown as Response
    createMatchmakingRouter(configured)(req, res, reject)
  })
}
beforeEach(() => { mode = null; result = []; providerError = null; listingStatus = { isInterested: false, available: true }; listingMatches = []; groupQueue = { state: 'idle', proposal: null }; notifications = { notifications: [], unreadCount: 0 }; vi.clearAllMocks() })
afterEach(() => { vi.unstubAllGlobals() })

it('rejects service-role keys at both configuration and transport construction boundaries', () => {
  for (const key of ['sb_secret_private', `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ role: 'service_role' }))}.signature`]) {
    expect(() => parseApiEnv({ SUPABASE_URL: 'https://database.test', SUPABASE_PUBLISHABLE_KEY: key })).toThrow()
    expect(() => createUserContextTransport({ url: 'https://database.test', publicKey: key })).toThrow()
  }
})
it('validates the real user via getUser and forwards that JWT and public apikey to every fixed RPC', async () => {
  const calls: { name: string; token: string | null; key: string | null; body: unknown }[] = []
  const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const name = new URL(String(input)).pathname.split('/').pop()!
    const headers = new Headers(init?.headers)
    calls.push({ name, token: headers.get('Authorization'), key: headers.get('apikey'), body: init?.body ? JSON.parse(String(init.body)) : null })
    return Response.json(name === 'user' ? { id } : null)
  })
  const transport = createUserContextTransport({ url: 'https://database.test', publicKey: 'sb_publishable_test', verificationKey: 'service-verifier', fetch: mockFetch })
  expect(await transport.verify('user-jwt')).toEqual({ id })
  const client = transport.actor('user-jwt')
  await client.join('matchmaking'); await client.leave(); await client.status(); await client.result(); await client.profile(); await client.save(profile)
  expect(calls.map(call => call.name)).toEqual(['user', 'join_queue', 'leave_queue', 'get_queue_status', 'get_queue_match', 'get_matchmaking_profile', 'save_matchmaking_profile'])
  expect(calls.every(call => call.token === 'Bearer user-jwt')).toBe(true)
  expect(calls.slice(1).every(call => call.key === 'sb_publishable_test')).toBe(true)
  expect(calls[1].body).toEqual({ qtype: 'matchmaking' })
  expect(calls[6].body).toEqual({ profile_in: profile })
  await client.listingStatus(id); await client.listingInterest(id); await client.listingWithdraw(id); await client.listingMatches(id)
  expect(calls.slice(7).map(call => call.name)).toEqual(['get_listing_matchmaking_status', 'express_listing_matchmaking_interest', 'withdraw_listing_matchmaking_interest', 'get_listing_event_matches'])
  expect(calls.slice(7).every(call => call.token === 'Bearer user-jwt' && call.key === 'sb_publishable_test')).toBe(true)
  expect(calls.slice(7).map(call => call.body)).toEqual(Array(4).fill({ listing_id_in: id }))
  await client.groupQueue(id); await client.groupJoin(id); await client.groupLeave(id); await client.notifications(); await client.notificationRead(notificationId)
  expect(calls.slice(11).map(call => call.name)).toEqual(['get_event_group_queue', 'join_event_group_queue', 'leave_event_group_queue', 'get_matching_notifications', 'mark_matching_notification_read'])
  expect(calls.slice(11).every(call => call.token === 'Bearer user-jwt' && call.key === 'sb_publishable_test')).toBe(true)
  expect(calls.slice(11, 14).map(call => call.body)).toEqual(Array(3).fill({ listing_id_in: id }))
  expect(calls[15].body).toEqual({ notification_id_in: notificationId })
})
it('group enrollment/status/leave never calls scoring or imports old compatibility consent', async () => {
  expect(await request(`/events/${id}/group-queue`)).toEqual({ status: 200, data: { state: 'idle', proposal: null } })
  expect(await request(`/events/${id}/group-queue`, 'POST', {})).toEqual({ status: 200, data: { state: 'waiting', proposal: null } })
  expect(await request(`/events/${id}/group-queue`, 'DELETE')).toEqual({ status: 200, data: { state: 'idle', proposal: null } })
  for (const call of [actor.listingInterest, actor.listingMatches, actor.result]) expect(call).not.toHaveBeenCalled()
  actor.profile.mockResolvedValueOnce({ data: null as unknown as typeof profile, error: null })
  expect((await request(`/events/${id}/group-queue`, 'POST', {})).status).toBe(409)
  expect((await request(`/events/${id}/group-queue`, 'POST', { members: [id] })).status).toBe(400)
  providerError = { code: 'PGRST202' }
  expect((await request(`/events/${id}/group-queue`)).status).toBe(503)
})
it('only returns genuine 2–4 member proposals for the current actor/event with display fields', async () => {
  const members = [id, notificationId].map(id => ({ id, name: 'Sam', avatar: null, score: 1, bio: 'private', email: 'private' }))
  groupQueue = { state: 'proposal', proposal: { id: notificationId, eventId: id, members, raw_anchor: id } }
  expect(await request(`/events/${id}/group-queue`)).toEqual({ status: 200, data: { state: 'proposal', proposal: { id: notificationId, eventId: id, members: members.map(({ id, name, avatar }) => ({ id, name, avatar })) } } })
  for (const invalid of [[], [members[0]], [...members, ...members, members[0]], [members[1], members[1]]]) {
    groupQueue = { state: 'proposal', proposal: { id: notificationId, eventId: id, members: invalid } }
    expect((await request(`/events/${id}/group-queue`)).status).toBe(502)
  }
  groupQueue = { state: 'proposal', proposal: { id: notificationId, eventId: notificationId, members } }
  expect((await request(`/events/${id}/group-queue`)).status).toBe(502)
})
it('notifications are authenticated/allowlisted, reads explicit and unread counts validated', async () => {
  const item = { id: notificationId, eventId: id, proposalId: notificationId, title: 'Proposal to review', createdAt: '2026-10-09T00:00:00Z', readAt: null }
  notifications = { notifications: [{ ...item, actorId: id, email: 'private', note: 'private' }], unreadCount: 1, raw: 'private' }
  expect(await request('/notifications')).toEqual({ status: 200, data: { notifications: [item], unreadCount: 1 } })
  expect(actor.notificationRead).not.toHaveBeenCalled()
  notifications = { notifications: [{ ...item, readAt: '2026-10-09T01:00:00Z' }], unreadCount: 0 }
  expect((await request(`/notifications/${notificationId}/read`, 'POST', {})).status).toBe(200)
  expect(actor.notificationRead).toHaveBeenCalledWith(notificationId)
  expect((await request('/notifications', 'GET', undefined, 'forged')).status).toBe(401)
  expect((await request(`/notifications/${notificationId}/read`, 'POST', { actorId: id })).status).toBe(400)
  expect((await request('/notifications/not-uuid/read', 'POST', {})).status).toBe(400)
  notifications = { notifications: [item], unreadCount: 0 }
  expect((await request('/notifications')).status).toBe(502)
})
it('listing status and explicit opt-in/withdrawal use fixed actor methods without scoring', async () => {
  expect(await request(`/events/${id}/status`)).toEqual({ status: 200, data: listingStatus })
  expect(actor.profile).not.toHaveBeenCalled()
  expect(await request(`/events/${id}/interest`, 'POST', {})).toMatchObject({ status: 200, data: { isInterested: true, available: true } })
  listingStatus.available = false
  expect(await request(`/events/${id}/interest`, 'DELETE')).toEqual({ status: 200, data: { isInterested: false, available: false } })
  expect(actor.listingStatus).toHaveBeenCalledWith(id)
  expect(actor.listingInterest).toHaveBeenCalledWith(id)
  expect(actor.listingWithdraw).toHaveBeenCalledWith(id)
  expect(actor.listingMatches).not.toHaveBeenCalled()
})
it('listing routes reject invalid UUIDs, forged identities and actor injection before any listing RPC', async () => {
  expect((await request('/events/not-a-uuid/status')).status).toBe(400)
  expect((await request(`/events/${id}/interest`, 'POST', { actor_id: id })).status).toBe(400)
  expect((await request(`/events/${id}/interest`, 'DELETE', { user_id: id })).status).toBe(400)
  expect((await request(`/events/${id}/status?actor_id=${id}`)).status).toBe(400)
  expect((await request(`/events/${id}/interest`, 'POST', null)).status).toBe(400)
  expect((await request(`/events/${id}/status`, 'GET', undefined, 'forged')).status).toBe(401)
  expect(actor.listingStatus).not.toHaveBeenCalled()
  expect(actor.listingInterest).not.toHaveBeenCalled()
  expect(actor.listingWithdraw).not.toHaveBeenCalled()
})
it('listing scoring requires saved profile and separate opt-in, preserving ranked order and privacy', async () => {
  expect((await request(`/events/${id}/matches`)).status).toBe(409)
  expect(actor.listingMatches).not.toHaveBeenCalled()
  actor.profile.mockResolvedValueOnce({ data: null as unknown as typeof profile, error: null })
  expect((await request(`/events/${id}/interest`, 'POST', {})).status).toBe(409)
  expect(actor.listingInterest).not.toHaveBeenCalled()
  listingStatus = { isInterested: true, available: true }
  expect(await request(`/events/${id}/matches`)).toEqual({ status: 200, data: { candidates: [] } })
  const second = 'a0000000-0000-4000-8000-000000000002'
  listingMatches = [id, second].map(profile_id => ({ profile_id, display_name: 'Taylor', avatar_url: null, shared_interests: ['Coffee'], note: 'private note', bio: 'private bio', username: 'private username', match_score: .99 }))
  expect(await request(`/events/${id}/matches`)).toEqual({ status: 200, data: { candidates: [id, second].map(id => ({ id, name: 'Taylor', avatar: null, interests: ['Coffee'] })) } })
  listingStatus.available = false
  actor.listingMatches.mockClear()
  expect((await request(`/events/${id}/matches`)).status).toBe(409)
  expect(actor.listingMatches).not.toHaveBeenCalled()
})
it('listing errors remain honest: absent RPC, missing event, rejected prerequisite and malformed raw data', async () => {
  for (const [code, expected] of [['PGRST202', 503], ['PT404', 404], ['PT409', 409], ['28000', 401]]) {
    providerError = { code }
    expect((await request(`/events/${id}/status`)).status).toBe(expected)
  }
  providerError = null
  listingStatus = { isInterested: true, available: true }
  for (const raw of [null, [{ profile_id: id, display_name: 'Taylor', avatar_url: 'https://', shared_interests: [] }]]) {
    listingMatches = raw
    expect((await request(`/events/${id}/matches`)).status).toBe(502)
  }
  actor.listingStatus.mockResolvedValueOnce({ data: { isInterested: 'yes', available: true } as unknown as typeof listingStatus, error: null })
  expect((await request(`/events/${id}/status`)).status).toBe(502)
})
it('maps both modes, strips others count, invokes leave, and never scores automatically', async () => {
  for (const [input, qtype] of [['active', 'matchmaking'], ['downtime', 'downtime']]) {
    expect(await request('/queue', 'POST', { mode: input })).toEqual({ status: 200, data: { mode: input } })
    expect(actor.join).toHaveBeenLastCalledWith(qtype)
  }
  expect(await request('/status')).toEqual({ status: 200, data: { mode: 'downtime' } })
  expect(await request('/queue', 'DELETE')).toEqual({ status: 200, data: { mode: null } })
  expect(actor.result).not.toHaveBeenCalled()
})
it('rejects forged identity, invalid modes and injected actor IDs', async () => {
  expect((await request('/status', 'GET', undefined, 'forged')).status).toBe(401)
  expect((await request('/queue', 'POST', { mode: 'dating' })).status).toBe(400)
  expect((await request('/queue', 'POST', { mode: 'active', user_id: id })).status).toBe(400)
  expect(actor.join).not.toHaveBeenCalled()
  const invalidIdentity: UserContextTransport = { ...transport, verify: async () => ({ id: 'not-a-user-id' }) }
  expect((await request('/status', 'GET', undefined, 'user-jwt', invalidIdentity)).status).toBe(401)
})
it('allowlists one candidate, nullable meetup metadata and coarse overlap without private fields', async () => {
  mode = 'matchmaking'
  result = [{ queue_kind: 'matchmaking', match_profile_id: id, match_display_name: 'Taylor', match_avatar_url: null, shared_interests: ['Coffee'], overlap_minutes: 180, event_id: 7, event_title: null, event_location: null, event_starts_at: null, birthdate: '2000-01-01', latitude: 40, match_score: .8, shared_windows: [{ dow: 1 }], match_bio: 'private' }]
  expect(await request('/result')).toEqual({ status: 200, data: { candidate: { id, name: 'Taylor', avatar: null, interests: ['Coffee'], overlap: 'extended', mode: 'active', meetup: { id: 7, title: null, location: null, startsAt: null } } } })
})
it('distinguishes genuine empty, not queued, malformed, unavailable and provider failure', async () => {
  expect((await request('/result')).status).toBe(409)
  mode = 'downtime'
  expect(await request('/result')).toEqual({ status: 200, data: { candidate: null } })
  result = null
  expect((await request('/result')).status).toBe(502)
  expect((await request('/status', 'GET', undefined, 'user-jwt', null)).status).toBe(503)
  providerError = { code: 'PGRST202' }
  expect(await request('/profile', 'PUT', profile)).toEqual({ status: 503, data: { code: 'unavailable', error: 'Matching RPC is not available yet.' } })
  providerError = { code: 'XX000' }
  expect((await request('/result')).status).toBe(503)
})
it('compatibility preferences use one unified account writer, preserve private choices and reject unknown or overlapping fields', async () => {
  expect(await request('/profile')).toEqual({ status: 200, data: { profile } })
  expect(await request('/profile', 'PUT', profile)).toEqual({ status: 200, data: { profile } })
  expect(actor.saveAccount).toHaveBeenCalledWith(accountFixture(profile))
  expect(actor.save).not.toHaveBeenCalled()
  expect((await request('/profile', 'PUT', { ...profile, age: 21 })).status).toBe(400)
  expect(MatchingProfileSchema.safeParse({ ...profile, availability: [{ dow: 6, start_time: '21:00:00', end_time: '24:00:00' }] }).success).toBe(true)
  expect(MatchingProfileSchema.safeParse({ ...profile, availability: [{ dow: 6, start_time: '21:00:00', end_time: '00:00:00' }] }).success).toBe(false)
})
it('never interprets a null successful save response as persisted profile success', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ profile: null })))
  await expect(matchmakingClient('user-jwt').save(profile)).rejects.toMatchObject({ code: 'malformed', status: 502 })
})
it('malformed avatar strings never throw: invalid PUT is 400 and raw result is 502', async () => {
  for (const avatar of ['not a URL', 'https://', 'http://example.test/avatar.png']) {
    expect(() => MatchingProfileSchema.safeParse({ ...profile, avatar_url: avatar })).not.toThrow()
    expect(MatchingProfileSchema.safeParse({ ...profile, avatar_url: avatar }).success).toBe(false)
    expect(await request('/profile', 'PUT', { ...profile, avatar_url: avatar })).toMatchObject({ status: 400, data: { code: 'invalid' } })
    mode = 'matchmaking'
    result = [{ queue_kind: 'matchmaking', match_profile_id: id, match_display_name: 'Taylor', match_avatar_url: avatar, shared_interests: ['Coffee'], overlap_minutes: 60, event_id: null, event_title: null, event_location: null, event_starts_at: null }]
    expect(await request('/result')).toMatchObject({ status: 502, data: { code: 'malformed' } })
  }
  expect(actor.save).not.toHaveBeenCalled()
})
