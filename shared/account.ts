import { z } from 'zod'
import { MatchingProfileSchema } from './matchmaking.js'
import { ReadyPreferencesSchema } from './profile-readiness.js'

export const AccountPreferencesSchema = z.object({
  intents: z.array(z.string().trim().min(1).max(120)).max(20).refine(values => new Set(values).size === values.length, 'Choose unique social intents.'),
  usual: z.array(z.enum(['Mornings', 'Afternoons', 'Evenings', 'Weekends'])).max(4),
  distance: z.enum(['', 'Nearby', '5 miles', '10 miles']),
  group: z.enum(['', 'One-on-one', 'Small groups', 'Either']),
}).strict()
export const AccountSettingsSchema = z.object({ notifications: z.boolean(), availability: z.boolean(), discoverable: z.boolean(), location: z.boolean() }).strict()
const AccountDataSchema = z.object({
  profile: MatchingProfileSchema.nullable(),
  preferences: AccountPreferencesSchema,
  settings: AccountSettingsSchema,
  completed: z.array(z.number().int().min(0).max(3)).max(4),
}).strict().refine(value => value.completed.every((chapter, i) => chapter === i), 'Chapters must be sequential.')
type AccountData = z.infer<typeof AccountDataSchema>
// Derive a prefix only from real stored data. Existing valid users need no replay;
// legacy profiles lacking private choices resume at social intent, not identity.
export function completedAccountChapters(value: AccountData): number[] {
  if (!value.profile) return []
  if (new Set(value.profile.interests).size < 3) return [0]
  if (!value.preferences.intents.length) return [0, 1]
  if (!value.preferences.distance || !value.preferences.group || !ReadyPreferencesSchema.safeParse(value.profile).success) return [0, 1, 2]
  return [0, 1, 2, 3]
}
// Stored completion markers can predate today's required fields. Read the account
// so onboarding can collect missing facts; never use those markers to grant access.
export const AccountSchema = AccountDataSchema
export const SaveAccountSchema = AccountSchema
  .refine(value => value.completed.length <= completedAccountChapters(value).length, 'Completed chapters must have valid persisted required fields.')
  .refine(value => value.profile !== null, 'Profile is required.')
export type Account = z.infer<typeof AccountSchema>
export const emptyAccount: Account = { profile: null, preferences: { intents: [], usual: [], distance: '', group: '' }, settings: { notifications: true, availability: true, discoverable: true, location: false }, completed: [] }
