// @vitest-environment node
import { expect, it, vi } from 'vitest'
import type { Request, Response } from 'express'
import { createMatchmakingRouter, type UserContextTransport } from '../../api/matchmaking'
import type { DatingScoringTransport } from '../../api/matching/dating-recommendations'

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
it('reads default-off settings, validates timezone, and checks write revisions', async () => {
  const f = fixture()
  expect(await request(f, undefined, 'valid', '/dating/scoring-settings', 'GET')).toMatchObject({ status: 200, data: { revision: 0, timeZone: null, showAvailability: false } })
  expect((await request(f, { expectedRevision: 0, timeZone: '+01:00', showAvailability: false }, 'valid', '/dating/scoring-settings', 'PUT')).status).toBe(400)
  expect(f.save).not.toHaveBeenCalled()
  expect((await request(f, { expectedRevision: 0, timeZone: 'America/New_York', showAvailability: false }, 'valid', '/dating/scoring-settings', 'PUT')).status).toBe(200)
  expect((await request(f, { expectedRevision: 5, timeZone: 'America/New_York', showAvailability: false }, 'valid', '/dating/scoring-settings', 'PUT')).status).toBe(502)
})
