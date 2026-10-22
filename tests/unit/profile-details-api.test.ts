import type { Request, Response } from 'express'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMatchmakingRouter, createUserContextTransport, type UserContextTransport } from '../../api/matchmaking'

const id = 'a0000000-0000-4000-8000-000000000001'
const other = 'a0000000-0000-4000-8000-000000000002'
const facts = { education: 'School', occupation: 'Work', languages: ['English'], visibility: { education: true, occupation: false, languages: false } }
const empty = { education: '', occupation: '', languages: [], visibility: { education: false, occupation: false, languages: false } }
let snapshots: Map<string, { revision: number; facts: typeof facts }>
let rpcError: { code: string } | null
let malformed: boolean
const reads = vi.fn(), writes = vi.fn(), verify = vi.fn(async (token: string) => token === 'first' ? { id } : token === 'second' ? { id: other } : null)
const transport = {
  verify,
  actor: vi.fn((token: string) => {
    const actorId = token === 'first' ? id : other
    return {
      profileDetails: async () => {
        reads(actorId)
        return { data: malformed ? { private: true } : snapshots.get(actorId) ?? { revision: 0, facts: empty }, error: rpcError }
      },
      saveProfileDetails: async (write: { expectedRevision: number; facts: typeof facts }) => {
        writes(actorId, write)
        if (rpcError) return { data: null, error: rpcError }
        const previous = snapshots.get(actorId) ?? { revision: 0, facts: empty }
        if (write.expectedRevision !== previous.revision) return { data: null, error: { code: 'PD409' } }
        const saved = { revision: previous.revision + 1, facts: structuredClone(write.facts) }
        snapshots.set(actorId, saved)
        return { data: malformed ? null : saved, error: null }
      },
    }
  }),
} as unknown as UserContextTransport

