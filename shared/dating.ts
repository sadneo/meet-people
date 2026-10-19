import { z } from 'zod'
import { FriendsSearchAreaSchema } from './friends-search-preferences.js'
import { ProfileFactsSchema, profileLanguageKey, ProfileDetailsErrorSchema } from './profile-details.js'

// Exact owner labels, including legacy/custom text. No trim/case rewrite or
// automatic mapping of a custom gender to binary/Other matching categories.
const label = ProfileFactsSchema.shape.education.refine(value => value === '' || profileLanguageKey(value).length > 0, 'Use a nonblank identity label.')
const target = label.refine(value => value !== '', 'Choose a target.')
export const DatingSearchSchema = z.object({
  ageMin: z.number().int().min(18).max(99), ageMax: z.number().int().min(18).max(99),
  radiusMiles: z.number().int().min(1).max(100), searchArea: FriendsSearchAreaSchema,
}).strict().refine(value => value.ageMin <= value.ageMax, 'Minimum age must not exceed maximum age.')
const profileShape = z.object({
  gender: label, sexuality: label,
  intent: z.enum(['', 'Long-term relationship', 'Long-term, open to short', 'Short-term, open to long', 'Something casual', 'Still figuring it out']),
  style: z.enum(['', 'Monogamy', 'Non-monogamy', 'Exploring my relationship style']),
  heightInches: z.number().int().min(24).max(107).nullable(),
  visibility: z.object({ gender: z.boolean(), sexuality: z.boolean(), height: z.boolean() }).strict(),
  clarifiedTargets: z.array(target).max(4).refine(values => new Set(values).size === values.length, 'Choose unique exact targets.'),
  enabled: z.boolean(),
}).strict()
export type DatingProfile = z.infer<typeof profileShape>
export type DatingSearch = z.infer<typeof DatingSearchSchema>
export function emptyDatingProfile(): DatingProfile {
  return { gender: '', sexuality: '', intent: '', style: '', heightInches: null, visibility: { gender: false, sexuality: false, height: false }, clarifiedTargets: [], enabled: false }
}
function clearTargets(value: DatingProfile): string[] | null {
  if (value.sexuality === 'Straight' && value.gender === 'Man') return ['Woman']
  if (value.sexuality === 'Straight' && value.gender === 'Woman') return ['Man']
  if (value.sexuality === 'Gay' && ['Man', 'Woman'].includes(value.gender)) return [value.gender]
  if (value.sexuality === 'Lesbian' && value.gender === 'Woman') return ['Woman']
  return null
}
export function datingTargets(value: DatingProfile): string[] | null {
  if (!value.gender || !value.sexuality) return null
  return clearTargets(value) ?? (value.clarifiedTargets.length ? value.clarifiedTargets : null)
}
export function reciprocalDatingTargets(a: DatingProfile, b: DatingProfile) {
  return !!datingTargets(a)?.includes(b.gender) && !!datingTargets(b)?.includes(a.gender)
}
export function validDatingTransition(previous: DatingProfile | null, next: DatingProfile) {
  // No stale clarification exists before any identity, including saved empty
  // drafts. A partial identity counts as established: completing/changing its
  // labels still requires a cleared array, then a fresh confirmation save.
  if (!previous || (previous.gender === '' && previous.sexuality === '')) return true
  return (previous.gender === next.gender && previous.sexuality === next.sexuality) || next.clarifiedTargets.length === 0
}
export function completeDatingProfile(value: DatingProfile) { return !!(value.gender && value.sexuality && value.intent && value.style && datingTargets(value)) }
export const DatingProfileSchema = profileShape
  .refine(value => value.clarifiedTargets.length === 0 || (!!value.gender && !!value.sexuality && clearTargets(value) === null), 'Clear mappings need no clarification; missing identity cannot clarify.')
  .refine(value => !value.enabled || completeDatingProfile(value), 'Incomplete Dating details cannot enable consent.')
