import { z } from 'zod'
import { ProfileFactsSchema, ProfileDetailsErrorSchema, profileLanguageKey } from './profile-details.js'

// Reuse the pinned scalar/length/whitespace policy; never rewrite saved labels.
export const FriendsLabelSchema = ProfileFactsSchema.shape.education.refine(value => profileLanguageKey(value).length > 0, 'Enter a nonblank label.')
const reference = z.uuid().length(36).nullable()
export const FriendsSearchAreaSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('home'), resolvedLocationRef: reference }).strict(),
  z.object({ source: z.literal('temporary'), areaLabel: FriendsLabelSchema, resolvedLocationRef: reference }).strict(),
])
export const FriendsPreferencesSchema = z.object({
  ageMin: z.number().int().min(18).max(99),
  ageMax: z.number().int().min(18).max(99),
  radiusMiles: z.number().int().min(1).max(100),
  goals: z.array(FriendsLabelSchema).max(20).refine(values => new Set(values).size === values.length, 'Choose unique exact goal labels.'),
  searchArea: FriendsSearchAreaSchema,
}).strict().refine(value => value.ageMin <= value.ageMax, 'Minimum age must not exceed maximum age.')
const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
export const FriendsSearchPreferencesSchema = z.object({ revision, preferences: FriendsPreferencesSchema.nullable() }).strict()
  .refine(value => (value.revision === 0) === (value.preferences === null), 'Revision zero means preferences have not been chosen.')
export const SaveFriendsSearchPreferencesSchema = z.object({ expectedRevision: revision.max(Number.MAX_SAFE_INTEGER - 1), preferences: FriendsPreferencesSchema }).strict()
export const FriendsSearchErrorSchema = z.object({ code: z.enum(['auth', 'invalid', 'conflict', 'unavailable', 'provider', 'malformed']), error: ProfileDetailsErrorSchema.shape.error }).strict()
export type FriendsPreferences = z.infer<typeof FriendsPreferencesSchema>
export type FriendsSearchPreferences = z.infer<typeof FriendsSearchPreferencesSchema>
export type SaveFriendsSearchPreferences = z.infer<typeof SaveFriendsSearchPreferencesSchema>
export function sameFriendsPreferences(a: FriendsPreferences, b: FriendsPreferences) {
  return a.ageMin === b.ageMin && a.ageMax === b.ageMax && a.radiusMiles === b.radiusMiles &&
    a.goals.length === b.goals.length && a.goals.every((value, index) => value === b.goals[index]) &&
    a.searchArea.source === b.searchArea.source && a.searchArea.resolvedLocationRef === b.searchArea.resolvedLocationRef &&
    (a.searchArea.source !== 'temporary' || (b.searchArea.source === 'temporary' && a.searchArea.areaLabel === b.searchArea.areaLabel))
}
