// @vitest-environment node
import express from 'express'
import { createClient } from '@supabase/supabase-js'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMeRouter, createProfilesRouter } from '../api/profile.js'

const userId = 'a0000000-0000-4000-8000-000000000001'
const otherId = '22222222-2222-2222-2222-222222222222'
const avatarFile = '0f0e0d0c-0b0a-4000-8000-000000000001.png'
const ownProfile = {
  id: userId, username: 'alex', display_name: 'Alex', bio: 'Coffee', pronouns: null, location_city: null, avatar_url: null,
  intents: [], interests: ['Coffee'], availability: [{ dow: 1, start_time: '15:00', end_time: '18:00' }], is_connected: false,
  birthdate: null, latitude: null, longitude: null, usual_times: [], max_distance_miles: 5, group_preference: 'either',
  onboarded_at: null, username_changeable_at: null, created_at: '2026-10-08T00:00:00+00:00', updated_at: '2026-10-08T00:00:00+00:00',
}
const otherProfile = { id: otherId, username: 'sam', display_name: 'Sam', bio: null, pronouns: null, location_city: null, avatar_url: null, intents: [], interests: [], availability: null, is_connected: false }
const settings = { notifications: true, discoverable: true, share_availability: true, nearby_suggestions: false, dating_enabled: false, downtime_matching: false, locale: null, timezone: null }
const sessionId = 'c0000000-0000-4000-8000-000000000001'
const otherSessionId = 'c0000000-0000-4000-8000-000000000002'
// Shaped like a Supabase access token; the mock auth server accepts it.
const jwt = (claims: Record<string, unknown>) => `x.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.y`
const requests: { method: string; path: URL; body: unknown }[] = []
let hasProfile = true
let usernameOwner: string | null = null
let rpcError: { code: string; message: string } | null = null
let reportCount = 0
let storedFiles: string[] = []
let mfaFactors: { id: string; status: string }[] = []
let exportCount = 0
let exportRows: { id: string; created_at: string; expires_at: string; path: string }[] = []
let authUpdate: { status: number; body: unknown } = { status: 200, body: {} }
const authRequests: { headers: Headers; body: unknown }[] = []
const authFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
  authRequests.push({ headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) })
  return new Response(JSON.stringify(authUpdate.body), { status: authUpdate.status, headers: { 'Content-Type': 'application/json' } })
}) as unknown as typeof fetch

const databaseFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const path = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
  const method = init?.method ?? 'GET'
  const body = init?.body ? JSON.parse(String(init.body)) : null
  requests.push({ method, path, body })
  const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(status === 204 ? null : JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } })
  const p = path.pathname
  if (p === '/auth/v1/user') {
    const authorization = new Headers(init?.headers).get('authorization') ?? ''
    return authorization === 'Bearer valid-session' || authorization.startsWith('Bearer x.')
      ? json({ id: userId, email: 'alex@example.com', new_email: null, created_at: '2026-10-01T00:00:00Z', app_metadata: { providers: ['email'] }, user_metadata: {}, factors: mfaFactors })
      : json({ message: 'Invalid token' }, 401)
  }
  if (p.startsWith('/auth/v1/admin/users/')) return json({})
  if (p.endsWith('/rpc/profile_snapshot')) {
    if (body.p_user_id === userId) return json(hasProfile ? ownProfile : null)
    return json(body.p_user_id === otherId ? otherProfile : null)
  }
  if (p.endsWith('/rpc/save_profile')) return rpcError ? json(rpcError, 400) : json(null)
  if (p.endsWith('/rpc/block_user')) return rpcError ? json(rpcError, 400) : json(body.p_blocked_id === otherId)
  if (p.endsWith('/rpc/list_sessions')) return json([
    { id: sessionId, created_at: '2026-10-08T00:00:00+00:00', last_active_at: '2026-10-08T01:00:00+00:00', user_agent: 'Firefox', ip: '127.0.0.1', aal: 'aal1' },
    { id: otherSessionId, created_at: '2026-10-07T00:00:00+00:00', last_active_at: '2026-10-07T01:00:00+00:00', user_agent: null, ip: null, aal: 'aal1' },
  ])
  if (p.endsWith('/rpc/revoke_sessions')) return json(body.p_session_id === 'c0000000-0000-4000-8000-000000000099' ? 0 : 1)
  if (p.endsWith('/rpc/export_user_data')) return json({ profile: { username: 'alex' }, interests: [] })
  if (p.endsWith('/data_export_requests')) {
    if (method === 'HEAD') return json(null, 200, { 'Content-Range': `*/${exportCount}` })
    if (method === 'POST') return json({ ...body, created_at: '2026-10-08T00:00:00+00:00', expires_at: '2026-10-15T00:00:00+00:00' }, 201)
    if (method === 'DELETE') return json(null, 204)
    return json(exportRows)
  }
  if (p.startsWith('/storage/v1/object/exports/') && method === 'POST') return json({ Key: p })
  if (p.startsWith('/storage/v1/object/sign/exports/')) return json({ signedURL: `/object/sign/exports/${p.split('/exports/')[1]}?token=download` })
  if (p === '/storage/v1/object/list/exports') return json([])
  if (p === '/storage/v1/object/exports' && method === 'DELETE') return json([])
  if (p.endsWith('/rpc/blocked_users')) return json([{ id: otherId, username: 'sam', display_name: 'Sam', avatar_url: null, blocked_at: '2026-10-08T00:00:00+00:00' }])
  if (p.endsWith('/user_settings')) {
    if (!hasProfile) return json(null, 406)
    return json(method === 'PATCH' ? { ...settings, ...body } : settings)
  }
  if (p.endsWith('/profiles')) {
    if (path.searchParams.get('username')) return usernameOwner ? json({ id: usernameOwner }) : json(null, 406)
    if (method === 'PATCH') return json(null, 204)
    return hasProfile ? json({ id: userId }) : json(null, 406)
  }
  if (p.endsWith('/user_reports')) return method === 'HEAD' ? json(null, 200, { 'Content-Range': `*/${reportCount}` }) : json(null, 201)
  if (p.endsWith('/blocks')) return json(null, 204)
  if (p.startsWith('/storage/v1/object/upload/sign/avatars/')) return json({ url: `/object/upload/sign/avatars/${p.split('/avatars/')[1]}?token=upload-token` })
  if (p === '/storage/v1/object/list/avatars') return json(storedFiles.map(name => ({ name })))
  if (p === '/storage/v1/object/avatars' && method === 'DELETE') return json([])
  return json({ message: `Unhandled ${method} ${p}` }, 500)
})
const client = createClient('http://database.test', 'service-key', { global: { fetch: databaseFetch }, auth: { persistSession: false, autoRefreshToken: false } })
const app = express()
app.use(express.json())
app.use('/api/me', createMeRouter(client, { url: 'http://database.test', key: 'service-key', fetch: authFetch }))
app.use('/api/profiles', createProfilesRouter(client))
app.use('/unconfigured', createMeRouter(null))
const server = app.listen(0, '127.0.0.1')
let url: string
beforeAll(async () => {
  if (!server.listening) await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject) })
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())))
beforeEach(() => {
  requests.length = 0; authRequests.length = 0; hasProfile = true; usernameOwner = null; rpcError = null; reportCount = 0; storedFiles = []
  mfaFactors = []; exportCount = 0; exportRows = []; authUpdate = { status: 200, body: {} }
})