function calendar(value: unknown): [number, number, number] | null {
  if (typeof value !== 'string' || value.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1] ? [year, month, day] : null
}
// Explicit instant -> approved campus date, independent of the host timezone.
// The RPC's PostgreSQL clock remains authoritative; this is its offline peer.
export function datingCampusDate(instant: Date): string | null {
  if (!Number.isFinite(instant.getTime()) || instant.getUTCFullYear() < 1 || instant.getUTCFullYear() > 9999) return null
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', era: 'short' }).formatToParts(instant)
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? ''
  const date = `${value('year').padStart(4, '0')}-${value('month')}-${value('day')}`
  return value('era') === 'AD' && calendar(date) ? date : null
}
// Fixed campus calendar date, not Date.now() or caller-supplied authoritative DOB.
// Feb 29 birthdays reach the boundary on March 1 in a nonleap year.
export function adultOn(birthdate: unknown, asOf: string) {
  const birth = calendar(birthdate), today = calendar(asOf)
  if (!birth || !today) return false
  const years = today[0] - birth[0] - (today[1] < birth[1] || (today[1] === birth[1] && today[2] < birth[2]) ? 1 : 0)
  return years >= 18
}
export function datingEffectiveEnabled(profile: DatingProfile, search: DatingSearch | null, adult: boolean, locationResolved = false) {
  return profile.enabled && completeDatingProfile(profile) && adult && !!search?.searchArea.resolvedLocationRef && locationResolved
}
const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
export const SaveDatingAggregateSchema = z.object({
  expectedProfileRevision: revision.max(Number.MAX_SAFE_INTEGER - 1), expectedSearchRevision: revision.max(Number.MAX_SAFE_INTEGER - 1),
  profile: DatingProfileSchema, search: DatingSearchSchema.nullable(),
}).strict().refine(value => !value.profile.enabled || !!value.search?.searchArea.resolvedLocationRef, 'Unresolved/missing search may remain draft but cannot enable consent.')
export const DatingAggregateSchema = z.object({
  profileRevision: revision, searchRevision: revision, profile: DatingProfileSchema, search: DatingSearchSchema.nullable(),
  eligibility: z.object({ asOf: z.string().refine(value => calendar(value) !== null), adult: z.boolean(), locationResolved: z.boolean() }).strict(),
  effectiveEnabled: z.boolean(),
}).strict()
  .refine(value => (value.profileRevision === 0) === (value.searchRevision === 0), 'An aggregate cannot be partially absent.')
  .refine(value => value.profileRevision !== 0 || sameDatingProfile(value.profile, emptyDatingProfile()), 'Missing profile uses private default-off values.')
  .refine(value => value.searchRevision !== 0 || value.search === null, 'Missing search has no preference defaults.')
  .refine(value => !value.eligibility.locationResolved || !!value.search?.searchArea.resolvedLocationRef, 'Resolution must reference a selection.')
  .refine(value => value.effectiveEnabled === datingEffectiveEnabled(value.profile, value.search, value.eligibility.adult, value.eligibility.locationResolved), 'Eligibility must dominate effective consent.')
export const DatingErrorSchema = ProfileDetailsErrorSchema
export type SaveDatingAggregate = z.infer<typeof SaveDatingAggregateSchema>
export type DatingAggregate = z.infer<typeof DatingAggregateSchema>
export function sameDatingProfile(a: DatingProfile, b: DatingProfile) {
  return a.gender === b.gender && a.sexuality === b.sexuality && a.intent === b.intent && a.style === b.style && a.heightInches === b.heightInches && a.enabled === b.enabled &&
    a.visibility.gender === b.visibility.gender && a.visibility.sexuality === b.visibility.sexuality && a.visibility.height === b.visibility.height &&
    a.clarifiedTargets.length === b.clarifiedTargets.length && a.clarifiedTargets.every((value, index) => value === b.clarifiedTargets[index])
}
export function sameDatingSearch(a: DatingSearch | null, b: DatingSearch | null) {
  if (!a || !b) return a === b
  return a.ageMin === b.ageMin && a.ageMax === b.ageMax && a.radiusMiles === b.radiusMiles && a.searchArea.source === b.searchArea.source && a.searchArea.resolvedLocationRef === b.searchArea.resolvedLocationRef &&
    (a.searchArea.source !== 'temporary' || (b.searchArea.source === 'temporary' && a.searchArea.areaLabel === b.searchArea.areaLabel))
}
