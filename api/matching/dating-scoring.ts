import { z } from 'zod'
import { interestSimilarity } from '../../shared/interests.js'
import { datingConfig } from './dating-config.js'
import { ScoringIntervalsSchema, continuousAvailabilityScore, reciprocalDistanceScore } from './signals.js'

const signals = z.object({
  interests: z.array(z.string().min(1).max(120)).max(30),
  intention: z.enum(['', 'Long-term relationship', 'Long-term, open to short', 'Short-term, open to long', 'Something casual', 'Still figuring it out']),
  intervals: ScoringIntervalsSchema,
}).strict()
export const DatingScoringPoolSchema = z.object({
  viewer: signals,
  candidates: z.array(signals.extend({
    id: z.uuid(), distanceMiles: z.number().finite().nonnegative().max(100),
    viewerRadiusMiles: z.number().positive().max(100), candidateRadiusMiles: z.number().positive().max(100),
  }).strict().refine(value => value.distanceMiles <= Math.min(value.viewerRadiusMiles, value.candidateRadiusMiles), 'Outside reciprocal distance limits.')).max(datingConfig.maxCandidates),
}).strict().refine(value => new Set(value.candidates.map(candidate => candidate.id)).size === value.candidates.length, 'Duplicate candidate IDs.')
export type DatingSignals = z.infer<typeof signals>
export type DatingScoringPool = z.infer<typeof DatingScoringPoolSchema>

// Long and short are explicit willingness, not an interpretation of sexuality,
// relationship style, biography, or any sensitive identity attribute.
const intentions: Readonly<Record<string, readonly string[]>> = {
  'Long-term relationship': ['long'],
  'Long-term, open to short': ['long', 'short'],
  'Short-term, open to long': ['long', 'short'],
  'Something casual': ['short'],
}
export function intentionScore(a: string, b: string): number | null {
  const left = intentions[a], right = intentions[b]
  if (!left || !right) return null
  const common = left.filter(value => right.includes(value)).length
  // Directional willingness combined reciprocally. Symmetric when sets agree.
  return Math.sqrt((common / left.length) * (common / right.length))
}

export function availabilityScore(a: DatingSignals['intervals'], b: DatingSignals['intervals']) {
  return continuousAvailabilityScore(a, b, datingConfig.usableOverlapMinutes, datingConfig.overlapCapMinutes)
}

export function rankDatingPool(raw: unknown) {
  const pool = DatingScoringPoolSchema.parse(raw)
  return pool.candidates.map(candidate => {
    const interests = interestSimilarity(pool.viewer.interests, candidate.interests)
    const availability = availabilityScore(pool.viewer.intervals, candidate.intervals)
    const components = {
      intention: intentionScore(pool.viewer.intention, candidate.intention) ?? datingConfig.neutral,
      interests: interests.score ?? datingConfig.neutral,
      availability: availability.score ?? datingConfig.neutral,
      distance: reciprocalDistanceScore(candidate.distanceMiles, candidate.viewerRadiusMiles, candidate.candidateRadiusMiles),
    }
    const score = (Object.keys(components) as (keyof typeof components)[])
      .reduce((total, key) => total + components[key] * datingConfig.weights[key], 0)
    return { id: candidate.id, score, components, version: datingConfig.version }
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id, 'en'))
}
