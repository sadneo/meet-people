import { z } from 'zod'
import { MatchingProfileSchema } from './matchmaking.js'

export const AccountPreferencesSchema = z.object({
  intents: z.array(z.string().trim().min(1).max(120)).max(20),
  usual: z.array(z.enum(['Mornings', 'Afternoons', 'Evenings', 'Weekends'])).max(4),
  distance: z.enum(['Nearby', '5 miles', '10 miles']),
  group: z.enum(['One-on-one', 'Small groups', 'Either']),
}).strict()
export const AccountSettingsSchema = z.object({ notifications: z.boolean(), availability: z.boolean(), discoverable: z.boolean(), location: z.boolean() }).strict()
export const AccountSchema = z.object({
  profile: MatchingProfileSchema.nullable(),
  preferences: AccountPreferencesSchema,
  settings: AccountSettingsSchema,
  completed: z.array(z.number().int().min(0).max(3)).max(4),
}).strict().refine(value => value.completed.every((chapter, i) => chapter === i), 'Chapters must be sequential.')
export const SaveAccountSchema = AccountSchema.refine(value => value.profile !== null, 'Profile is required.')
  .refine(value => !value.completed.length || Boolean(value.profile?.display_name.trim() && value.profile.bio?.trim()), 'Basic profile is incomplete.')
  .refine(value => value.completed.length < 2 || Boolean(value.profile?.interests.length), 'Select interests.')
  .refine(value => value.completed.length < 3 || Boolean(value.preferences.intents.length), 'Select social intent.')
  .refine(value => value.completed.length < 4 || Boolean(value.preferences.usual.length || value.profile?.availability.length), 'Select availability.')
export type Account = z.infer<typeof AccountSchema>
export const emptyAccount: Account = { profile: null, preferences: { intents: [], usual: [], distance: '5 miles', group: 'Either' }, settings: { notifications: true, availability: true, discoverable: true, location: false }, completed: [] }