const auth = { Authorization: 'Bearer valid-session', 'Content-Type': 'application/json' }
const send = (method: string, path: string, body?: unknown, headers: Record<string, string> = auth) =>
  fetch(`${url}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
const rpcBody = (name: string) => requests.find(request => request.path.pathname.endsWith(`/rpc/${name}`))?.body

describe('own profile API', () => {
  it('requires a verified session', async () => {
    expect((await send('GET', '/api/me', undefined, {})).status).toBe(401)
    expect((await send('GET', '/api/me', undefined, { Authorization: 'Bearer forged' })).status).toBe(401)
    expect(requests.some(request => request.path.pathname.includes('/rpc/'))).toBe(false)
  })
  it('returns account, profile, and settings, and records last seen', async () => {
    const response = await send('GET', '/api/me')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ account: { id: userId, email: 'alex@example.com', created_at: '2026-10-01T00:00:00Z', pending_email: null, providers: ['email'], mfa_enabled: false }, profile: ownProfile, settings })
    expect(requests.find(request => request.method === 'PATCH' && request.path.pathname.endsWith('/profiles'))?.body).toHaveProperty('last_seen_at')
  })
  it('returns a null profile before onboarding', async () => {
    hasProfile = false
    expect(await (await send('GET', '/api/me')).json()).toMatchObject({ profile: null, settings: null })
  })
  it('saves using the verified identity and splits interests and availability', async () => {
    const response = await send('PATCH', '/api/me/profile', { username: ' Alex_1 ', display_name: 'Alex', interests: ['Coffee', 'Music'], availability: [{ dow: 1, start_time: '15:00', end_time: '18:00' }], onboarded: true })
    expect(response.status).toBe(200)
    expect(rpcBody('save_profile')).toEqual({
      p_user_id: userId, p_profile: { username: 'alex_1', display_name: 'Alex', onboarded: true },
      p_interests: ['Coffee', 'Music'], p_availability: [{ dow: 1, start_time: '15:00', end_time: '18:00' }],
    })
  })
  it('passes nulls through to clear fields and leaves absent sets untouched', async () => {
    await send('PATCH', '/api/me/profile', { bio: null })
    expect(rpcBody('save_profile')).toEqual({ p_user_id: userId, p_profile: { bio: null }, p_interests: null, p_availability: null })
  })
  it('rejects invalid edits before touching the database', async () => {
    for (const body of [
      { id: otherId }, { avatar_url: 'https://evil.test/x.png' }, { username: 'no spaces' }, { display_name: '' },
      { bio: 'x'.repeat(161) }, { latitude: 10 }, { latitude: 10, longitude: null }, { birthdate: new Date().toISOString().slice(0, 10) },
      { interests: ['Coffee', 'coffee'] }, { group_preference: 'crowd' }, { max_distance_miles: 0 },
      { availability: [{ dow: 1, start_time: '18:00', end_time: '15:00' }] },
      { availability: [{ dow: 1, start_time: '10:00', end_time: '12:00' }, { dow: 1, start_time: '11:00', end_time: '13:00' }] },
    ]) expect((await send('PATCH', '/api/me/profile', body)).status, JSON.stringify(body)).toBe(400)
    expect(requests).toHaveLength(0)
  })
  it('maps database constraint failures to client errors', async () => {
    rpcError = { code: '23505', message: 'duplicate key' }
    expect((await send('PATCH', '/api/me/profile', { username: 'sam' })).status).toBe(409)
    rpcError = { code: '22023', message: 'A new profile needs a username and display name' }
    const response = await send('PATCH', '/api/me/profile', { bio: 'hi' })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'A new profile needs a username and display name' })
    rpcError = { code: 'PU429', message: 'You can change your username once every 30 days' }
    expect((await send('PATCH', '/api/me/profile', { username: 'alex_2' })).status).toBe(429)
    rpcError = { code: '42P01', message: 'boom' }
    expect((await send('PATCH', '/api/me/profile', { bio: 'hi' })).status).toBe(503)
  })
  it('checks username availability, treating your own as available', async () => {
    expect(await (await send('GET', '/api/me/username?username=Sam')).json()).toEqual({ username: 'sam', available: true })
    usernameOwner = otherId
    expect(await (await send('GET', '/api/me/username?username=sam')).json()).toMatchObject({ available: false })
    usernameOwner = userId
    expect(await (await send('GET', '/api/me/username?username=alex')).json()).toMatchObject({ available: true })
    expect((await send('GET', '/api/me/username?username=a')).status).toBe(400)
  })
  it('reports missing configuration clearly', async () => {
    expect((await fetch(`${url}/unconfigured`)).status).toBe(503)
  })
})

describe('settings API', () => {
  it('reads and partially updates settings', async () => {
    expect(await (await send('GET', '/api/me/settings')).json()).toEqual(settings)
    const response = await send('PATCH', '/api/me/settings', { discoverable: false })
    expect(await response.json()).toEqual({ ...settings, discoverable: false })
    const update = requests.find(request => request.method === 'PATCH')!
    expect(update.body).toEqual({ discoverable: false })
    expect(update.path.searchParams.get('profile_id')).toBe(`eq.${userId}`)
  })
  it('rejects empty, unknown, or invalid settings', async () => {
    for (const body of [{}, { theme: 'dark' }, { notifications: 'yes' }, { dating_enabled: 1 }, { locale: 'not a locale!' }, { timezone: 'Mars/Olympus' }]) {
      expect((await send('PATCH', '/api/me/settings', body)).status, JSON.stringify(body)).toBe(400)
    }
  })
  it('normalizes locale and accepts IANA time zones or null to follow the device', async () => {
    await send('PATCH', '/api/me/settings', { locale: 'en-us', timezone: 'America/New_York', dating_enabled: true, downtime_matching: true })
    expect(requests.find(request => request.method === 'PATCH')!.body).toEqual({ locale: 'en-US', timezone: 'America/New_York', dating_enabled: true, downtime_matching: true })
    requests.length = 0
    await send('PATCH', '/api/me/settings', { locale: null, timezone: null })
    expect(requests.find(request => request.method === 'PATCH')!.body).toEqual({ locale: null, timezone: null })
  })
  it('asks for a profile first', async () => {
    hasProfile = false
    expect((await send('GET', '/api/me/settings')).status).toBe(404)
    expect((await send('PATCH', '/api/me/settings', { notifications: false })).status).toBe(404)
  })
})

describe('avatar API', () => {
  it('signs uploads into the caller\'s folder only', async () => {
    const response = await send('POST', '/api/me/avatar', { content_type: 'image/png' })
    expect(response.status).toBe(201)
    const upload = await response.json()
    expect(upload.path).toMatch(new RegExp(`^${userId}/[0-9a-f-]{36}\\.png$`))
    expect(upload.public_url).toBe(`http://database.test/storage/v1/object/public/avatars/${upload.path}`)
    expect(upload.token).toBe('upload-token')
    expect((await send('POST', '/api/me/avatar', { content_type: 'image/gif' })).status).toBe(400)
  })
  it('saves an uploaded avatar and removes older files', async () => {
    storedFiles = ['old.jpg', avatarFile]
    expect((await send('PUT', '/api/me/avatar', { path: `${userId}/${avatarFile}` })).status).toBe(200)
    expect(rpcBody('save_profile')).toEqual({ p_user_id: userId, p_profile: { avatar_url: `http://database.test/storage/v1/object/public/avatars/${userId}/${avatarFile}` } })
    expect(requests.find(request => request.method === 'DELETE')?.body).toEqual({ prefixes: [`${userId}/old.jpg`] })
  })
  it('refuses other users\' paths and missing uploads', async () => {
    expect((await send('PUT', '/api/me/avatar', { path: `${otherId}/${avatarFile}` })).status).toBe(400)
    expect((await send('PUT', '/api/me/avatar', { path: `${userId}/../${avatarFile}` })).status).toBe(400)
    expect((await send('PUT', '/api/me/avatar', { path: `${userId}/${avatarFile}` })).status).toBe(404)
    expect(rpcBody('save_profile')).toBeUndefined()
  })
  it('clears the avatar', async () => {
    storedFiles = [avatarFile]
    expect((await send('DELETE', '/api/me/avatar')).status).toBe(200)
    expect(rpcBody('save_profile')).toEqual({ p_user_id: userId, p_profile: { avatar_url: null } })
  })
})

