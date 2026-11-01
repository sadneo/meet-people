// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import type { Request, Response } from 'express'
import { createMatchmakingRouter, createUserContextTransport, type UserContextTransport } from '../../api/matchmaking'
import type { ActiveFriendsWorker } from '../../api/matching/active-worker'
import { createActiveFriendsWorker } from '../../api/matching/active-worker'
import type { ActiveCommand } from '../../shared/active-friends'
const actorId = 'f1000000-0000-4000-8000-000000000001', target = 'f1000000-0000-4000-8000-000000000002'
const idle = { enabled: true, state: 'idle', entryId: null, queuedAt: null, proposal: null, groupId: null, lastOutcome: null, choices: null }
afterEach(() => vi.unstubAllGlobals())
function fixture() {
  const command = vi.fn(async (value: ActiveCommand) => { void value; return { data: idle, error: null as { code?: string } | null } })
  const status = vi.fn(async () => ({ data: idle, error: null }))
  const transport = { verify: async (token: string) => token === 'valid' ? { id: actorId } : null,
    actor: () => ({ activeFriendsCommand: command, activeFriendsStatus: status }),
  } as unknown as UserContextTransport
  const worker = { sweep: vi.fn(async () => ({ ok: true })), claim: vi.fn(async () => null), finish: vi.fn(async () => ({ state: 'waiting', processed: 0 })), reconcile: vi.fn(async () => ({ state: 'uncertain', processed: 0 })) } satisfies ActiveFriendsWorker
  return { transport, worker, command, status }
}
function request(f: ReturnType<typeof fixture>, path: string, body?: unknown, method = 'POST', token = 'valid', enabled = true) {
  return new Promise<{ status: number; data: unknown; cache: string }>((resolve, reject) => {
    let status = 200, cache = ''
    const req = { method, url: `/active-friends${path}`, query: Object.fromEntries(new URL(path, 'http://test').searchParams), headers: token ? { authorization: `Bearer ${token}` } : {}, body } as unknown as Request
    const res = { locals: {}, set(name: string, value: string) { if (name === 'Cache-Control') cache = value; return this }, status(value: number) { status = value; return this }, json(data: unknown) { resolve({ status, data, cache }); return this } } as unknown as Response
    createMatchmakingRouter(f.transport, null, null, enabled ? f.worker : null)(req, res, error => error ? reject(error) : resolve({ status: 404, data: null, cache }))
  })
}
it('requires verified identity and enabled capability, and rejects client identity or policy overrides', async () => {
  const f = fixture()
  expect((await request(f, '/queue', { requestId: target, preferredNewFriends: 3 }, 'POST', '')).status).toBe(401)
  expect((await request(f, '/queue', { requestId: target, preferredNewFriends: 3 }, 'POST', 'valid', false)).status).toBe(503)
  for (const extra of [{ actorId }, { queuedAt: '2020-01-01' }, { ignoreBlocks: true }, { minimumAge: 13 }]) expect((await request(f, '/queue', { requestId: target, preferredNewFriends: 3, ...extra })).status).toBe(400)
  expect((await request(f, '/status?actor=other', undefined, 'GET')).status).toBe(400)
  expect(f.command).not.toHaveBeenCalled(); expect(f.worker.claim).not.toHaveBeenCalled()
})
it('uses fixed join commands and explicit accepted size bounds without passive discovery toggles', async () => {
  const f = fixture()
  expect(await request(f, '/queue', { requestId: target, preferredNewFriends: 3 })).toEqual({ status: 200, data: idle, cache: 'no-store' })
  expect(f.command).toHaveBeenCalledExactlyOnceWith({ action: 'join', requestId: target, data: { preferredNewFriends: 3, minimumGroupSize: 2, maximumGroupSize: 4, allowExistingGroups: false } })
})
it('smaller-roster requests identify the exact final membership and never include acceptance shortcuts', async () => {
  const f = fixture()
  expect((await request(f, `/proposals/${target}/smaller`, { requestId: actorId, memberIds: [actorId, target] })).status).toBe(200)
  expect(f.command).toHaveBeenLastCalledWith({ action: 'smaller', requestId: actorId, data: { proposalId: target, memberIds: [actorId, target] } })
  expect((await request(f, `/proposals/${target}/smaller`, { requestId: actorId, memberIds: [actorId, target], keepPreviousAcceptances: true })).status).toBe(400)
  expect((await request(f, `/proposals/${target}/accept`, { requestId: actorId, memberIds: [actorId, target] })).status).toBe(400)
})
it('manual checks run bounded worker work and return canonical status, while GET does not schedule jobs', async () => {
  const f = fixture()
  expect((await request(f, '/status', undefined, 'GET')).status).toBe(200)
  expect(f.worker.claim).not.toHaveBeenCalled()
  expect((await request(f, '/check', {})).status).toBe(200)
  expect(f.worker.claim).toHaveBeenCalledOnce(); expect(f.status).toHaveBeenCalledTimes(2)
})
it('maps stale rosters to conflict and never retries uncertain commands or leaks SQL errors', async () => {
  const f = fixture()
  f.command.mockResolvedValueOnce({ data: null as unknown as typeof idle, error: { code: 'AF409' } })
  expect((await request(f, `/proposals/${target}/accept`, { requestId: actorId })).status).toBe(409)
  f.command.mockRejectedValueOnce(new Error('private schema and credentials'))
  const response = await request(f, '/queue', { requestId: target, preferredNewFriends: 2 })
  expect(response.status).toBe(503); expect(JSON.stringify(response.data)).not.toMatch(/private schema|credentials/)
  expect(f.command).toHaveBeenCalledTimes(2)
})
it('keeps ready-up and leave as explicit member actions', async () => {
  const f = fixture()
  expect((await request(f, `/groups/${target}/ready`, { requestId: actorId, ready: true })).status).toBe(200)
  expect(f.command).toHaveBeenLastCalledWith({ action: 'ready', requestId: actorId, data: { groupId: target, ready: true } })
  expect((await request(f, `/groups/${target}/leave`, { requestId: actorId })).status).toBe(200)
  expect(f.command).toHaveBeenLastCalledWith({ action: 'leave', requestId: actorId, data: { groupId: target } })
})
it('keeps existing group history and cancellation available when new matching is disabled', async () => {
  const f = fixture(), existing = f.transport.actor('valid')
  const history = vi.fn(async () => ({ data: { messages: [], nextCursor: null }, error: null }))
  f.transport.actor = () => ({ ...existing, activeFriendsHistory: history })
  expect((await request(f, `/groups/${target}/messages`, undefined, 'GET', 'valid', false)).status).toBe(200)
  expect((await request(f, '/status', undefined, 'GET', 'valid', false)).data).toMatchObject({ enabled: false })
  expect(history).toHaveBeenCalledExactlyOnceWith(target, null)
  expect((await request(f, '/queue', { requestId: target }, 'DELETE', 'valid', false)).status).toBe(200)
  expect(f.command).toHaveBeenLastCalledWith({ action: 'cancel', requestId: target, data: {} })
  expect(f.worker.claim).not.toHaveBeenCalled()
})
it('keeps private worker RPCs on the server credential and commands on the actor JWT', async () => {
  const calls: { name: string; token: string | null; body: unknown }[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const name = String(input).split('/').at(-1)!
    calls.push({ name, token: new Headers(init?.headers).get('Authorization'), body: JSON.parse(String(init?.body)) })
    return Response.json(name === 'claim_active_friends_job' ? null : idle)
  }))
  await createActiveFriendsWorker('https://synthetic.supabase.test', 'server-test-key').claim()
  const actor = createUserContextTransport({ url: 'https://synthetic.supabase.test', publicKey: 'sb_publishable_test' }).actor('actor-test-token')
  const command: ActiveCommand = { action: 'cancel', requestId: target, data: {} }
  await actor.activeFriendsCommand!(command)
  expect(calls).toEqual([
    { name: 'claim_active_friends_job', token: 'Bearer server-test-key', body: {} },
    { name: 'active_friends_command', token: 'Bearer actor-test-token', body: { command_in: command } },
  ])
})
