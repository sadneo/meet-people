// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { friendshipGoalScore, rankFriendsPool, type FriendsScoringPool } from '../../api/matching/friends-scoring'
import { rankedFriendsBatch } from '../../api/matching/friends-recommendations'
import { FriendsBatchRequestSchema } from '../../shared/friends-discovery'

const id = (n: number) => `c0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const signals = { interests: ['Coffee', 'Boardgames', 'Sculpture'], goals: ['Study buddies'], intervals: [{ start: '2026-10-28T17:00:00Z', end: '2026-10-28T19:00:00Z' }] }
const candidate = (n: number) => ({ ...signals, id: id(n), distanceMiles: 1, viewerRadiusMiles: 10, candidateRadiusMiles: 10 })
const pool = (count = 3): FriendsScoringPool => ({ viewer: signals, candidates: Array.from({ length: count }, (_, n) => candidate(n + 1)) })
const person = (n: number) => ({ id: id(n), name: `Person ${n}`, age: 24, city: 'Campus', bio: null, avatar: null, photoRevision: 0, interests: signals.interests, areaDistanceMiles: 1 })

describe('Friends compatibility', () => {
  it('ranks single custom-interest profiles without excluding unrelated interests or changing weights', () => {
    const input = pool(2)
    input.viewer = { ...signals, interests: ['sci-fi'] }
    input.candidates[0].interests = ['Science fiction']
    input.candidates[1].interests = ['Ceramics']
    const ranked = rankFriendsPool(input)
    expect(ranked).toHaveLength(2)
    expect(ranked[0].components.interests).toBe(1)
    expect(ranked[1].components.interests).toBe(0)
    expect(ranked[0].score - ranked[1].score).toBeCloseTo(0.4)
  })
  it('uses Friends weights, reciprocal distance and deterministic ties, independent of Dating data', () => {
    const ranked = rankFriendsPool(pool())
    expect(ranked[0].score).toBeCloseTo(0.4 + 0.35 * 0.5 + 0.15 + 0.10 * 0.9)
    expect(ranked.map(item => item.id)).toEqual([id(1), id(2), id(3)])
    expect(rankFriendsPool({ ...pool(), candidates: pool().candidates.reverse() })).toEqual(ranked)
    expect(() => rankFriendsPool({ ...pool(), viewer: { ...signals, sexuality: 'Straight' } })).toThrow()
    expect(() => rankFriendsPool({ ...pool(), viewer: { ...signals, bio: 'Coffee' } })).toThrow()
  })
  it('does not make shared interests, goals or availability into hard constraints', () => {
    const input = pool(1)
    input.candidates[0] = { ...candidate(1), interests: ['Other'], goals: ['Other goal'], intervals: [] }
    expect(rankFriendsPool(input)[0].components).toEqual({ interests: 0, goals: 0, availability: 0, distance: 0.9 })
    expect(rankFriendsPool(input)[0].score).toBeCloseTo(0.09)
  })
  it('normalizes goals without fuzzy or interest-alias merging and uses a prior for missing optional goals', () => {
    expect(friendshipGoalScore(['Study buddies', 'Activity partners'], [' STUDY   BUDDIES '])).toBeCloseTo(Math.sqrt(0.5))
    expect(friendshipGoalScore(['Study buddies'], ['Study partners'])).toBe(0)
    expect(friendshipGoalScore(['sci-fi'], ['science fiction'])).toBe(0)
    expect(friendshipGoalScore(['constructor'], ['Coffee'])).toBe(0)
    expect(friendshipGoalScore([], ['Study buddies'])).toBeNull()
    const input = pool(1); input.viewer.intervals = null; input.viewer.goals = []
    expect(rankFriendsPool(input)[0].components.availability).toBe(0.5)
    expect(rankFriendsPool(input)[0].components.goals).toBe(0.5)
  })
  it('recognizes aliases without double counting, rejects duplicate IDs and out-of-radius rows', () => {
    const input = pool(1)
    input.candidates[0].interests = ['Coffee', 'Board games', 'Board-games', 'Sculpture']
    expect(rankFriendsPool(input)[0].components.interests).toBe(1)
    expect(() => rankFriendsPool({ ...pool(), candidates: [candidate(1), candidate(1)] })).toThrow()
    expect(() => rankFriendsPool({ ...pool(), candidates: [{ ...candidate(1), distanceMiles: 11 }] })).toThrow()
    expect(() => rankFriendsPool(pool(101))).toThrow()
  })
  it('keeps all scores finite and bounded across extremes', () => {
    for (const distanceMiles of [0, 5, 10]) for (const intervals of [null, [], signals.intervals]) {
      const input = pool(1); input.candidates[0] = { ...candidate(1), distanceMiles, intervals }
      const result = rankFriendsPool(input)[0]
      expect(Number.isFinite(result.score)).toBe(true)
      expect(result.score).toBeGreaterThanOrEqual(0); expect(result.score).toBeLessThanOrEqual(1)
    }
  })
})

describe('ranked Friends batches', () => {
  it('projects once, restores rank order, fills from eligible replacements, and exposes only public fields', async () => {
    const project = vi.fn(async () => ({ data: { candidates: [person(3), person(2)] }, error: null }))
    const result = await rankedFriendsBatch({ pool: async () => pool() }, id(0), [], 2, project)
    expect(project).toHaveBeenCalledExactlyOnceWith([id(1), id(2), id(3)])
    expect(result.candidates.map(item => item.id)).toEqual([id(2), id(3)])
    expect(result.algorithmVersion).toBe('friends-rules-v1')
    expect(JSON.stringify(result)).not.toMatch(/goals|intervals|components|score|viewerRadius/)
  })
  it('bounds candidate projection and returns at most ten profiles', async () => {
    const project = vi.fn(async () => ({ data: { candidates: Array.from({ length: 30 }, (_, n) => person(n + 1)) }, error: null }))
    const result = await rankedFriendsBatch({ pool: async () => pool(100) }, id(0), [], 10, project)
    expect(project.mock.calls[0]).toBeDefined()
    expect(result.candidates).toHaveLength(10)
    expect(result.candidates[9].id).toBe(id(10))
    expect(FriendsBatchRequestSchema.parse({ excludedIds: [] }).limit).toBe(10)
    expect(FriendsBatchRequestSchema.safeParse({ excludedIds: [], limit: 11 }).success).toBe(false)
    expect(FriendsBatchRequestSchema.safeParse({ excludedIds: [id(1), id(1)] }).success).toBe(false)
  })
  it('rejects self/excluded IDs before projection, and rejects unexpected/duplicate/private response fields', async () => {
    const project = vi.fn(async () => ({ data: { candidates: [person(2)] }, error: null }))
    await expect(rankedFriendsBatch({ pool: async () => pool(1) }, id(1), [], 10, project)).rejects.toThrow('identity')
    await expect(rankedFriendsBatch({ pool: async () => pool(1) }, id(0), [id(1)], 10, project)).rejects.toThrow('identity')
    expect(project).not.toHaveBeenCalled()
    await expect(rankedFriendsBatch({ pool: async () => pool(1) }, id(0), [], 10, project)).rejects.toThrow('mismatch')
    for (const candidates of [[person(1), person(1)], [{ ...person(1), goals: ['private'] }], [{ ...person(1), age: 17 }]]) {
      await expect(rankedFriendsBatch({ pool: async () => pool(1) }, id(0), [], 10, async () => ({ data: { candidates }, error: null }))).rejects.toThrow()
    }
  })
  it('handles empty/withdrawn pools without inventing people, and does not retry provider failures', async () => {
    const project = vi.fn(async () => ({ data: { candidates: [] }, error: null }))
    expect((await rankedFriendsBatch({ pool: async () => pool(0) }, id(0), [], 10, project)).candidates).toEqual([])
    expect(project).not.toHaveBeenCalled()
    expect((await rankedFriendsBatch({ pool: async () => pool(1) }, id(0), [], 10, project)).candidates).toEqual([])
    const broken = vi.fn(async () => { throw new Error('Unavailable') })
    await expect(rankedFriendsBatch({ pool: broken }, id(0), [], 10, project)).rejects.toThrow('Unavailable')
    expect(broken).toHaveBeenCalledOnce()
  })
})