describe('account deletion', () => {
  it('requires explicit confirmation', async () => {
    expect((await send('DELETE', '/api/me', {})).status).toBe(400)
    expect(requests.some(request => request.path.pathname.startsWith('/auth/v1/admin'))).toBe(false)
  })
  it('deletes avatars and the verified auth user', async () => {
    storedFiles = [avatarFile]
    expect((await send('DELETE', '/api/me', { confirm: 'DELETE' })).status).toBe(204)
    expect(requests.find(request => request.path.pathname.startsWith('/auth/v1/admin'))?.path.pathname).toBe(`/auth/v1/admin/users/${userId}`)
  })
})

describe('other profiles and safety', () => {
  it('shows public profiles to signed-in users only', async () => {
    expect((await send('GET', `/api/profiles/${otherId}`, undefined, {})).status).toBe(401)
    const response = await send('GET', `/api/profiles/${otherId}`)
    expect(await response.json()).toEqual(otherProfile)
    expect(rpcBody('profile_snapshot')).toEqual({ p_user_id: otherId, p_viewer_id: userId })
  })
  it('hides unavailable profiles and rejects bad IDs', async () => {
    expect((await send('GET', '/api/profiles/a0000000-0000-4000-8000-000000000099')).status).toBe(404)
    expect((await send('GET', '/api/profiles/not-a-uuid')).status).toBe(400)
  })
  it('blocks and unblocks', async () => {
    expect((await send('POST', `/api/profiles/${otherId}/block`)).status).toBe(204)
    expect(rpcBody('block_user')).toEqual({ p_blocker_id: userId, p_blocked_id: otherId })
    expect((await send('POST', '/api/profiles/a0000000-0000-4000-8000-000000000099/block')).status).toBe(404)
    rpcError = { code: '22023', message: 'You cannot block yourself' }
    expect((await send('POST', `/api/profiles/${userId}/block`)).status).toBe(400)
    expect((await send('DELETE', `/api/profiles/${otherId}/block`)).status).toBe(204)
    expect(await (await send('GET', '/api/me/blocks')).json()).toEqual({ blocked: [expect.objectContaining({ id: otherId })] })
  })
  it('files reports with validation and a daily limit', async () => {
    expect((await send('POST', `/api/profiles/${otherId}/report`, { reason: 'spam' })).status).toBe(400)
    expect((await send('POST', `/api/profiles/${userId}/report`, { reason: 'other' })).status).toBe(400)
    expect((await send('POST', `/api/profiles/${otherId}/report`, { reason: 'harassment', details: ' context ' })).status).toBe(201)
    expect(requests.find(request => request.method === 'POST' && request.path.pathname.endsWith('/user_reports'))?.body)
      .toEqual({ reporter_id: userId, reported_id: otherId, reason: 'harassment', details: 'context' })
    reportCount = 10
    expect((await send('POST', `/api/profiles/${otherId}/report`, { reason: 'other' })).status).toBe(429)
  })
})

