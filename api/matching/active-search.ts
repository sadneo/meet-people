import { z } from 'zod'
import { interestSimilarity } from '../../shared/interests.js'
import { friendshipGoalScore } from './friends-scoring.js'
import { activeFriendsConfig as config } from './active-config.js'
import { ScoringIntervalsSchema, continuousAvailabilityScore } from './signals.js'

const id = z.uuid().transform(value => value.toLowerCase())
const person = z.object({
  id, age: z.number().int().min(18).max(99), ageMin: z.number().int().min(18).max(99), ageMax: z.number().int().min(18).max(99),
  latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), radiusMiles: z.number().min(1).max(100),
  interests: z.array(z.string().max(120)).max(30), goals: z.array(z.string().max(120)).max(20),
  intervals: ScoringIntervalsSchema.refine(value => value !== null), blockedIds: z.array(id).max(100),
}).strict()
const unit = z.object({
  id, groupId: id.nullable(), queuedAt: z.iso.datetime({ offset: true }),
  preferredSize: z.number().int().min(2).max(9), minimumSize: z.number().int().min(2).max(9), maximumSize: z.number().int().min(2).max(9),
  allowExistingGroups: z.boolean(), members: z.array(person).min(1).max(9),
}).strict().refine(value => value.minimumSize <= value.preferredSize && value.preferredSize <= value.maximumSize)
export const ActivePoolSchema = z.object({
  algorithmVersion: z.literal('active-friends-fifo-v1'),
  unitId: id, leaseToken: id, now: z.iso.datetime({ offset: true }),
  preferredSizeGraceSeconds: z.number().int().min(0).max(300), minimumOverlapMinutes: z.number().int().min(1).max(240),
  units: z.array(unit).min(1).max(config.maxUnits),
  areas: z.array(z.object({ id, latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).strict()).max(50),
}).strict().refine(value => {
  const people = value.units.flatMap(item => item.members.map(member => member.id))
  return value.units.some(item => item.id === value.unitId) && people.length <= config.maxPeople && new Set(people).size === people.length && new Set(value.units.map(item => item.id)).size === value.units.length
}, 'Unique bounded queue units required.')
export type ActivePool = z.infer<typeof ActivePoolSchema>
type Unit = ActivePool['units'][number]
type Person = Unit['members'][number]
export type ActiveSelection = { algorithmVersion: 'active-friends-fifo-v1'; unitIds: string[]; window: { start: string; end: string }; areaId: string }

// Conservative spherical shortlist; PostGIS is authoritative at reservation and
// formation. A small margin avoids treating a borderline approximation as proof.
function miles(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const radians = (value: number) => value * Math.PI / 180
  const h = Math.sin(radians(a.latitude - b.latitude) / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(radians(a.longitude - b.longitude) / 2) ** 2
  return 3958.7613 * 2 * Math.asin(Math.sqrt(Math.min(1, h))) * 1.006
}
function pairAllowed(a: Person, b: Person) {
  return !a.blockedIds.includes(b.id) && !b.blockedIds.includes(a.id) &&
    a.age >= b.ageMin && a.age <= b.ageMax && b.age >= a.ageMin && b.age <= a.ageMax && miles(a, b) <= Math.min(a.radiusMiles, b.radiusMiles)
}
export function commonActiveWindow(members: Person[], minimumMinutes: number) {
  let common: [number, number][] = [[-Infinity, Infinity]]
  for (const member of members) {
    const windows = (member.intervals ?? []).map(value => [Date.parse(value.start), Date.parse(value.end)] as [number, number]).sort((a, b) => a[0] - b[0])
    const merged: [number, number][] = []
    for (const span of windows) {
      const previous = merged.at(-1)
      if (previous && span[0] <= previous[1]) previous[1] = Math.max(previous[1], span[1]); else merged.push([...span])
    }
    const intersections: [number, number][] = []
    for (const left of common) for (const right of merged) {
      const start = Math.max(left[0], right[0]), end = Math.min(left[1], right[1])
      if (end - start >= minimumMinutes * 60_000) intersections.push([start, end])
    }
    common = intersections
    if (!common.length) return null
  }
  const first = common.sort((a, b) => a[0] - b[0])[0]
  return first ? { start: new Date(first[0]).toISOString(), end: new Date(first[1]).toISOString() } : null
}
function evaluate(units: Unit[], pool: ActivePool) {
  const members = units.flatMap(item => item.members), size = members.length
  if (size > config.maxGroupSize || units.some(item => size > item.maximumSize)) return null
  const existing = units.filter(item => item.groupId)
  if (existing.length > 1 || existing.length && units.some(item => !item.groupId && !item.allowExistingGroups)) return null
  for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) if (!pairAllowed(members[i], members[j])) return null
  const window = commonActiveWindow(members, pool.minimumOverlapMinutes)
  const area = pool.areas.find(place => members.every(member => miles(place, member) <= member.radiusMiles))
  if (!window || !area) return null
  let compatibility = 0, pairs = 0
  for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) {
    const a = members[i], b = members[j]
    compatibility += 0.4 * (interestSimilarity(a.interests, b.interests).score ?? 0.5) + 0.15 * (friendshipGoalScore(a.goals, b.goals) ?? 0.5) +
      0.35 * (continuousAvailabilityScore(a.intervals, b.intervals, pool.minimumOverlapMinutes, 240).score ?? 0.5) + 0.1 * Math.max(0, 1 - miles(a, b) / Math.min(a.radiusMiles, b.radiusMiles))
    pairs++
  }
  return { window, areaId: area.id, compatibility: pairs ? compatibility / pairs : 0.5 }
}

