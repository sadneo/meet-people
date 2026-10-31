// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { interestSimilarity } from '../../shared/interests'
import { DatingScoringSettingsSchema } from '../../shared/dating-scoring'
import { availabilityScore, intentionScore, rankDatingPool, type DatingScoringPool } from '../../api/matching/dating-scoring'
import { rankedDatingCandidate } from '../../api/matching/dating-recommendations'

const actor = 'a0000000-0000-4000-8000-000000000001'
const one = 'a0000000-0000-4000-8000-000000000002'
const two = 'a0000000-0000-4000-8000-000000000003'
const span = (start: string, end: string) => ({ start, end })
const window = [span('2026-10-28T17:00:00Z', '2026-10-28T19:00:00Z')]
const signals = { interests: ['Coffee', 'Board games', 'Hiking'], intention: 'Long-term relationship' as const, intervals: window }
const candidate = (id: string) => ({ ...signals, id, distanceMiles: 1, viewerRadiusMiles: 10, candidateRadiusMiles: 10 })
const pool = (): DatingScoringPool => ({ viewer: signals, candidates: [candidate(one), candidate(two)] })
const publicCandidate = (id: string) => ({ id, name: 'Alex', age: 23, city: 'Campus', bio: 'Bio', avatar: null, photoRevision: 0, interests: ['Coffee'], areaDistanceMiles: 1, heightInches: null, gender: null, sexuality: null, intent: 'Long-term relationship', style: 'Monogamy' })

describe('rules-based Dating signals', () => {
  it('matches normalized custom interests and curated aliases once, without fuzzy or subtopic matching', () => {
    expect(interestSimilarity([' Boardgames ', 'BOARD GAMES', '  Ceramic   sculpture '], ['board-games', 'ceramic sculpture'])).toEqual({ score: 1, sharedCount: 2 })
    expect(interestSimilarity(['Hiking'], ['Hikng'])).toEqual({ score: 0, sharedCount: 0 })
    expect(interestSimilarity(['Science fiction'], ['Fiction'])).toEqual({ score: 0, sharedCount: 0 })
    expect(interestSimilarity(['Cafe\u0301'], ['Café'])).toEqual({ score: 1, sharedCount: 1 })
    expect(interestSimilarity([], [])).toEqual({ score: null, sharedCount: 0 })
  })
  it('combines directional intention willingness without penalizing uncertainty as incompatibility', () => {
    expect(intentionScore('Long-term relationship', 'Something casual')).toBe(0)
    expect(intentionScore('Long-term relationship', 'Long-term, open to short')).toBeCloseTo(Math.sqrt(0.5))
    expect(intentionScore('Long-term, open to short', 'Long-term relationship')).toBeCloseTo(Math.sqrt(0.5))
    expect(intentionScore('Still figuring it out', 'Long-term relationship')).toBeNull()
  })
  it('counts continuous overlaps, merges overnight splits and duplicates, and caps excessive availability', () => {
    const overnight = [span('2026-10-28T23:00:00Z', '2026-10-29T00:00:00Z'), span('2026-10-29T00:00:00Z', '2026-10-29T02:00:00Z')]
    expect(availabilityScore(overnight, [span('2026-10-28T23:30:00Z', '2026-10-29T01:30:00Z')])).toEqual({ score: 0.5, usableMinutes: 120 })
    expect(availabilityScore([...window, ...window], window).usableMinutes).toBe(120)
    expect(availabilityScore([span('2026-10-28T17:00:00Z', '2026-10-28T17:30:00Z')], window).score).toBe(0)
    expect(availabilityScore([span('2026-10-28T00:00:00Z', '2026-10-30T00:00:00Z')], [span('2026-10-28T00:00:00Z', '2026-10-30T00:00:00Z')]).score).toBe(1)
    expect(availabilityScore(null, window).score).toBeNull()
    expect(availabilityScore([], window).score).toBe(0)
  })
  it('compares UTC instants across different offsets, including the repeated fall hour', () => {
    expect(availabilityScore([span('2026-11-01T01:00:00-04:00', '2026-11-01T02:00:00-05:00')], [span('2026-11-01T05:30:00Z', '2026-11-01T06:30:00Z')])).toEqual({ score: 0.25, usableMinutes: 60 })
    expect(availabilityScore([span('2026-03-08T01:30:00-05:00', '2026-03-08T03:30:00-04:00')], [span('2026-03-08T06:30:00Z', '2026-03-08T07:30:00Z')]).usableMinutes).toBe(60)
  })
  it('uses fixed weights and a neutral missing score; ranking is bounded, deterministic and normalized', () => {
    const input = pool()
    input.candidates[1] = { ...candidate(two), interests: ['Unrelated'], distanceMiles: 10, intervals: [] }
    const ranked = rankDatingPool(input)
    expect(ranked[0].id).toBe(one)
    expect(ranked[0].score).toBeCloseTo(0.35 + 0.30 + 0.20 * 0.5 + 0.15 * 0.9)
    const missing = rankDatingPool({ viewer: { ...signals, intervals: null }, candidates: [candidate(one)] })[0]
    expect(missing.components.availability).toBe(0.5)
    for (const item of ranked) expect(item.score).toBeGreaterThanOrEqual(0)
    for (const item of ranked) expect(item.score).toBeLessThanOrEqual(1)
    expect(rankDatingPool({ ...pool(), candidates: [...pool().candidates].reverse() })).toEqual(rankDatingPool(pool()))
    expect(() => rankDatingPool({ ...pool(), candidates: Array(101).fill(candidate(one)) })).toThrow()
    expect(() => rankDatingPool({ ...pool(), viewer: { ...signals, bio: 'must not score' } })).toThrow()
  })
  it('validates timezone choices without inventing a default or accepting offsets', () => {
    for (const timeZone of [null, 'UTC', 'America/New_York', 'Asia/Kolkata']) expect(DatingScoringSettingsSchema.safeParse({ timeZone, showAvailability: false }).success).toBe(true)
    for (const timeZone of ['EST', '+05:30', 'Invalid/Place']) expect(DatingScoringSettingsSchema.safeParse({ timeZone, showAvailability: false }).success).toBe(false)
  })
})

describe('server-only scoring and actor projection', () => {
  it('revalidates a withdrawn top result and returns only a public projection', async () => {
    const project = vi.fn(async (target: string) => ({ data: { candidate: target === one ? null : publicCandidate(target) }, error: null }))
    const result = await rankedDatingCandidate({ pool: async () => pool() }, actor, [], project)
    expect(project.mock.calls.map(call => call[0])).toEqual([one, two])
    expect(result).toEqual({ candidate: publicCandidate(two) })
    expect(JSON.stringify(result)).not.toMatch(/components|intervals|score|viewerRadius|version/)
  })
  it('rejects self/excluded candidates and malformed projections, and does not fall back on errors', async () => {
    const project = vi.fn(async () => ({ data: { candidate: publicCandidate(two) }, error: null }))
    await expect(rankedDatingCandidate({ pool: async () => ({ ...pool(), candidates: [candidate(actor)] }) }, actor, [], project)).rejects.toThrow('identity')
    await expect(rankedDatingCandidate({ pool: async () => pool() }, actor, [one], project)).rejects.toThrow('identity')
    expect(project).not.toHaveBeenCalled()
    await expect(rankedDatingCandidate({ pool: async () => pool() }, actor, [], project)).rejects.toThrow('mismatch')
    await expect(rankedDatingCandidate({ pool: async () => { throw new Error('unavailable') } }, actor, [], project)).rejects.toThrow('unavailable')
  })
})