describe('account security', () => {
  it('changes email through Supabase Auth as the user', async () => {
    const response = await send('POST', '/api/me/email', { email: ' New@Example.com ' })
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ pending_email: 'new@example.com' })
    expect(authRequests[0].body).toEqual({ email: 'new@example.com' })
    expect(authRequests[0].headers.get('authorization')).toBe('Bearer valid-session')
  })
  it('rejects invalid, unchanged, or taken emails', async () => {
    expect((await send('POST', '/api/me/email', { email: 'nope' })).status).toBe(400)
    expect((await send('POST', '/api/me/email', { email: 'alex@example.com' })).status).toBe(400)
    authUpdate = { status: 422, body: { error_code: 'email_exists', msg: 'exists' } }
    expect((await send('POST', '/api/me/email', { email: 'taken@example.com' })).status).toBe(409)
  })
  it('sets passwords and surfaces Supabase password rules', async () => {
    expect((await send('POST', '/api/me/password', { password: 'short' })).status).toBe(400)
    expect(authRequests).toHaveLength(0)
    expect((await send('POST', '/api/me/password', { password: 'a long passphrase' })).status).toBe(204)
    expect(authRequests[0].body).toEqual({ password: 'a long passphrase' })
    authUpdate = { status: 422, body: { error_code: 'weak_password', msg: 'Password is known to be weak' } }
    const weak = await send('POST', '/api/me/password', { password: 'password123' })
    expect(weak.status).toBe(400)
    expect(await weak.json()).toEqual({ error: 'Password is known to be weak' })
  })
  it('requires a two-factor-verified session for sensitive actions once MFA is enabled', async () => {
    mfaFactors = [{ id: 'f1', status: 'verified' }]
    const aal1 = { ...auth, Authorization: `Bearer ${jwt({ session_id: sessionId, aal: 'aal1' })}` }
    for (const [method, path, body] of [['POST', '/api/me/email', { email: 'new@example.com' }], ['POST', '/api/me/password', { password: 'a long passphrase' }],
      ['DELETE', '/api/me', { confirm: 'DELETE' }], ['DELETE', '/api/me/sessions', undefined], ['POST', '/api/me/exports', undefined]] as const) {
      const response = await send(method, path, body, aal1)
      expect(response.status, path).toBe(403)
      expect(await response.json()).toMatchObject({ code: 'mfa_required' })
    }
    expect(authRequests).toHaveLength(0)
    const aal2 = { ...auth, Authorization: `Bearer ${jwt({ session_id: sessionId, aal: 'aal2' })}` }
    expect((await send('POST', '/api/me/password', { password: 'a long passphrase' }, aal2)).status).toBe(204)
    expect((await (await send('GET', '/api/me', undefined, aal2)).json()).account.mfa_enabled).toBe(true)
  })
})

