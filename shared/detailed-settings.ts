import { z } from 'zod'
import { AccountSettingsSchema } from './account.js'
import { ProfileDetailsErrorSchema } from './profile-details.js'

export const DetailedSettingsValuesSchema = z.object({ messages: z.boolean(), plans: z.boolean(), matches: z.boolean(), friendsDiscovery: z.boolean(), datingDiscovery: z.boolean() }).strict()
export type DetailedSettingsValues = z.infer<typeof DetailedSettingsValuesSchema>
export const DetailedSettingsMastersSchema = z.object({ notifications: z.boolean(), discoverable: z.boolean() }).strict()
export type DetailedSettingsMasters = z.infer<typeof DetailedSettingsMastersSchema>
export function emptyDetailedSettings(): DetailedSettingsValues {
  return { messages: false, plans: false, matches: false, friendsDiscovery: false, datingDiscovery: false }
}
export function sameDetailedSettings(a: DetailedSettingsValues, b: DetailedSettingsValues) {
  return a.messages === b.messages && a.plans === b.plans && a.matches === b.matches && a.friendsDiscovery === b.friendsDiscovery && a.datingDiscovery === b.datingDiscovery
}
// Do not pass get_account's defaulted document here. Only an actual persisted
// account_settings.settings row establishes masters; malformed/missing is unknown.
export function mastersFromLegacySettings(value: unknown): DetailedSettingsMasters | null {
  const parsed = AccountSettingsSchema.safeParse(value)
  return parsed.success ? { notifications: parsed.data.notifications, discoverable: parsed.data.discoverable } : null
}
// Preference masking only, NOT delivery or verified live discovery activation.
export function effectiveDetailedSettings(settings: DetailedSettingsValues, masters: DetailedSettingsMasters | null): DetailedSettingsValues {
  return { messages: masters?.notifications === true && settings.messages, plans: masters?.notifications === true && settings.plans, matches: masters?.notifications === true && settings.matches,
    friendsDiscovery: masters?.discoverable === true && settings.friendsDiscovery, datingDiscovery: masters?.discoverable === true && settings.datingDiscovery }
}
const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
export const DetailedSettingsSchema = z.object({ revision, settings: DetailedSettingsValuesSchema, masters: DetailedSettingsMastersSchema.nullable(), effective: DetailedSettingsValuesSchema }).strict()
  .refine(value => value.revision !== 0 || sameDetailedSettings(value.settings, emptyDetailedSettings()), 'Unstored detailed choices must be off.')
  .refine(value => sameDetailedSettings(value.effective, effectiveDetailedSettings(value.settings, value.masters)), 'Global masters must dominate detailed preferences.')
export const SaveDetailedSettingsSchema = z.object({ expectedRevision: revision.max(Number.MAX_SAFE_INTEGER - 1), settings: DetailedSettingsValuesSchema }).strict()
export const DetailedSettingsErrorSchema = z.object({ code: z.enum(['auth', 'invalid', 'conflict', 'unavailable', 'provider', 'malformed']), error: ProfileDetailsErrorSchema.shape.error }).strict()
export type DetailedSettings = z.infer<typeof DetailedSettingsSchema>
export type SaveDetailedSettings = z.infer<typeof SaveDetailedSettingsSchema>
