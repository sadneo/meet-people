import { z } from 'zod'
import { AvailabilitySchema } from './matchmaking.js'
import { FriendsLabelSchema, FriendsPreferencesSchema } from './friends-search-preferences.js'
import { profileLanguageKey } from './profile-details.js'

const uuid = z.uuid().length(36)
const CoordinatesSchema = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).strict()
const LocationSchema = CoordinatesSchema.extend({ id: uuid, ownerId: uuid, source: z.enum(['home', 'temporary']), areaLabel: FriendsLabelSchema, usable: z.boolean() }).strict()
// Match identity before full validation: even an invalid case variant of a
// selected UUID must be counted as a conflict, not silently discarded.
const LocationIdentitySchema = z.object({ id: z.string() })
const PersonSchema = z.object({
  id: uuid, authenticated: z.boolean(), eligible: z.boolean(), activeConsent: z.boolean(),
  globalDiscovery: z.boolean(), friendsDiscovery: z.boolean(), birthdate: z.iso.date().nullable(),
  homeAreaLabel: FriendsLabelSchema.nullable(), preferences: FriendsPreferencesSchema,
  interests: z.array(FriendsLabelSchema).max(30).refine(values => new Set(values).size === values.length),
  availability: z.array(AvailabilitySchema).max(56).refine(values => values.every((a, i) => values.every((b, j) => i === j || a.dow !== b.dow || a.end_time <= b.start_time || b.end_time <= a.start_time))),
  // Optional trusted, cached output of the existing ranker. Never invoke its
  // synchronous provider-call paths in this pure policy; null is a soft fallback.
  friendScore: z.number().nullable().catch(null),
}).strict()
const ContextSchema = z.object({
  actorId: uuid.nullable(), asOfDate: z.iso.date(),
  blocks: z.array(z.object({ blockerId: uuid, blockedId: uuid }).strict()).nullable(),
  // The container must be authoritative/known, but unrelated malformed rows
  // must not poison valid pairs. Validate full rows only for selected refs.
  locations: z.array(z.unknown()).nullable(),
}).strict()
export type ActivePerson = z.infer<typeof PersonSchema>
type ParsedContext = z.infer<typeof ContextSchema>
export type ActiveContext = Omit<ParsedContext, 'locations'> & { locations: z.infer<typeof LocationSchema>[] | null }
export type ActiveRanking = { id: string; distanceMiles: number; sharedInterestCount: number; overlapSeconds: number; friendScore: number | null }
export const earthRadiusMiles = 6371.0088 / 1.609344
export function greatCircleMiles(a: unknown, b: unknown): number | null {
  const first = CoordinatesSchema.safeParse(a), second = CoordinatesSchema.safeParse(b)
  if (!first.success || !second.success) return null
  const rad = (degrees: number) => degrees * Math.PI / 180
  const lat1 = rad(first.data.latitude), lat2 = rad(second.data.latitude)
  const h = Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(rad(second.data.longitude - first.data.longitude) / 2) ** 2
  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))))
}
function ageOnDate(birthdate: string | null, asOfDate: string) {
  if (!birthdate || birthdate > asOfDate) return null
  return Number(asOfDate.slice(0, 4)) - Number(birthdate.slice(0, 4)) - (asOfDate.slice(5) < birthdate.slice(5) ? 1 : 0)
}
const key = (id: string) => id.toLowerCase()
function locationFor(person: ActivePerson, locations: NonNullable<ParsedContext['locations']>) {
  const area = person.preferences.searchArea
  if (!area.resolvedLocationRef) return null
  const selected = locations.filter(value => {
    const identity = LocationIdentitySchema.safeParse(value)
    return identity.success && key(identity.data.id) === key(area.resolvedLocationRef!)
  })
  // Count identities before validating fields: a malformed duplicate of a
  // selected ID is still ambiguous, even beside an otherwise valid row.
  if (selected.length !== 1) return null
  const parsed = LocationSchema.safeParse(selected[0])
  if (!parsed.success) return null
  const location = parsed.data
  const label = area.source === 'home' ? person.homeAreaLabel : area.areaLabel
  return location && location.usable && key(location.ownerId) === key(person.id) && location.source === area.source && label !== null && location.areaLabel === label ? location : null
}
const seconds = (time: string) => time.split(':').reduce((total, part) => total * 60 + Number(part), 0)
function evaluate(a: ActivePerson, b: ActivePerson, context: ParsedContext): ActiveRanking | null {
  if (!context.actorId || key(context.actorId) !== key(a.id) || key(a.id) === key(b.id) || !context.blocks || !context.locations) return null
  if ([a, b].some(person => !person.authenticated || !person.eligible || !person.activeConsent || !person.globalDiscovery || !person.friendsDiscovery)) return null
  if (context.blocks.some(block => (key(block.blockerId) === key(a.id) && key(block.blockedId) === key(b.id)) || (key(block.blockerId) === key(b.id) && key(block.blockedId) === key(a.id)))) return null
  const myAge = ageOnDate(a.birthdate, context.asOfDate), theirAge = ageOnDate(b.birthdate, context.asOfDate)
  if (myAge === null || theirAge === null || theirAge < a.preferences.ageMin || theirAge > a.preferences.ageMax || myAge < b.preferences.ageMin || myAge > b.preferences.ageMax) return null
  const myLocation = locationFor(a, context.locations), theirLocation = locationFor(b, context.locations)
  if (!myLocation || !theirLocation) return null
  const distanceMiles = greatCircleMiles({ latitude: myLocation.latitude, longitude: myLocation.longitude }, { latitude: theirLocation.latitude, longitude: theirLocation.longitude })
  if (distanceMiles === null) return null
  // Only roundoff tolerance (eight machine epsilons), not a radius relaxation.
  const within = (radius: number) => distanceMiles <= radius || distanceMiles - radius <= Number.EPSILON * Math.max(1, distanceMiles, radius) * 8
  if (!within(a.preferences.radiusMiles) || !within(b.preferences.radiusMiles)) return null
  const myInterests = new Set(a.interests.map(profileLanguageKey)), theirInterests = new Set(b.interests.map(profileLanguageKey))
  const sharedInterestCount = [...myInterests].filter(value => theirInterests.has(value)).length
  let overlapSeconds = 0
  for (const first of a.availability) for (const second of b.availability) {
    if (first.dow === second.dow) overlapSeconds += Math.max(0, Math.min(seconds(first.end_time), seconds(second.end_time)) - Math.max(seconds(first.start_time), seconds(second.start_time)))
  }
  return { id: key(b.id), distanceMiles, sharedInterestCount, overlapSeconds, friendScore: b.friendScore }
}
// Internal policy only: inputs must come from verified actor/canonical repositories,
// including complete bilateral block evidence and trusted resolved references.
// No RPC, fetch, clock reads, geolocation, mutation, UI or downtime path is wired.
export function evaluateActiveNearby(requester: unknown, candidate: unknown, evidence: unknown): ActiveRanking | null {
  const a = PersonSchema.safeParse(requester), b = PersonSchema.safeParse(candidate), context = ContextSchema.safeParse(evidence)
  return a.success && b.success && context.success ? evaluate(a.data, b.data, context.data) : null
}
export function rankActiveNearby(requester: unknown, candidates: readonly unknown[], evidence: unknown): ActiveRanking[] {
  const a = PersonSchema.safeParse(requester), context = ContextSchema.safeParse(evidence)
  if (!a.success || !context.success) return []
  const parsed = candidates.map(value => PersonSchema.safeParse(value))
  const counts = new Map<string, number>()
  for (const value of parsed) if (value.success) counts.set(key(value.data.id), (counts.get(key(value.data.id)) ?? 0) + 1)
  const rows: ActiveRanking[] = []
  for (const value of parsed) if (value.success && counts.get(key(value.data.id)) === 1) {
    const result = evaluate(a.data, value.data, context.data)
    if (result) rows.push(result)
  }
  const descending = (a: number, b: number) => a > b ? -1 : a < b ? 1 : 0
  const ascending = (a: number, b: number) => a < b ? -1 : a > b ? 1 : 0
  return rows.sort((a, b) => ascending(a.distanceMiles, b.distanceMiles) || descending(a.friendScore ?? 0, b.friendScore ?? 0) || descending(a.sharedInterestCount, b.sharedInterestCount) || descending(a.overlapSeconds, b.overlapSeconds) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}
