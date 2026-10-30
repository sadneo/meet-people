// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import type { Request, Response } from 'express'
import { createMatchmakingRouter, createUserContextTransport, type UserContextTransport } from '../../api/matchmaking'
import { createFriendsScoringTransport } from '../../api/matching/friends-recommendations'

const actorId = 'd0000000-0000-4000-8000-000000000001', targetId = 'd0000000-0000-4000-8000-000000000002'
const person = { id: targetId, name: 'Alex', age: 23, city: 'Campus', bio: null, avatar: null, photoRevision: 0, interests: ['Coffee'], areaDistanceMiles: 1 }
const signals = { interests: ['Coffee'], goals: ['Activity partners'], intervals: null }
const rawPool = { viewer: signals, candidates: [{ ...signals, id: targetId, distanceMiles: 1, viewerRadiusMiles: 10, candidateRadiusMiles: 10 }] }
function fixture() {
  const project = vi.fn(async (targets: string[]) => { void targets; return { data: { candidates: [person] }, error: null } })
  const queue = vi.fn(), dating = vi.fn()
  let connection: { status: 'sent' | 'connected'; conversationId: string | null } = { status: 'sent', conversationId: null }
  const write = vi.fn(async (_target: string, action: 'request' | 'accept'): Promise<{data:unknown;error:{code:string}|null}> => {
    connection = action === 'accept' ? { status: 'connected', conversationId: targetId } : { status: 'sent', conversationId: null }
    return { data: connection, error: null }
  })
  const readConnection = vi.fn(async () => ({ data: connection, error: null }))
  let settings: { revision: number; timeZone: string | null; showAvailability: boolean } = { revision: 0, timeZone: null, showAvailability: false }
  const readSettings = vi.fn(async () => ({ data: settings, error: null }))
  const saveSettings = vi.fn(async () => {
    settings = { revision: 1, timeZone: 'America/New_York', showAvailability: false }
    return { data: settings, error: null }
  })
  const transport = {
    verify: async (token: string) => token === 'valid' ? { id: actorId } : null,
    actor: () => ({ projectFriendsCandidates: project, friendsDiscoveryConnection: write, requestDatingConnection: (target:string) => write(target,'request'),
      socialConnection: readConnection, matchingScoringSettings: readSettings, saveMatchingScoringSettings: saveSettings,
      join: queue, datingCandidate: dating }),
  } as unknown as UserContextTransport
  const pool = vi.fn(async (actor: string, excluded: string[]) => { void actor; void excluded; return rawPool })
  return { transport, scoring: { pool }, project, pool, queue, dating, write, readConnection, readSettings, saveSettings }
}
function request(f: ReturnType<typeof fixture>, body: unknown, path = '/friends/recommendations', method = 'POST', token = 'valid', enabled = true) {
  return new Promise<{ status: number; data: unknown; cache: string }>((resolve, reject) => {
    let status = 200, cache = ''
    const req = { method, url: path, query: Object.fromEntries(new URL(path, 'http://test').searchParams), headers: token ? { authorization: `Bearer ${token}` } : {}, body } as unknown as Request
    const res = { locals: {}, set(name: string, value: string) { if (name === 'Cache-Control') cache = value; return this }, status(value: number) { status = value; return this }, json(data: unknown) { resolve({ status, data, cache }); return this } } as unknown as Response
    createMatchmakingRouter(f.transport, null, enabled ? f.scoring : null)(req, res, error => error ? reject(error) : resolve({ status: 404, data: null, cache }))
  })
}
afterEach(() => vi.unstubAllGlobals())
it('returns a ranked public batch bound to the verified user without joining queues or using Dating', async () => {
  const f = fixture()
  expect(await request(f, { excludedIds: [] })).toEqual({ status: 200, data: { candidates: [person], algorithmVersion: 'friends-rules-v1' }, cache: 'no-store' })
  expect(f.pool).toHaveBeenCalledExactlyOnceWith(actorId, [])
  expect(f.project).toHaveBeenCalledExactlyOnceWith([targetId])
  expect(f.queue).not.toHaveBeenCalled(); expect(f.dating).not.toHaveBeenCalled()
})
it('rejects unverified users, client identity overrides, malformed limits, query fields and disabled rollout before private reads', async () => {
  const f = fixture()
  expect((await request(f, { excludedIds: [] }, '/friends/recommendations', 'POST', '')).status).toBe(401)
  for (const body of [{ excludedIds: [], actorId }, { excludedIds: [], limit: 11 }, { excludedIds: [targetId, targetId] }, {}]) {
    expect((await request(f, body)).status).toBe(400)
  }
  expect((await request(f, { excludedIds: [] }, '/friends/recommendations?actor=other')).status).toBe(400)
  expect((await request(f, { excludedIds: [] }, '/friends/recommendations', 'POST', 'valid', false)).status).toBe(503)
  expect(f.pool).not.toHaveBeenCalled()
})
it('bounds errors and refuses fallback, partial private responses and mismatched projections', async () => {
  const f = fixture(); f.pool.mockRejectedValueOnce(new Error('private details or credentials'))
  const failed = await request(f, { excludedIds: [] })
  expect(failed.status).toBe(503)
  expect(JSON.stringify(failed)).not.toMatch(/private details|credentials/)
  f.project.mockResolvedValueOnce({ data: { candidates: [{ ...person, id: actorId }] }, error: null })
  expect((await request(f, { excludedIds: [] })).status).toBe(503)
  expect(f.pool).toHaveBeenCalledTimes(2)
  expect(f.queue).not.toHaveBeenCalled()
})
it('keeps request and explicit acceptance separate and confirms canonical connection readback', async () => {
  const f = fixture()
  expect((await request(f, {}, `/friends/requests/${targetId}`)).data).toEqual({ status: 'sent', conversationId: null })
  expect(f.write).toHaveBeenLastCalledWith(targetId, 'request')
  expect((await request(f, {}, `/friends/requests/${targetId}/accept`)).data).toEqual({ status: 'connected', conversationId: targetId })
  expect(f.write).toHaveBeenLastCalledWith(targetId, 'accept')
  expect(f.readConnection).toHaveBeenCalledTimes(2)
  expect((await request(f, {}, `/friends/requests/${actorId}`)).status).toBe(400)
  f.readConnection.mockRejectedValueOnce(new Error('Interrupted readback'))
  const uncertain = await request(f, {}, `/friends/requests/${targetId}`)
  expect(uncertain.status).toBe(503)
  expect(uncertain.data).toMatchObject({ error: expect.stringContaining('may already be saved') })
  expect(f.write).toHaveBeenCalledTimes(3)
})
it.each(['friends','dating'])('reports native request throttling as 429 in %s without retrying or claiming an uncertain save',async mode=>{
  const f=fixture()
  f.write.mockResolvedValueOnce({data:null,error:{code:'CON04'}})
  const result=await request(f,{},`/${mode}/requests/${targetId}`)
  expect(result).toMatchObject({status:429,data:{error:'Daily request limit reached (10 per 24 hours). Try again later.'}})
  expect(f.write).toHaveBeenCalledOnce()
  expect(f.readConnection).not.toHaveBeenCalled()
})
it('shares profile timezone settings, validates before writes and requires canonical readback', async () => {
  const f = fixture()
  expect((await request(f, undefined, '/friends/scoring-settings', 'GET')).data).toEqual({ revision: 0, timeZone: null, showAvailability: false })
  expect((await request(f, { expectedRevision: 0, timeZone: 'EST', showAvailability: false }, '/friends/scoring-settings', 'PUT')).status).toBe(400)
  expect(f.saveSettings).not.toHaveBeenCalled()
  const input = { expectedRevision: 0, timeZone: 'America/New_York', showAvailability: false }
  expect((await request(f, input, '/friends/scoring-settings', 'PUT')).status).toBe(200)
  expect(f.saveSettings).toHaveBeenCalledExactlyOnceWith(input)
  f.readSettings.mockRejectedValueOnce(new Error('read failed'))
  expect((await request(f, input, '/friends/scoring-settings', 'PUT')).status).toBe(503)
  expect(f.saveSettings).toHaveBeenCalledTimes(2)
})
it('uses separate fixed service and actor RPCs with the real Supabase transport', async () => {
  const calls: { name: string; authorization: string | null; body: unknown }[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), name = url.split('/').at(-1)!
    calls.push({ name, authorization: new Headers(init?.headers).get('Authorization'), body: JSON.parse(String(init?.body)) })
    return Response.json(name === 'get_friends_scoring_pool' ? rawPool : { candidates: [person] })
  }))
  const service = createFriendsScoringTransport('https://synthetic.supabase.test', 'server-only-test-key')
  await service.pool(actorId, [])
  const actor = createUserContextTransport({ url: 'https://synthetic.supabase.test', publicKey: 'sb_publishable_test' }).actor('actor-test-token')
  await actor.projectFriendsCandidates!([targetId])
  expect(calls).toEqual([
    { name: 'get_friends_scoring_pool', authorization: 'Bearer server-only-test-key', body: { actor_in: actorId, excluded_in: [] } },
    { name: 'project_friends_candidates', authorization: 'Bearer actor-test-token', body: { targets_in: [targetId] } },
  ])
})