export function chooseActiveGroup(raw: unknown): ActiveSelection | null {
  const pool = ActivePoolSchema.parse(raw), now = Date.parse(pool.now)
  const anchor = pool.units.find(item => item.id === pool.unitId)!
  const gracePassed = now - Date.parse(anchor.queuedAt) >= pool.preferredSizeGraceSeconds * 1000
  const peers = pool.units.filter(item => item.id !== anchor.id && (gracePassed || item.minimumSize <= anchor.preferredSize && item.maximumSize >= anchor.preferredSize))
    .sort((a, b) => Date.parse(a.queuedAt) - Date.parse(b.queuedAt) || a.id.localeCompare(b.id))
  type Candidate = { units: Unit[]; fit: number; waitBand: number; result: NonNullable<ReturnType<typeof evaluate>> }
  const rank = (a: Candidate, b: Candidate) => b.waitBand - a.waitBand || b.fit - a.fit || a.units.map(item => item.id).join().localeCompare(b.units.map(item => item.id).join())
  let beam: Unit[][] = [[anchor]], best: Candidate | null = null, expansions = 0
  const seen = new Set<string>()
  // First try a complete FIFO greedy path. A broad beam must not consume the
  // whole budget at shallow depths when a full nine-person group is easy.
  let greedy = [anchor]
  for (const peer of peers) {
    if (++expansions > config.maxExpansions) break
    const units = [...greedy, peer], result = evaluate(units, pool)
    if (!result) continue
    greedy = units
    const size = units.reduce((sum, item) => sum + item.members.length, 0)
    const waitBand = Math.max(...units.slice(1).map(item => Math.floor(Math.max(0, now - Date.parse(item.queuedAt)) / (config.waitBandSeconds * 1000))))
    const candidate = { units, result, waitBand, fit: 0.6 * (1 - Math.abs(anchor.preferredSize - size) / 8) + 0.4 * result.compatibility }
    if (units.every(item => size >= item.minimumSize) && (gracePassed || size === anchor.preferredSize) && (!best || rank(candidate, best) < 0)) best = candidate
    if (size >= anchor.preferredSize) break
  }
  for (let depth = 0; depth < 8 && beam.length && expansions < config.maxExpansions; depth++) {
    const next: Candidate[] = []
    for (const selected of beam) for (const peer of peers) {
      if (selected.some(item => item.id === peer.id)) continue
      const units = [...selected, peer], key = units.map(item => item.id).sort().join()
      if (seen.has(key)) continue
      seen.add(key)
      if (++expansions > config.maxExpansions) break
      const result = evaluate(units, pool)
      if (!result) continue
      const size = units.reduce((sum, item) => sum + item.members.length, 0)
      const waitBand = Math.max(...units.filter(item => item.id !== anchor.id).map(item => Math.floor(Math.max(0, now - Date.parse(item.queuedAt)) / (config.waitBandSeconds * 1000))))
      const sizeFit = 1 - Math.abs(anchor.preferredSize - size) / 8
      const candidate = { units, result, waitBand, fit: 0.6 * sizeFit + 0.4 * result.compatibility }
      next.push(candidate)
      if (units.every(item => size >= item.minimumSize) && (gracePassed || size === anchor.preferredSize) && (!best || rank(candidate, best) < 0)) best = candidate
    }
    beam = next.sort(rank).slice(0, config.beamWidth).map(item => item.units)
  }
  return best ? { algorithmVersion: config.version, unitIds: best.units.map(item => item.id).sort(), window: best.result.window, areaId: best.result.areaId } : null
}