describe('sessions API', () => {
  const current = { ...auth, Authorization: `Bearer ${jwt({ session_id: sessionId, aal: 'aal1' })}` }
  it('lists sessions and marks the current one', async () => {
    const { sessions } = await (await send('GET', '/api/me/sessions', undefined, current)).json()
    expect(sessions.map((session: { id: string; current: boolean }) => [session.id, session.current])).toEqual([[sessionId, true], [otherSessionId, false]])
  })
  it('signs out other devices but keeps the current session', async () => {
    expect(await (await send('DELETE', '/api/me/sessions', undefined, current)).json()).toEqual({ revoked: 1 })
    expect(rpcBody('revoke_sessions')).toEqual({ p_user_id: userId, p_session_id: null, p_keep: sessionId })
  })
  it('signs out a single session', async () => {
    expect((await send('DELETE', `/api/me/sessions/${otherSessionId}`, undefined, current)).status).toBe(204)
    expect(rpcBody('revoke_sessions')).toEqual({ p_user_id: userId, p_session_id: otherSessionId })
    expect((await send('DELETE', '/api/me/sessions/c0000000-0000-4000-8000-000000000099', undefined, current)).status).toBe(404)
    expect((await send('DELETE', '/api/me/sessions/nope', undefined, current)).status).toBe(400)
  })
})

describe('data export API', () => {
  it('builds an export into the caller\'s private folder and returns a download link', async () => {
    const response = await send('POST', '/api/me/exports')
    expect(response.status).toBe(201)
    const created = await response.json()
    expect(created.download_url).toMatch(/\/storage\/v1\/object\/sign\/exports\/a0000000-0000-4000-8000-000000000001\/[0-9a-f-]{36}\.json\?token=download/)
    const upload = requests.find(request => request.method === 'POST' && request.path.pathname.startsWith('/storage/v1/object/exports/'))!
    expect(upload.path.pathname).toBe(`/storage/v1/object/exports/${userId}/${created.id}.json`)
    expect(upload.body).toMatchObject({ account: { id: userId, email: 'alex@example.com' }, profile: { username: 'alex' } })
    expect(rpcBody('export_user_data')).toEqual({ p_user_id: userId })
  })
  it('limits exports to one a day', async () => {
    exportCount = 1
    expect((await send('POST', '/api/me/exports')).status).toBe(429)
    expect(rpcBody('export_user_data')).toBeUndefined()
  })
  it('lists live exports and deletes expired ones', async () => {
    exportRows = [
      { id: 'e0000000-0000-4000-8000-000000000001', created_at: '2099-01-01T00:00:00+00:00', expires_at: '2099-01-08T00:00:00+00:00', path: `${userId}/live.json` },
      { id: 'e0000000-0000-4000-8000-000000000002', created_at: '2020-01-01T00:00:00+00:00', expires_at: '2020-01-08T00:00:00+00:00', path: `${userId}/old.json` },
    ]
    const { exports } = await (await send('GET', '/api/me/exports')).json()
    expect(exports.map((item: { id: string }) => item.id)).toEqual(['e0000000-0000-4000-8000-000000000001'])
    expect(requests.find(request => request.method === 'DELETE' && request.path.pathname === '/storage/v1/object/exports')?.body).toEqual({ prefixes: [`${userId}/old.json`] })
    expect(requests.find(request => request.method === 'DELETE' && request.path.pathname.endsWith('/data_export_requests'))?.path.searchParams.get('id')).toBe('in.(e0000000-0000-4000-8000-000000000002)')
  })
})
