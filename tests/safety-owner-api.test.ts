// @vitest-environment node
import type { Request, Response } from 'express'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMatchmakingRouter, createUserContextTransport, type UserContextTransport } from '../api/matchmaking'
import type { SubmitSafetyReport, SafetyReportReceipt } from '../shared/safety'

const a = 'a0000000-0000-4000-8000-000000000001', b = 'a0000000-0000-4000-8000-000000000002', key = 'b0000000-0000-4000-8000-000000000001'
const report: SubmitSafetyReport = { requestId: key, targetId: b, reason: 'Other', context: ' Exact context 🪨 ' }
let blocks: Map<string, Set<string>>, reports: Map<string, { value: SubmitSafetyReport; receipt: SafetyReportReceipt }>, readError: string | null
const calls: { owner: string; op: string; value?: unknown }[] = []
const state = (owner: string, targetId: string) => ({ targetId, outgoingBlocked: blocks.get(owner)?.has(targetId) ?? false, enforcement: 'contact-mutations-only' })
const transport = { verify: async (token: string) => token === 'a' ? { id: a } : token === 'b' ? { id: b } : null,
  actor: (token: string) => {
    const owner = token === 'a' ? a : b
    return {
      ownerBlocklist: async () => ({ data: { enforcement: 'contact-mutations-only', blocks: [...(blocks.get(owner) ?? [])].map(targetId => ({ targetId, displayName: null, blockedAt: null })) }, error: null }),
      ownerBlockState: async (target: string) => { calls.push({ owner, op: 'readBlock', value: target }); return { data: state(owner, target), error: readError ? { code: readError } : null } },
      blockOwnerTarget: async (target: string) => { calls.push({ owner, op: 'block', value: target }); const set = blocks.get(owner) ?? new Set<string>(); set.add(target); blocks.set(owner, set); return { data: state(owner, target), error: null } },
      unblockOwnerTarget: async (target: string) => { calls.push({ owner, op: 'unblock', value: target }); blocks.get(owner)?.delete(target); return { data: state(owner, target), error: null } },
      submitSafetyReport: async (value: SubmitSafetyReport) => {
        calls.push({ owner, op: 'report', value })
        const prior = reports.get(`${owner}:${value.requestId}`)
        if (prior && JSON.stringify(prior.value) !== JSON.stringify(value)) return { data: null, error: { code: 'SR409' } }
        if (!prior && [...reports.keys()].filter(key => key.startsWith(`${owner}:`)).length >= 5) return { data: null, error: { code: 'SR429' } }
        const receipt = prior?.receipt ?? { id: value.requestId, requestId: value.requestId, targetId: value.targetId, receivedAt: '2026-10-19T00:00:00Z', status: 'received' as const }
        reports.set(`${owner}:${value.requestId}`, { value, receipt }); return { data: receipt, error: null }
      },
      ownerSafetyReport: async (requestId: string) => { calls.push({ owner, op: 'readReport', value: requestId }); const row = reports.get(`${owner}:${requestId}`); return { data: row?.receipt ?? null, error: readError ? { code: readError } : row ? null : { code: 'PT404' } } },
    }
  },
} as unknown as UserContextTransport
function request(method = 'GET', body?: unknown, token = 'a', path = '/safety/blocks', configured: UserContextTransport | null = transport) {
  return new Promise<{ status: number; data: unknown; cache: string }>((resolve, reject) => {
    let status = 200, cache = ''
    const req = { method, url: path, query: Object.fromEntries(new URL(path, 'http://test').searchParams), headers: token ? { authorization: `Bearer ${token}` } : {}, body } as unknown as Request
    const res = { locals: {}, set(name: string, value: string) { if (name === 'Cache-Control') cache = value; return this }, status(value: number) { status = value; return this }, json(data: unknown) { resolve({ status, data, cache }); return this } } as unknown as Response
    createMatchmakingRouter(configured)(req, res, failure => failure ? reject(failure) : resolve({ status: 404, data: null, cache }))
  })
}
beforeEach(() => { blocks = new Map(); reports = new Map(); readError = null; calls.length = 0; vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network') })) })
afterEach(() => vi.unstubAllGlobals())
it('runs transport fixtures in Node rather than a browser storage context', () => {
  expect(typeof window).toBe('undefined')
})
it('scopes opaque blocklists and idempotent outgoing state to the actor, without exposing reverse state or names', async () => {
  expect(await request('PUT', {}, 'a', `/safety/blocks/${b}`)).toMatchObject({ status: 200, cache: 'no-store', data: { outgoingBlocked: true, enforcement: 'contact-mutations-only' } })
  expect((await request('PUT', {}, 'a', `/safety/blocks/${b}`)).status).toBe(200)
  expect((await request()).data).toEqual({ enforcement: 'contact-mutations-only', blocks: [{ targetId: b, displayName: null, blockedAt: null }] })
  expect((await request('GET', undefined, 'b', `/safety/blocks/${a}`)).data).toEqual(state(b, a))
  expect((await request('DELETE', {}, 'a', `/safety/blocks/${b}`)).data).toMatchObject({ outgoingBlocked: false })
  expect((await request('DELETE', {}, 'a', `/safety/blocks/${b}`)).status).toBe(200)
  expect(calls.filter(call => call.op === 'block')).toHaveLength(2)
})
it('rejects unauthenticated/self/actor selectors and extra payload fields before invoking actor RPCs', async () => {
  for (const token of ['', 'forged']) expect((await request('PUT', {}, token, `/safety/blocks/${b}`)).status).toBe(401)
  for (const [path, body] of [[`/safety/blocks/${a}`, {}], [`/safety/blocks/${b}?actor=${a}`, {}], [`/safety/blocks/${b}`, { blockerId: a }]] as const) expect((await request('PUT', body, 'a', path)).status).toBe(400)
  for (const body of [{ ...report, actorId: a }, { ...report, targetId: a }]) expect((await request('POST', body, 'a', '/safety/reports')).status).toBe(400)
  expect(calls).toEqual([])
})
it('persists a bounded intake receipt, replays the same key and rejects changed-key content/cross-owner lookup', async () => {
  const first = await request('POST', report, 'a', '/safety/reports')
  expect(first).toMatchObject({ status: 200, data: { status: 'received', requestId: key, targetId: b } })
  expect(await request('POST', report, 'a', '/safety/reports')).toEqual(first)
  expect((await request('POST', { ...report, context: 'Changed' }, 'a', '/safety/reports')).status).toBe(409)
  expect((await request('GET', undefined, 'b', `/safety/reports/${key}`)).status).toBe(404)
  for (let n = 2; n <= 5; n++) expect((await request('POST', { ...report, requestId: `b0000000-0000-4000-8000-00000000000${n}` }, 'a', '/safety/reports')).status).toBe(200)
  expect((await request('POST', { ...report, requestId: 'b0000000-0000-4000-8000-000000000006' }, 'a', '/safety/reports')).status).toBe(429)
  expect((await request('POST', report, 'a', '/safety/reports')).status).toBe(200)
  expect(blocks.size).toBe(0) // report does not fabricate block/moderation/delivery
})
it('treats failed post-mutation readback as uncertain, preserving committed state and not retrying', async () => {
  readError = '22023'
  expect(await request('PUT', {}, 'a', `/safety/blocks/${b}`)).toMatchObject({ status: 503, data: { code: 'provider', error: expect.stringMatching(/may already be saved/) } })
  expect(blocks.get(a)?.has(b)).toBe(true)
  expect(calls.map(call => call.op)).toEqual(['block', 'readBlock'])
  calls.length = 0
  expect(await request('POST', report, 'a', '/safety/reports')).toMatchObject({ status: 503, data: { code: 'provider' } })
  expect(reports.size).toBe(1); expect(calls.map(call => call.op)).toEqual(['report', 'readReport'])
})
it('uses only fixed actor-JWT RPCs via the actual SDK envelope with injected transport', async () => {
  const names: string[] = [], bodies: unknown[] = []
  const fetch: typeof globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const name = new URL(String(input)).pathname.split('/').pop()!; names.push(name)
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer a')
    expect(new Headers(init?.headers).get('apikey')).toBe('sb_publishable_test')
    bodies.push(init?.body ? JSON.parse(String(init.body)) : null)
    return Response.json(name === 'user' ? { id: a } : { targetId: b, outgoingBlocked: true, enforcement: 'contact-mutations-only' })
  })
  const configured = createUserContextTransport({ url: 'https://database.test', publicKey: 'sb_publishable_test', fetch })
  expect((await request('PUT', {}, 'a', `/safety/blocks/${b}`, configured)).status).toBe(200)
  expect(names).toEqual(['user', 'block_owner_target', 'get_owner_block_state'])
  expect(bodies.slice(1)).toEqual([{ target_in: b }, { target_in: b }])
})
it('keeps missing capability or malformed/live-metadata blocklists unavailable rather than omitting rows or inventing success', async () => {
  const missing = { ...transport, actor: () => ({}) } as unknown as UserContextTransport
  expect((await request('GET', undefined, 'a', '/safety/blocks', missing)).status).toBe(503)
  const row = { targetId: b, displayName: null, blockedAt: null }
  for (const data of [null, { enforcement: 'contact-mutations-only', blocks: [{ ...row, displayName: 'Hidden live profile name' }] }, { enforcement: 'contact-mutations-only', blocks: [row, row] }]) {
    const malformed = { ...transport, actor: () => ({ ownerBlocklist: async () => ({ data, error: null }) }) } as unknown as UserContextTransport
    expect((await request('GET', undefined, 'a', '/safety/blocks', malformed)).status).toBe(502)
  }
  expect((await request('PUT', null, 'a', `/safety/blocks/${b}`)).status).toBe(400)
  expect(calls).toEqual([])
})