// Run the real Express router stack in memory, never listen or connect to a provider.
function request(method = 'GET', body?: unknown, token = 'first', path = '/profile-details', configured: UserContextTransport | null = transport) {
  return new Promise<{ status: number; data: unknown; headers: Record<string, string> }>((resolve, reject) => {
    let status = 200
    const headers: Record<string, string> = {}
    const req = { method, url: path, query: Object.fromEntries(new URL(path, 'http://test').searchParams), headers: token ? { authorization: `Bearer ${token}` } : {}, body } as unknown as Request
    const res = { locals: {}, set(name: string, value: string) { headers[name] = value; return this }, status(value: number) { status = value; return this }, json(data: unknown) { resolve({ status, data, headers }); return this } } as unknown as Response
    createMatchmakingRouter(configured)(req, res, error => error ? reject(error) : resolve({ status: 404, data: null, headers }))
  })
}
beforeEach(() => {
  snapshots = new Map(); rpcError = null; malformed = false; vi.clearAllMocks()
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unhandled network request forbidden in profile-details tests') }))
})
afterEach(() => { vi.unstubAllGlobals() })
it('requires verified authentication and rejects actor/query/body injection before resource calls', async () => {
  for (const token of ['', 'forged']) expect((await request('PUT', { expectedRevision: 0, facts }, token)).status).toBe(401)
  for (const key of ['id', 'user_id', 'actorId']) expect((await request('PUT', { expectedRevision: 0, facts, [key]: other })).status).toBe(400)
  expect((await request('GET', undefined, 'first', `/profile-details?user_id=${other}`)).status).toBe(400)
  expect((await request('GET', { user_id: other })).status).toBe(400)
  expect(reads).not.toHaveBeenCalled(); expect(writes).not.toHaveBeenCalled()
})
it('reads an honest empty revision and saves all facts/visibility for only the token owner', async () => {
  expect(await request()).toMatchObject({ status: 200, data: { revision: 0, facts: empty }, headers: { 'Cache-Control': 'no-store' } })
  expect(await request('PUT', { expectedRevision: 0, facts })).toMatchObject({ status: 200, data: { revision: 1, facts } })
  expect((await request('GET', undefined, 'second')).data).toEqual({ revision: 0, facts: empty })
  expect((await request()).data).toEqual({ revision: 1, facts })
  expect(writes).toHaveBeenCalledWith(id, { expectedRevision: 0, facts })
})
it('rejects invalid atomic payloads without writes and stale revisions with a distinct conflict', async () => {
  await request('PUT', { expectedRevision: 0, facts })
  const saved = structuredClone(snapshots.get(id))
  writes.mockClear()
  for (const body of [null, {}, { expectedRevision: 1, facts: { ...facts, languages: ['English', 'english'] } }, { expectedRevision: 1, facts: { ...facts, education: 'x'.repeat(121), visibility: { ...facts.visibility, occupation: true } } }]) expect((await request('PUT', body)).status).toBe(400)
  expect(writes).not.toHaveBeenCalled()
  expect(await request('PUT', { expectedRevision: 0, facts: { ...facts, education: 'Stale' } })).toMatchObject({ status: 409, data: { code: 'conflict' } })
  expect(snapshots.get(id)).toEqual(saved)
  expect((await request('PUT', { expectedRevision: 1, facts: empty })).data).toEqual({ revision: 2, facts: empty })
})
it('rejects PostgreSQL-unrepresentable Unicode before owner reads or writes', async () => {
  for (const value of ['\u0000', '\uD800', '\uDC00']) {
    for (const field of ['education', 'occupation', 'languages']) {
      const patch = { [field]: field === 'languages' ? [value] : value }
      expect(await request('PUT', { expectedRevision: 0, facts: { ...facts, ...patch } })).toMatchObject({ status: 400, data: { code: 'invalid' } })
    }
  }
  expect(reads).not.toHaveBeenCalled(); expect(writes).not.toHaveBeenCalled()
})
it('allows only one same-revision write in the injected model (not database concurrency evidence)', async () => {
  const results = await Promise.all([request('PUT', { expectedRevision: 0, facts }), request('PUT', { expectedRevision: 0, facts: empty })])
  expect(results.map(result => result.status).sort()).toEqual([200, 409])
  expect(snapshots.get(id)?.revision).toBe(1)
})
it('does not accept well-shaped but stale or mismatched save readback', async () => {
  for (const data of [{ revision: 0, facts }, { revision: 1, facts: empty }, { revision: 1, facts: { ...facts, user_id: other } }, { revision: 1, facts, user_id: other }]) {
    const wrongReadback = { ...transport, actor: () => ({ saveProfileDetails: async () => ({ data, error: null }) }) } as unknown as UserContextTransport
    expect(await request('PUT', { expectedRevision: 0, facts }, 'first', '/profile-details', wrongReadback)).toMatchObject({ status: 502, data: { code: 'malformed' } })
  }
})
it('handles unavailable dependencies, RPC auth/validation errors and malformed output without false success', async () => {
  expect((await request('GET', undefined, 'first', '/profile-details', null)).status).toBe(503)
  const missing = { ...transport, actor: () => ({}) } as unknown as UserContextTransport
  expect((await request('GET', undefined, 'first', '/profile-details', missing)).status).toBe(503)
  expect((await request('PUT', { expectedRevision: 0, facts }, 'first', '/profile-details', missing)).status).toBe(503)
  for (const [code, status, kind] of [['PGRST202', 503, 'unavailable'], ['42883', 503, 'unavailable'], ['28000', 401, 'auth'], ['22023', 400, 'invalid'], ['XX000', 503, 'provider']] as const) {
    rpcError = { code }
    expect(await request()).toMatchObject({ status, data: { code: kind } })
  }
  rpcError = null; malformed = true
  expect(await request()).toMatchObject({ status: 502, data: { code: 'malformed' } })
  expect(await request('PUT', { expectedRevision: 0, facts })).toMatchObject({ status: 502, data: { code: 'malformed' } })
  expect((await request('GET', undefined, 'first', '/profile-details/public')).status).toBe(404)
})
it('forwards the verified user JWT with public actor credentials to fixed facts RPCs only', async () => {
  const calls: { name: string; token: string | null; key: string | null; body: unknown }[] = []
  const mockFetch: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const name = new URL(String(input)).pathname.split('/').pop()!
    const headers = new Headers(init?.headers)
    calls.push({ name, token: headers.get('Authorization'), key: headers.get('apikey'), body: init?.body ? JSON.parse(String(init.body)) : null })
    return Response.json(name === 'user' ? { id } : { revision: 1, facts })
  })
  const real = createUserContextTransport({ url: 'https://database.test', publicKey: 'sb_publishable_test', fetch: mockFetch })
  expect(await real.verify('first')).toEqual({ id })
  await real.actor('first').profileDetails!()
  await real.actor('first').saveProfileDetails!({ expectedRevision: 0, facts })
  expect(calls.map(call => call.name)).toEqual(['user', 'get_profile_details', 'save_profile_details'])
  expect(calls.every(call => call.token === 'Bearer first')).toBe(true)
  expect(calls.slice(1).every(call => call.key === 'sb_publishable_test')).toBe(true)
  expect(calls[2].body).toEqual({ details_in: { expectedRevision: 0, facts } })
})
it('maps non-2xx PostgREST envelopes through the actual SDK and Express without retrying writes', async () => {
  for (const [code, upstreamStatus, status, kind] of [
    ['PD409', 400, 409, 'conflict'], ['28000', 403, 401, 'auth'], ['PGRST301', 401, 401, 'auth'],
    ['PGRST202', 404, 503, 'unavailable'], ['22P05', 400, 400, 'invalid'], ['22021', 400, 400, 'invalid'],
    ['25001', 500, 503, 'unavailable'],
  ] as const) {
    const mockFetch: typeof fetch = vi.fn(async (input: RequestInfo | URL) => new URL(String(input)).pathname.endsWith('/user')
      ? Response.json({ id })
      : Response.json({ code, message: 'Synthetic upstream error', details: null, hint: null }, { status: upstreamStatus }))
    const real = createUserContextTransport({ url: 'https://database.test', publicKey: 'sb_publishable_test', fetch: mockFetch })
    expect(await request('PUT', { expectedRevision: 0, facts }, 'first', '/profile-details', real)).toMatchObject({ status, data: { code: kind }, headers: { 'Cache-Control': 'no-store' } })
    expect(mockFetch).toHaveBeenCalledTimes(2) // verification plus one mutation
  }
})
