import { z } from 'zod'
import { interestSimilarity, normalizedInterest } from '../../shared/interests.js'
import { friendsConfig } from './friends-config.js'
import { ScoringIntervalsSchema, continuousAvailabilityScore, reciprocalDistanceScore } from './signals.js'

const signals = z.object({
  interests: z.array(z.string().min(1).max(120)).max(30),
  goals: z.array(z.string().min(1).max(120)).max(20),
  intervals: ScoringIntervalsSchema,
}).strict()
export const FriendsScoringPoolSchema = z.object({
  viewer: signals,
  candidates: z.array(signals.extend({
    id: z.uuid().transform(value => value.toLowerCase()), distanceMiles: z.number().finite().min(0).max(100),
    viewerRadiusMiles: z.number().positive().max(100), candidateRadiusMiles: z.number().positive().max(100),
  }).strict().refine(value => value.distanceMiles <= Math.min(value.viewerRadiusMiles, value.candidateRadiusMiles), 'Outside reciprocal distance limits.')).max(friendsConfig.maxCandidates),
}).strict().refine(value => new Set(value.candidates.map(person => person.id)).size === value.candidates.length, 'Duplicate candidate IDs.')
export type FriendsScoringPool = z.infer<typeof FriendsScoringPoolSchema>

export function friendshipGoalScore(a: readonly string[], b: readonly string[]): number | null {
  const left = new Set(a.map(normalizedInterest).filter(Boolean)), right = new Set(b.map(normalizedInterest).filter(Boolean))
  if (!left.size || !right.size) return null
  const common = [...left].filter(goal => right.has(goal)).length
  return Math.sqrt(common / left.size * (common / right.size))
}

export function rankFriendsPool(raw: unknown) {
  const pool = FriendsScoringPoolSchema.parse(raw)
  return pool.candidates.map(candidate => {
    const interests = interestSimilarity(pool.viewer.interests, candidate.interests)
    const availability = continuousAvailabilityScore(pool.viewer.intervals, candidate.intervals, friendsConfig.usableOverlapMinutes, friendsConfig.overlapCapMinutes)
    const components = {
      interests: interests.score ?? friendsConfig.neutral,
      availability: availability.score ?? friendsConfig.neutral,
      goals: friendshipGoalScore(pool.viewer.goals, candidate.goals) ?? friendsConfig.neutral,
      distance: reciprocalDistanceScore(candidate.distanceMiles, candidate.viewerRadiusMiles, candidate.candidateRadiusMiles),
    }
    const score = (Object.keys(components) as (keyof typeof components)[])
      .reduce((sum, component) => sum + components[component] * friendsConfig.weights[component], 0)
    return { id: candidate.id, score, components, version: friendsConfig.version }
  }).sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}
