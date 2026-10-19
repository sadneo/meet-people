import type { Request, Response } from 'express'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { createMatchmakingRouter, createUserContextTransport, type UserContextTransport } from '../api/matchmaking'
import { adultOn, emptyDatingProfile, datingEffectiveEnabled, validDatingTransition, type DatingAggregate, type SaveDatingAggregate } from '../shared/dating'

const first = 'a0000000-0000-4000-8000-000000000001', second = 'a0000000-0000-4000-8000-000000000002'
const asOf = '2026-10-19'
const draft: SaveDatingAggregate = { expectedProfileRevision: 0, expectedSearchRevision: 0, profile: { ...emptyDatingProfile(), gender: 'Legacy identity', sexuality: 'Queer', heightInches: 60 }, search: { ageMin: 18, ageMax: 40, radiusMiles: 5, searchArea: { source: 'temporary', areaLabel: ' Campus ', resolvedLocationRef: null } } }
let stored: Map<string, SaveDatingAggregate>, dob: unknown, error: string | null, badRead: boolean
const writes = vi.fn(), reads = vi.fn()
function snapshot(owner: string): DatingAggregate {
  const value = stored.get(owner)
  const profile = value?.profile ?? emptyDatingProfile(), search = value?.search ?? null
  const eligibility = { asOf, adult: adultOn(dob, asOf), locationResolved: false }
  return { profileRevision: value ? value.expectedProfileRevision + 1 : 0, searchRevision: value ? value.expectedSearchRevision + 1 : 0, profile, search, eligibility, effectiveEnabled: datingEffectiveEnabled(profile, search, eligibility.adult, eligibility.locationResolved) }
}
const transport = {
  verify: vi.fn(async (token: string) => token === 'first' ? { id: first } : token === 'second' ? { id: second } : null),
  actor: (token: string) => {
    const owner = token === 'first' ? first : second
    return {
      datingAggregate: async () => { reads(owner); return { data: badRead ? null : snapshot(owner), error: error ? { code: error } : null } },
      saveDatingAggregate: async (value: SaveDatingAggregate) => {
        writes(owner, value)
        if (error) return { data: null, error: { code: error } }
        const before = snapshot(owner)
        if (before.profileRevision !== value.expectedProfileRevision || before.searchRevision !== value.expectedSearchRevision) return { data: null, error: { code: 'DA409' } }
        if (!validDatingTransition(before.profile, value.profile) || (value.profile.enabled && !adultOn(dob, asOf))) return { data: null, error: { code: '22023' } }
        stored.set(owner, structuredClone(value))
        return { data: snapshot(owner), error: null }
      },
    }
  },
} as unknown as UserContextTransport
function request(method = 'GET', body?: unknown, token = 'first', path = '/dating-preferences', configured: UserContextTransport | null = transport) {
  return new Promise<{ status: number; data: unknown; cache: string }>((resolve, reject) => {
    let status = 200, cache = ''
    const req = { method, url: path, query: Object.fromEntries(new URL(path, 'http://test').searchParams), headers: token ? { authorization: `Bearer ${token}` } : {}, body } as unknown as Request
    const res = { locals: {}, set(name: string, value: string) { if (name === 'Cache-Control') cache = value; return this }, status(value: number) { status = value; return this }, json(data: unknown) { resolve({ status, data, cache }); return this } } as unknown as Response
    createMatchmakingRouter(configured)(req, res, failure => failure ? reject(failure) : resolve({ status: 404, data: null, cache }))
  })
}
beforeEach(() => { stored = new Map(); dob = '2000-01-01'; error = null; badRead = false; vi.clearAllMocks(); vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network') })) })
afterEach(() => vi.unstubAllGlobals())
it('reads owner-only default-off state and saves an aggregate with canonical GET, preserving zero remainder and custom labels', async () => {
  expect(await request()).toMatchObject({ status: 200, cache: 'no-store', data: { profileRevision: 0, searchRevision: 0, effectiveEnabled: false } })
  expect(await request('PUT', draft)).toMatchObject({ status: 200, data: { profileRevision: 1, searchRevision: 1, profile: draft.profile, search: draft.search } })
  expect(reads.mock.calls.map(call => call[0])).toEqual([first, first])
  expect((await request('GET', undefined, 'second')).data).toMatchObject({ profileRevision: 0, profile: emptyDatingProfile() })
  expect(writes).toHaveBeenCalledTimes(1)
})
it.each(['absent', 'empty-draft'] as const)('allows a first clarified ambiguous identity in one save from %s', async previous => {
  let revision = 0
  if (previous === 'empty-draft') {
    expect((await request('PUT', { ...draft, profile: emptyDatingProfile(), search: null })).status).toBe(200)
    revision = 1
  }
  const value = { ...draft, expectedProfileRevision: revision, expectedSearchRevision: revision, profile: { ...draft.profile, clarifiedTargets: ['Man'] } }
  expect(await request('PUT', value)).toMatchObject({ status: 200, data: { profileRevision: revision + 1, searchRevision: revision + 1, profile: value.profile } })
  expect(stored.get(first)).toEqual(value)
  expect(writes).toHaveBeenCalledTimes(revision + 1)
})
it.each(['gender', 'sexuality'] as const)('requires cleared clarification when completing a partial prior %s identity', async field => {
  const partial = { ...emptyDatingProfile(), [field]: draft.profile[field] }
  expect((await request('PUT', { ...draft, profile: partial })).status).toBe(200)
  const next = { ...draft, expectedProfileRevision: 1, expectedSearchRevision: 1, profile: { ...draft.profile, clarifiedTargets: ['Man'] } }
  expect((await request('PUT', next)).status).toBe(400)
  expect(snapshot(first).profile).toEqual(partial)
  expect((await request('PUT', { ...next, profile: { ...next.profile, clarifiedTargets: [] } })).status).toBe(200)
})
it.each(['22023', '28000', 'PGRST202', 'malformed', 'throw', 'divergent'])('treats post-save GET %s as uncertain without rollback claims or retries', async failure => {
  const calls: string[] = []
  const configured = { ...transport, actor: () => ({
    saveDatingAggregate: async (value: SaveDatingAggregate) => { calls.push('save'); stored.set(first, structuredClone(value)); return { data: snapshot(first), error: null } },
    datingAggregate: async () => {
      calls.push('read')
      if (failure === 'throw') throw new Error('Synthetic transport failure')
      if (failure === 'malformed') return { data: null, error: null }
      if (failure === 'divergent') return { data: { ...snapshot(first), searchRevision: 2 }, error: null }
      return { data: null, error: { code: failure } }
    },
  }) } as unknown as UserContextTransport
  const result = await request('PUT', draft, 'first', '/dating-preferences', configured)
  expect(result).toMatchObject({ status: failure === 'malformed' || failure === 'divergent' ? 502 : 503, data: { code: failure === 'malformed' || failure === 'divergent' ? 'malformed' : 'provider', error: expect.stringMatching(/Changes may already be saved.*reload/i) } })
  expect(JSON.stringify(result.data)).not.toMatch(/no changes were saved/i)
  expect(stored.get(first)).toEqual(draft)
  expect(snapshot(first)).toMatchObject({ profileRevision: 1, searchRevision: 1, profile: draft.profile, search: draft.search })
  expect(calls).toEqual(['save', 'read'])
})
it('rejects actor injection/global/partial writes, query/body selectors and unauthenticated requests before RPC', async () => {
  for (const token of ['', 'forged']) expect((await request('PUT', draft, token)).status).toBe(401)
  for (const body of [{}, { ...draft, user_id: second }, { ...draft, birthdate: '2000-01-01' }, { ...draft, profile: { ...draft.profile, bio: 'global' } }, { ...draft, expectedSearchRevision: undefined }]) expect((await request('PUT', body)).status).toBe(400)
  for (const heightInches of [0, 23, 108, 24.5]) expect((await request('PUT', { ...draft, profile: { ...draft.profile, heightInches } })).status).toBe(400)
  expect((await request('GET', { user_id: second })).status).toBe(400)
  expect((await request('GET', undefined, 'first', '/dating-preferences?owner=other')).status).toBe(400)
  expect(writes).not.toHaveBeenCalled(); expect(reads).not.toHaveBeenCalled()
  expect((await request('GET', undefined, 'first', '/dating-preferences/public')).status).toBe(404)
})
it('conflicts on either revision without partial updates and requires new clarification after an identity edit', async () => {
  await request('PUT', draft)
  const next = { ...draft, expectedProfileRevision: 1, expectedSearchRevision: 1, profile: { ...draft.profile, clarifiedTargets: ['Man'] } }
  expect((await request('PUT', next)).status).toBe(200)
  const baseline = structuredClone(stored.get(first))
  for (const revisions of [{ expectedProfileRevision: 1, expectedSearchRevision: 2 }, { expectedProfileRevision: 2, expectedSearchRevision: 1 }]) {
    expect((await request('PUT', { ...next, ...revisions })).status).toBe(409)
    expect(stored.get(first)).toEqual(baseline)
  }
  expect((await request('PUT', { ...next, expectedProfileRevision: 2, expectedSearchRevision: 2, profile: { ...next.profile, sexuality: 'Questioning' } })).status).toBe(400)
  expect(stored.get(first)).toEqual(baseline)
})
it('never treats missing/malformed dependencies, partial response or failed canonical readback as saved; does not retry', async () => {
  for (const code of ['LC409', 'DA409', '28000', '22023', 'PGRST202', 'XX000']) {
    error = code
    expect((await request('PUT', draft)).status).toBe(({ LC409: 400, DA409: 409, '28000': 401, '22023': 400, PGRST202: 503, XX000: 503 } as Record<string, number>)[code])
  }
  error = null; badRead = true
  const before = writes.mock.calls.length
  expect((await request('PUT', draft)).status).toBe(502)
  expect(writes).toHaveBeenCalledTimes(before + 1)
  expect(stored.get(first)).toEqual(draft) // uncertain response does not imply rollback
  const missing = { ...transport, actor: () => ({}) } as unknown as UserContextTransport
  expect((await request('PUT', draft, 'first', '/dating-preferences', missing)).status).toBe(503)
  expect((await request('GET', undefined, 'first', '/dating-preferences', null)).status).toBe(503)
})
it('uses authoritative DOB for enable denial while retaining incomplete drafts, regardless of visibility', async () => {
  const enabled = { ...draft, profile: { ...emptyDatingProfile(), gender: 'Woman', sexuality: 'Straight', intent: 'Long-term relationship' as const, style: 'Monogamy' as const, enabled: true, visibility: { gender: true, sexuality: true, height: true } }, search: { ...draft.search!, searchArea: { source: 'home' as const, resolvedLocationRef: first } } }
  for (const birthdate of [null, '2027-01-01', '2008-10-20', 'invalid']) {
    dob = birthdate
    expect((await request('PUT', enabled)).status).toBe(400)
    expect(stored.has(first)).toBe(false)
  }
  expect((await request('PUT', draft)).status).toBe(200)
  expect(snapshot(first).effectiveEnabled).toBe(false)
})
it('rejects wrong/partial save and divergent canonical readback without publishing partial success', async () => {
  const good = { ...snapshot(first), profileRevision: 1, searchRevision: 1, profile: draft.profile, search: draft.search }
  for (const data of [null, { ...good, searchRevision: 0 }, { ...good, profile: { ...draft.profile, heightInches: null } }, { profileRevision: 1, profile: draft.profile }]) {
    const configured = { ...transport, actor: () => ({ saveDatingAggregate: async () => ({ data, error: null }), datingAggregate: async () => ({ data: good, error: null }) }) } as unknown as UserContextTransport
    expect((await request('PUT', draft, 'first', '/dating-preferences', configured)).status).toBe(502)
  }
  const configured = { ...transport, actor: () => ({ saveDatingAggregate: async () => ({ data: good, error: null }), datingAggregate: async () => ({ data: { ...good, searchRevision: 2 }, error: null }) }) } as unknown as UserContextTransport
  expect((await request('PUT', draft, 'first', '/dating-preferences', configured)).status).toBe(502)
})
it('uses fixed actor-JWT aggregate RPCs via the real SDK envelope without service calls or legacy writers', async () => {
  const calls: { name: string; token: string | null; key: string | null; body: unknown }[] = []
  const fetch: typeof globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const name = new URL(String(input)).pathname.split('/').pop()!, headers = new Headers(init?.headers)
    calls.push({ name, token: headers.get('Authorization'), key: headers.get('apikey'), body: init?.body ? JSON.parse(String(init.body)) : null })
    if (name === 'user') return Response.json({ id: first })
    return Response.json(snapshot(first))
  })
  const configured = createUserContextTransport({ url: 'https://database.test', publicKey: 'sb_publishable_test', fetch })
  stored.set(first, draft)
  expect((await request('PUT', draft, 'first', '/dating-preferences', configured)).status).toBe(200)
  expect(calls.map(call => call.name)).toEqual(['user', 'save_dating_preferences', 'get_dating_preferences'])
  expect(calls.every(call => call.token === 'Bearer first' && call.key === 'sb_publishable_test')).toBe(true)
  expect(calls[1].body).toEqual({ aggregate_in: draft })
})
it('maps actual SDK error envelopes without follow-up reads, retries or partial-success claims', async () => {
  for (const [code, upstream, expected] of [['DA409', 400, 409], ['28000', 403, 401], ['22023', 400, 400], ['PGRST202', 404, 503], ['XX000', 500, 503]] as const) {
    const names: string[] = []
    const fetch: typeof globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const name = new URL(String(input)).pathname.split('/').pop()!; names.push(name)
      return name === 'user' ? Response.json({ id: first }) : Response.json({ code, message: 'Synthetic failure', details: null, hint: null }, { status: upstream })
    })
    const configured = createUserContextTransport({ url: 'https://database.test', publicKey: 'sb_publishable_test', fetch })
    expect((await request('PUT', draft, 'first', '/dating-preferences', configured)).status).toBe(expected)
    expect(names).toEqual(['user', 'save_dating_preferences'])
  }
})
