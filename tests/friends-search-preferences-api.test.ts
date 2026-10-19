import type { Request, Response } from 'express'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMatchmakingRouter, createUserContextTransport, type UserContextTransport } from '../api/matchmaking'
import type { FriendsSearchPreferences, SaveFriendsSearchPreferences } from '../shared/friends-search-preferences'

const id = 'a0000000-0000-4000-8000-000000000001', other = 'a0000000-0000-4000-8000-000000000002'
const foreignRef = 'b0000000-0000-4000-8000-000000000002'
const preferences = { ageMin: 18, ageMax: 99, radiusMiles: 10, goals: [' Exact custom\ngoal '], searchArea: { source: 'home' as const, resolvedLocationRef: null } }
let stored: Map<string, FriendsSearchPreferences>, rpcError: string | null, malformed: boolean
const read = vi.fn(), write = vi.fn()
const transport = {
  verify: vi.fn(async (token: string) => token === 'first' ? { id } : token === 'second' ? { id: other } : null),
  actor: (token: string) => {
    const owner = token === 'first' ? id : other
    return {
      friendsSearchPreferences: async () => { read(owner); return { data: malformed ? null : stored.get(owner) ?? { revision: 0, preferences: null }, error: rpcError ? { code: rpcError } : null } },
      saveFriendsSearchPreferences: async (value: SaveFriendsSearchPreferences) => {
        write(owner, value)
        if (rpcError) return { data: null, error: { code: rpcError } }
        if (value.preferences.searchArea.resolvedLocationRef === foreignRef) return { data: null, error: { code: '22023' } }
        if (value.expectedRevision !== (stored.get(owner)?.revision ?? 0)) return { data: null, error: { code: 'FP409' } }
        const next = { revision: value.expectedRevision + 1, preferences: value.preferences }
        stored.set(owner, next)
        return { data: malformed ? { ...next, privateCoordinates: [0, 0] } : next, error: null }
      },
    }
  },
} as unknown as UserContextTransport
function request(method = 'GET', body?: unknown, token = 'first', path = '/friends-search-preferences', configured: UserContextTransport | null = transport) {
  return new Promise<{ status: number; data: unknown; cache: string }>((resolve, reject) => {
    let status = 200, cache = ''
    const req = { method, url: path, query: Object.fromEntries(new URL(path, 'http://test').searchParams), headers: token ? { authorization: `Bearer ${token}` } : {}, body } as unknown as Request
    const res = { locals: {}, set(name: string, value: string) { if (name === 'Cache-Control') cache = value; return this }, status(value: number) { status = value; return this }, json(data: unknown) { resolve({ status, data, cache }); return this } } as unknown as Response
    createMatchmakingRouter(configured)(req, res, error => error ? reject(error) : resolve({ status: 404, data: null, cache }))
  })
}
beforeEach(() => {
  stored = new Map(); rpcError = null; malformed = false; vi.clearAllMocks()
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network call') }))
})
afterEach(() => { vi.unstubAllGlobals() })
it('binds owner GET/PUT to verified actor and preserves exact goals without defaults or account writes', async () => {
  expect(await request()).toMatchObject({ status: 200, data: { revision: 0, preferences: null }, cache: 'no-store' })
  expect(await request('PUT', { expectedRevision: 0, preferences })).toMatchObject({ status: 200, data: { revision: 1, preferences } })
  expect(await request('GET', undefined, 'second')).toMatchObject({ status: 200, data: { revision: 0, preferences: null } })
  expect(write).toHaveBeenCalledWith(id, { expectedRevision: 0, preferences })
})
it('rejects auth/spoofing, unknown profile/Dating fields, invalid bounds and forged coordinates before writes', async () => {
  for (const token of ['', 'forged']) expect((await request('PUT', { expectedRevision: 0, preferences }, token)).status).toBe(401)
  for (const key of ['id', 'actorId', 'user_id', 'mode']) expect((await request('PUT', { expectedRevision: 0, preferences, [key]: other })).status).toBe(400)
  for (const patch of [{ radiusMiles: 0 }, { ageMin: 30, ageMax: 20 }, { goals: ['\u0000'] }, { dating: true }, { interests: [] }, { searchArea: { source: 'home', latitude: 1, resolvedLocationRef: null } }]) expect((await request('PUT', { expectedRevision: 0, preferences: { ...preferences, ...patch } })).status).toBe(400)
  expect((await request('GET', undefined, 'first', `/friends-search-preferences?user_id=${other}`)).status).toBe(400)
  expect((await request('GET', { user_id: other })).status).toBe(400)
  expect(write).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled()
})
it('preserves the snapshot on invalid location refs/stale CAS and rejects malformed mutation readback', async () => {
  await request('PUT', { expectedRevision: 0, preferences })
  const before = structuredClone(stored.get(id))
  expect(await request('PUT', { expectedRevision: 0, preferences })).toMatchObject({ status: 409, data: { code: 'conflict' } })
  expect((await request('PUT', { expectedRevision: 1, preferences: { ...preferences, searchArea: { source: 'home', resolvedLocationRef: foreignRef } } })).status).toBe(400)
  expect(stored.get(id)).toEqual(before)
  malformed = true
  expect(await request()).toMatchObject({ status: 502, data: { code: 'malformed' } })
  expect(await request('PUT', { expectedRevision: 1, preferences })).toMatchObject({ status: 502, data: { code: 'malformed' } })
})
it('fails unavailable/malformed honestly and never invokes queue/result/profile methods', async () => {
  const missing = { ...transport, actor: () => ({}) } as unknown as UserContextTransport
  expect((await request('GET', undefined, 'first', '/friends-search-preferences', missing)).status).toBe(503)
  expect((await request('PUT', { expectedRevision: 0, preferences }, 'first', '/friends-search-preferences', missing)).status).toBe(503)
  expect((await request('GET', undefined, 'first', '/friends-search-preferences', null)).status).toBe(503)
  for (const [code, status, kind] of [['LC409', 400, 'invalid'], ['PGRST202', 503, 'unavailable'], ['25001', 503, 'unavailable'], ['28000', 401, 'auth'], ['22P05', 400, 'invalid'], ['XX000', 503, 'provider']] as const) {
    rpcError = code
    expect(await request()).toMatchObject({ status, data: { code: kind } })
  }
  expect((await request('GET', undefined, 'first', '/friends-search-preferences/public')).status).toBe(404)
})
it('never interprets well-shaped but altered values or wrong revisions as mutation success', async () => {
  for (const data of [{ revision: 1, preferences: { ...preferences, goals: ['Rewritten goal'] } }, { revision: 2, preferences }, { revision: 0, preferences: null }]) {
    const wrong = { ...transport, actor: () => ({ saveFriendsSearchPreferences: async () => ({ data, error: null }) }) } as unknown as UserContextTransport
    expect(await request('PUT', { expectedRevision: 0, preferences }, 'first', '/friends-search-preferences', wrong)).toMatchObject({ status: 502, data: { code: 'malformed' } })
  }
})
it('uses the actual SDK with injected auth/RPC responses and forwards only the user JWT/public actor key', async () => {
  const calls: { name: string; token: string | null; key: string | null; body: unknown }[] = []
  const fetch: typeof globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const name = new URL(String(input)).pathname.split('/').pop()!, headers = new Headers(init?.headers)
    calls.push({ name, token: headers.get('Authorization'), key: headers.get('apikey'), body: init?.body ? JSON.parse(String(init.body)) : null })
    return name === 'user' ? Response.json({ id }) : name === 'get_friends_search_preferences' ? Response.json({ revision: 0, preferences: null }) : Response.json({ code: 'FP409', message: 'Conflict', details: null, hint: null }, { status: 400 })
  })
  const real = createUserContextTransport({ url: 'https://database.test', publicKey: 'sb_publishable_test', fetch })
  expect((await request('GET', undefined, 'first', '/friends-search-preferences', real)).status).toBe(200)
  expect(await request('PUT', { expectedRevision: 0, preferences }, 'first', '/friends-search-preferences', real)).toMatchObject({ status: 409, data: { code: 'conflict' } })
  expect(calls.map(call => call.name)).toEqual(['user', 'get_friends_search_preferences', 'user', 'save_friends_search_preferences'])
  expect(calls.every(call => call.token === 'Bearer first' && call.key === 'sb_publishable_test')).toBe(true)
  expect(calls[3].body).toEqual({ preferences_in: { expectedRevision: 0, preferences } })
})
