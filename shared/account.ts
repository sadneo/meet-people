import { z } from 'zod'
import { MatchingProfileSchema } from './matchmaking.js'
import { interestSelectionProblem } from './interests.js'
import { ReadyPreferencesSchema } from './profile-readiness.js'

export const accountOnboardingHeader = 'X-Pebble-Onboarding'

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
// Installed clients still validate the original four-chapter payload on each save.
export function legacyAccountChapters(value: AccountData): number[] {
  if (!value.profile) return []
  if (interestSelectionProblem(value.profile.interests)) return [0]
  if (!value.preferences.intents.length) return [0, 1]
  if (!value.preferences.distance || !value.preferences.group || !ReadyPreferencesSchema.safeParse(value.profile).success) return [0, 1, 2]
  return [0, 1, 2, 3]
}
// Account admission depends on saved identity and birthday. The existing
// completion array remains on the wire for older clients and Garden rewards.
export function hasBasicProfile(profile: AccountData['profile'] | undefined): boolean {
  return Boolean(profile?.display_name.trim() && profile.username.trim() && profile.birthdate)
}

export function completedAccountChapters(value: AccountData): number[] {
  if (hasBasicProfile(value.profile)) return [0, 1, 2, 3]
  if (!value.profile) return []
  // Older callers could save interests and intents before supplying a birthday.
  if (interestSelectionProblem(value.profile.interests)) return [0]
  return value.preferences.intents.length ? [0, 1, 2] : [0, 1]
}
export const AccountSchema = AccountDataSchema
export const SaveAccountSchema = AccountSchema.safeExtend({
  initialTimeZone: z.string().max(100).regex(/^(?:UTC|[A-Za-z_]+\/[A-Za-z0-9_+/-]+)$/).optional(),
})
  .superRefine((value, context) => {
    if (!value.profile) return;
    const message = interestSelectionProblem(value.profile.interests, false);
    if (message) context.addIssue({ code: 'custom', path: ['profile', 'interests'], message });
  })
  .refine(value => value.completed.length <= completedAccountChapters(value).length, 'Completed chapters must have valid persisted required fields.')
  .refine(value => value.profile !== null, 'Profile is required.')
export type SaveAccount = z.infer<typeof SaveAccountSchema>
export type Account = z.infer<typeof AccountSchema>
export const emptyAccount: Account = { profile: null, preferences: { intents: [], usual: [], distance: '', group: '' }, settings: { notifications: true, availability: true, discoverable: true, location: false }, completed: [] }
