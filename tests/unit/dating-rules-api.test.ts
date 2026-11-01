// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import type { Request, Response } from 'express'
import { createMatchmakingRouter, type UserContextTransport } from '../../api/matchmaking'
import { createDatingScoringTransport, DatingEligibilityError, type DatingScoringTransport } from '../../api/matching/dating-recommendations'
import { datingLiveClient } from '../../src/features/matchmaking/dating-live-client'

afterEach(() => vi.unstubAllGlobals())

const actorId = 'a0000000-0000-4000-8000-000000000001'
const targetId = 'a0000000-0000-4000-8000-000000000002'
const signals = { interests: ['Coffee'], intention: 'Long-term relationship', intervals: null }
const candidate = { id: targetId, name: 'Alex', age: 23, city: 'Campus', bio: null, avatar: null, photoRevision: 0, interests: ['Coffee'], areaDistanceMiles: 1, heightInches: null, gender: null, sexuality: null, intent: 'Long-term relationship', style: 'Monogamy' }
const rawPool = { viewer: signals, candidates: [{ ...signals, id: targetId, distanceMiles: 1, viewerRadiusMiles: 10, candidateRadiusMiles: 10 }] }
function fixture() {
  const project = vi.fn(async () => ({ data: { candidate }, error: null }))
  const legacy = vi.fn(async () => ({ data: { candidate: null }, error: null }))
  let stored: { revision: number; timeZone: string | null; showAvailability: boolean } = { revision: 0, timeZone: null, showAvailability: false }
  const settings = vi.fn(async () => ({ data: stored, error: null }))
  const save = vi.fn(async () => {
    stored = { revision: 1, timeZone: 'America/New_York', showAvailability: false }
    return { data: stored, error: null }
  })
  const transport = { verify: async (token: string) => token === 'valid' ? { id: actorId } : null,
    actor: () => ({ projectDatingCandidate: project, datingCandidate: legacy, datingScoringSettings: settings, saveDatingScoringSettings: save }),
  } as unknown as UserContextTransport
  const pool = vi.fn(async () => rawPool)
  return { transport, scoring: { pool } satisfies DatingScoringTransport, pool, project, legacy, settings, save }
}
function request(f: ReturnType<typeof fixture>, body: unknown, token = 'valid', path = '/dating/candidate', method = 'POST', enabled = true) {
  return new Promise<{ status: number; data: unknown; cache: string }>((resolve, reject) => {
    let status = 200, cache = ''
    const req = { method, url: path, query: {}, headers: token ? { authorization: `Bearer ${token}` } : {}, body } as unknown as Request
    const res = { locals: {}, set(name: string, value: string) { if (name === 'Cache-Control') cache = value; return this }, status(value: number) { status = value; return this }, json(data: unknown) { resolve({ status, data, cache }); return this } } as unknown as Response
    createMatchmakingRouter(f.transport, enabled ? f.scoring : null)(req, res, error => error ? reject(error) : resolve({ status: 404, data: null, cache }))
  })
}
it('binds scoring to verified identity and returns only the actor-authorized public response', async () => {
  const f = fixture()
  expect(await request(f, { excludedIds: [] })).toEqual({ status: 200, data: { candidate }, cache: 'no-store' })
  expect(f.pool).toHaveBeenCalledWith(actorId, [])
  expect(f.project).toHaveBeenCalledWith(targetId)
  expect(f.legacy).not.toHaveBeenCalled()
})
it('rejects anonymous requests and client-selected actors before private reads', async () => {
  const f = fixture()
  expect((await request(f, { excludedIds: [] }, '')).status).toBe(401)
  expect((await request(f, { excludedIds: [], actorId: targetId })).status).toBe(400)
  expect(f.pool).not.toHaveBeenCalled()
})
it('keeps failures unavailable without leaking provider details or using legacy fallback', async () => {
  const f = fixture()
  f.pool.mockRejectedValueOnce(new Error('private diagnostic / secret'))
  const result = await request(f, { excludedIds: [] })
  expect(result.status).toBe(503)
  expect(JSON.stringify(result)).not.toMatch(/private diagnostic|secret/)
  expect(f.project).not.toHaveBeenCalled()
  expect(f.legacy).not.toHaveBeenCalled()
  expect((await request(f, { excludedIds: [] }, 'valid', '/dating/candidate', 'POST', false)).status).toBe(200)
  expect(f.legacy).toHaveBeenCalledOnce()
})
it.each(['/dating/candidate', '/dating/recommendations'])('preserves the real DL409 setup rejection for %s without private error details or fallback', async path => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ code: 'DL409', message: 'private SQL details' }, { status: 400 })))
  const service = createDatingScoringTransport('https://synthetic.supabase.test', 'server-only-test-key')
  const failure = await service.pool(actorId, []).catch(error => error)
  expect(failure).toBeInstanceOf(DatingEligibilityError)
  const f = fixture(); f.pool.mockRejectedValueOnce(failure)
  const result = await request(f, { excludedIds: [] }, 'valid', path)
  expect(result).toMatchObject({ status: 409, data: { code: 'dating_setup_required', error: expect.stringContaining('Dating setup') } })
  expect(JSON.stringify(result)).not.toContain('private SQL details')
  expect(f.project).not.toHaveBeenCalled(); expect(f.legacy).not.toHaveBeenCalled()
})
it('the Dating client preserves structured setup guidance instead of replacing it with a generic error', async () => {
  const network = vi.fn(async () => Response.json({ code: 'dating_setup_required', error: 'Confirm your Dating search area.' }, { status: 409 }))
  vi.stubGlobal('fetch', network)
  await expect(datingLiveClient('synthetic').enable({ expectedProfileRevision: 1, expectedSearchRevision: 1, enabled: true }))
    .rejects.toMatchObject({ status: 409, code: 'dating_setup_required', message: 'Confirm your Dating search area.' })
  expect(network).toHaveBeenCalledOnce()
})
it('reads default-off settings, validates timezone, and checks write revisions', async () => {
  const f = fixture()
  expect(await request(f, undefined, 'valid', '/dating/scoring-settings', 'GET')).toMatchObject({ status: 200, data: { revision: 0, timeZone: null, showAvailability: false } })
  expect((await request(f, { expectedRevision: 0, timeZone: '+01:00', showAvailability: false }, 'valid', '/dating/scoring-settings', 'PUT')).status).toBe(400)
  expect(f.save).not.toHaveBeenCalled()
  expect((await request(f, { expectedRevision: 0, timeZone: 'America/New_York', showAvailability: false }, 'valid', '/dating/scoring-settings', 'PUT')).status).toBe(200)
  expect((await request(f, { expectedRevision: 5, timeZone: 'America/New_York', showAvailability: false }, 'valid', '/dating/scoring-settings', 'PUT')).status).toBe(502)
})
