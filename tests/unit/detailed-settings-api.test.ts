import type { Request, Response } from 'express'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMatchmakingRouter, createUserContextTransport, type UserContextTransport } from '../../api/matchmaking'
import { emptyDetailedSettings, effectiveDetailedSettings, type DetailedSettings, type SaveDetailedSettings } from '../../shared/detailed-settings'

const id = 'a0000000-0000-4000-8000-000000000001', other = 'a0000000-0000-4000-8000-000000000002'
const choices = { messages: true, plans: false, matches: true, friendsDiscovery: true, datingDiscovery: false }
let stored: Map<string, { revision: number; settings: typeof choices }>, masters: DetailedSettings['masters'], rpcError: string | null
const reads = vi.fn(), writes = vi.fn()
const snapshot = (owner: string) => {
  const value = stored.get(owner) ?? { revision: 0, settings: emptyDetailedSettings() }
  const ownerMasters = owner === id ? masters : null
  return { ...value, masters: ownerMasters, effective: effectiveDetailedSettings(value.settings, ownerMasters) }
}
const transport = {
  verify: vi.fn(async (token: string) => token === 'first' ? { id } : token === 'second' ? { id: other } : null),
  actor: (token: string) => {
    const owner = token === 'first' ? id : other
    return {
      detailedSettings: async () => { reads(owner); return { data: snapshot(owner), error: rpcError ? { code: rpcError } : null } },
      saveDetailedSettings: async (value: SaveDetailedSettings) => {
        writes(owner, value)
        if (rpcError) return { data: null, error: { code: rpcError } }
        if (value.expectedRevision !== (stored.get(owner)?.revision ?? 0)) return { data: null, error: { code: 'DS409' } }
        stored.set(owner, { revision: value.expectedRevision + 1, settings: value.settings })
        return { data: snapshot(owner), error: null }
      },
    }
  },
} as unknown as UserContextTransport
function request(method = 'GET', body?: unknown, token = 'first', path = '/detailed-settings', configured: UserContextTransport | null = transport) {
  return new Promise<{ status: number; data: unknown; cache: string }>((resolve, reject) => {
    let status = 200, cache = ''
    const req = { method, url: path, query: Object.fromEntries(new URL(path, 'http://test').searchParams), headers: token ? { authorization: `Bearer ${token}` } : {}, body } as unknown as Request
    const res = { locals: {}, set(name: string, value: string) { if (name === 'Cache-Control') cache = value; return this }, status(value: number) { status = value; return this }, json(data: unknown) { resolve({ status, data, cache }); return this } } as unknown as Response
    createMatchmakingRouter(configured)(req, res, error => error ? reject(error) : resolve({ status: 404, data: null, cache }))
  })
}
beforeEach(() => {
  stored = new Map(); masters = { notifications: true, discoverable: true }; rpcError = null; vi.clearAllMocks()
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network request') }))
})
afterEach(() => { vi.unstubAllGlobals() })
it('reads safe virtual defaults, saves choices atomically and scopes readback to the actor', async () => {
  expect(await request()).toMatchObject({ status: 200, data: { revision: 0, settings: emptyDetailedSettings(), masters, effective: emptyDetailedSettings() }, cache: 'no-store' })
  expect(await request('PUT', { expectedRevision: 0, settings: choices })).toMatchObject({ status: 200, data: { revision: 1, settings: choices, effective: choices } })
  expect((await request('GET', undefined, 'second')).data).toMatchObject({ revision: 0, settings: emptyDetailedSettings(), masters: null })
  masters = { notifications: false, discoverable: false }
  expect((await request()).data).toMatchObject({ revision: 1, settings: choices, effective: emptyDetailedSettings() })
  expect(writes).toHaveBeenCalledWith(id, { expectedRevision: 0, settings: choices })
})
it('allows masters to change independently during a detailed save without claiming effective activation', async () => {
  await request()
  masters = { notifications: false, discoverable: false }
  expect(await request('PUT', { expectedRevision: 0, settings: choices })).toMatchObject({ status: 200, data: { revision: 1, settings: choices, masters, effective: emptyDetailedSettings() } })
})
it('rejects unauthenticated/injected/partial/legacy operational writes before mutation', async () => {
  for (const token of ['', 'forged']) expect((await request('PUT', { expectedRevision: 0, settings: choices }, token)).status).toBe(401)
  for (const body of [null, {}, { expectedRevision: 0, settings: { messages: true } }, { expectedRevision: 0, settings: { ...choices, plans: 1 } }, { expectedRevision: 0, settings: choices, user_id: other }, { expectedRevision: 0, settings: choices, masters }, { expectedRevision: 0, settings: { ...choices, availability: true } }, { expectedRevision: 0, settings: choices, downtime: true }]) expect((await request('PUT', body)).status).toBe(400)
  expect((await request('GET', undefined, 'first', `/detailed-settings?user_id=${other}`)).status).toBe(400)
  expect((await request('GET', { user_id: other })).status).toBe(400)
  expect(writes).not.toHaveBeenCalled(); expect(reads).not.toHaveBeenCalled()
})
it('returns distinct stale conflicts without replacing the last stored choices', async () => {
  await request('PUT', { expectedRevision: 0, settings: choices })
  expect(await request('PUT', { expectedRevision: 0, settings: emptyDetailedSettings() })).toMatchObject({ status: 409, data: { code: 'conflict' } })
  expect(stored.get(id)).toEqual({ revision: 1, settings: choices })
})
it('does not treat missing dependencies or malformed/wrong effective/readback output as success', async () => {
  expect((await request('GET', undefined, 'first', '/detailed-settings', null)).status).toBe(503)
  const missing = { ...transport, actor: () => ({}) } as unknown as UserContextTransport
  expect((await request('GET', undefined, 'first', '/detailed-settings', missing)).status).toBe(503)
  expect((await request('PUT', { expectedRevision: 0, settings: choices }, 'first', '/detailed-settings', missing)).status).toBe(503)
  for (const data of [null, { revision: 1, settings: choices, masters: null, effective: choices }, { revision: 1, settings: emptyDetailedSettings(), masters, effective: emptyDetailedSettings() }, { revision: 2, settings: choices, masters, effective: choices }]) {
    const malformed = { ...transport, actor: () => ({ detailedSettings: async () => ({ data: null, error: null }), saveDetailedSettings: async () => ({ data, error: null }) }) } as unknown as UserContextTransport
    expect((await request('GET', undefined, 'first', '/detailed-settings', malformed)).status).toBe(502)
    expect((await request('PUT', { expectedRevision: 0, settings: choices }, 'first', '/detailed-settings', malformed)).status).toBe(502)
  }
  expect((await request('GET', undefined, 'first', '/detailed-settings/public')).status).toBe(404)
})
it('maps fixed user-JWT SDK RPC error envelopes without service-role actor writes or retries', async () => {
  for (const [code, upstream, status, kind] of [['DS409', 400, 409, 'conflict'], ['28000', 403, 401, 'auth'], ['PGRST202', 404, 503, 'unavailable'], ['25001', 500, 503, 'unavailable'], ['22023', 400, 400, 'invalid'], ['XX000', 500, 503, 'provider']] as const) {
    const calls: { name: string; token: string | null; key: string | null; body: unknown }[] = []
    const fetch: typeof globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const name = new URL(String(input)).pathname.split('/').pop()!, headers = new Headers(init?.headers)
      calls.push({ name, token: headers.get('Authorization'), key: headers.get('apikey'), body: init?.body ? JSON.parse(String(init.body)) : null })
      return name === 'user' ? Response.json({ id }) : Response.json({ code, message: 'Synthetic error', details: null, hint: null }, { status: upstream })
    })
    const real = createUserContextTransport({ url: 'https://database.test', publicKey: 'sb_publishable_test', fetch })
    expect(await request('PUT', { expectedRevision: 0, settings: choices }, 'first', '/detailed-settings', real)).toMatchObject({ status, data: { code: kind } })
    expect(calls.map(call => call.name)).toEqual(['user', 'save_detailed_settings'])
    expect(calls.every(call => call.token === 'Bearer first' && call.key === 'sb_publishable_test')).toBe(true)
    expect(calls[1].body).toEqual({ settings_in: { expectedRevision: 0, settings: choices } })
  }
})
it('reads only the dedicated fixed RPC via the actual SDK, not defaulted get_account masters', async () => {
  const names: string[] = []
  const fetch: typeof globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const name = new URL(String(input)).pathname.split('/').pop()!; names.push(name)
    return Response.json(name === 'user' ? { id } : { revision: 0, settings: emptyDetailedSettings(), masters: null, effective: emptyDetailedSettings() })
  })
  const real = createUserContextTransport({ url: 'https://database.test', publicKey: 'sb_publishable_test', fetch })
  expect(await request('GET', undefined, 'first', '/detailed-settings', real)).toMatchObject({ status: 200, data: { masters: null, effective: emptyDetailedSettings() } })
  expect(names).toEqual(['user', 'get_detailed_settings'])
})
