import { z } from 'zod'

export const MINIMUM_AGE = 13
export const GROUP_PREFERENCES = ['one_on_one', 'group', 'either'] as const
export const REPORT_REASONS = ['harassment', 'inappropriate_content', 'impersonation', 'other'] as const
export const AVATAR_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const

const label = z.string().trim().min(1).max(40)
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour).')
const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5))
const uniqueCaseless = (values: string[]) => new Set(values.map(value => value.toLowerCase())).size === values.length

export const UsernameSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,30}$/, 'Usernames are 3–30 letters, numbers, or underscores.')

export const BirthdateSchema = z.iso.date().refine(value => {
  const birth = new Date(`${value}T00:00:00Z`)
  const now = new Date()
  const cutoff = new Date(Date.UTC(now.getUTCFullYear() - MINIMUM_AGE, now.getUTCMonth(), now.getUTCDate()))
  return birth <= cutoff && birth.getUTCFullYear() >= 1900
}, `You must be at least ${MINIMUM_AGE}.`)

export const AvailabilityWindowSchema = z.object({ dow: z.number().int().min(0).max(6), start_time: time, end_time: time })
  .refine(window => minutes(window.start_time) < minutes(window.end_time), 'A window must end after it starts.')
export type AvailabilityWindow = z.infer<typeof AvailabilityWindowSchema>

export const AvailabilitySchema = z.array(AvailabilityWindowSchema).max(28).refine(windows => windows.every((a, i) =>
  windows.every((b, j) => i === j || a.dow !== b.dow || minutes(a.end_time) <= minutes(b.start_time) || minutes(b.end_time) <= minutes(a.start_time))),
'Availability windows on the same day cannot overlap.')

// Every field is optional so the same schema serves partial edits; creating a
// profile additionally requires username and display_name (checked by the API).
export const ProfileUpdateSchema = z.object({
  username: UsernameSchema,
  display_name: z.string().trim().min(1).max(30),
  bio: z.string().trim().max(160).nullable(),
  pronouns: z.string().trim().max(30).nullable(),
  birthdate: BirthdateSchema.nullable(),
  location_city: z.string().trim().max(80).nullable(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  intents: z.array(label).max(10).refine(uniqueCaseless, 'Duplicate intents.'),
  usual_times: z.array(label).max(7).refine(uniqueCaseless, 'Duplicate times.'),
  max_distance_miles: z.number().int().min(1).max(100),
  group_preference: z.enum(GROUP_PREFERENCES),
  interests: z.array(label).max(20).refine(uniqueCaseless, 'Duplicate interests.'),
  availability: AvailabilitySchema,
  onboarded: z.literal(true),
}).partial().strict()
  .refine(value => (value.latitude === undefined) === (value.longitude === undefined), 'Coordinates must be supplied together.')
  .refine(value => (value.latitude === null) === (value.longitude === null), 'Coordinates must be cleared together.')
export type ProfileUpdate = z.infer<typeof ProfileUpdateSchema>

export const PublicProfileSchema = z.object({
  id: z.guid(), username: z.string(), display_name: z.string(),
  bio: z.string().nullable(), pronouns: z.string().nullable(), location_city: z.string().nullable(),
  avatar_url: z.string().nullable(), intents: z.array(z.string()), interests: z.array(z.string()),
  availability: z.array(AvailabilityWindowSchema).nullable(), is_connected: z.boolean(),
})
export type PublicProfile = z.infer<typeof PublicProfileSchema>

export const OwnProfileSchema = PublicProfileSchema.extend({
  birthdate: z.string().nullable(), latitude: z.number().nullable(), longitude: z.number().nullable(),
  usual_times: z.array(z.string()), max_distance_miles: z.number().int(),
  group_preference: z.enum(GROUP_PREFERENCES), onboarded_at: z.string().nullable(),
  username_changeable_at: z.string().nullable(),
  created_at: z.string().nullable(), updated_at: z.string().nullable(),
})
export type OwnProfile = z.infer<typeof OwnProfileSchema>

// null locale/timezone means "follow the device".
export const SettingsSchema = z.object({
  notifications: z.boolean(), discoverable: z.boolean(),
  share_availability: z.boolean(), nearby_suggestions: z.boolean(),
  dating_enabled: z.boolean(), downtime_matching: z.boolean(),
  locale: z.string().nullable(), timezone: z.string().nullable(),
})
export type Settings = z.infer<typeof SettingsSchema>

export const LocaleSchema = z.string().trim().max(35).transform((value, context) => {
  try {
    const [canonical] = Intl.getCanonicalLocales(value)
    if (canonical) return canonical
  } catch { /* reported below */ }
  context.addIssue({ code: 'custom', message: 'Unknown language.' })
  return z.NEVER
})
export const TimezoneSchema = z.string().trim().max(64).refine(value => {
  try { return Boolean(new Intl.DateTimeFormat('en-US', { timeZone: value })) } catch { return false }
}, 'Unknown time zone.')

export const SettingsUpdateSchema = SettingsSchema.extend({
  locale: LocaleSchema.nullable(), timezone: TimezoneSchema.nullable(),
}).partial().strict().refine(value => Object.keys(value).length > 0, 'Change at least one setting.')

export const AccountSchema = z.object({
  id: z.guid(), email: z.string().nullable(), created_at: z.string().nullable(),
  // Set while an email change waits for confirmation.
  pending_email: z.string().nullable(),
  providers: z.array(z.string()),
  mfa_enabled: z.boolean(),
})
export const MeResponseSchema = z.object({ account: AccountSchema, profile: OwnProfileSchema.nullable(), settings: SettingsSchema.nullable() })
export type MeResponse = z.infer<typeof MeResponseSchema>

export const BlockedUserSchema = z.object({ id: z.guid(), username: z.string(), display_name: z.string(), avatar_url: z.string().nullable(), blocked_at: z.string() })
export type BlockedUser = z.infer<typeof BlockedUserSchema>

export const ReportSchema = z.object({ reason: z.enum(REPORT_REASONS), details: z.string().trim().max(400).optional() }).strict()

export const AvatarUploadRequestSchema = z.object({ content_type: z.enum(Object.keys(AVATAR_TYPES) as [keyof typeof AVATAR_TYPES, ...(keyof typeof AVATAR_TYPES)[]]) }).strict()
export const AvatarUploadSchema = z.object({ path: z.string(), token: z.string(), signed_url: z.string(), public_url: z.string() })

export const EmailChangeSchema = z.object({ email: z.string().trim().toLowerCase().pipe(z.email().max(254)) }).strict()
// 72 is bcrypt's limit; Supabase Auth applies its own strength rules on top.
export const PasswordChangeSchema = z.object({ password: z.string().min(8).max(72) }).strict()

export const SessionSchema = z.object({
  id: z.guid(), created_at: z.string(), last_active_at: z.string(),
  user_agent: z.string().nullable(), ip: z.string().nullable(), aal: z.string().nullable(),
  current: z.boolean(),
})
export type Session = z.infer<typeof SessionSchema>

export const DataExportSchema = z.object({ id: z.guid(), created_at: z.string(), expires_at: z.string(), download_url: z.string() })
export type DataExport = z.infer<typeof DataExportSchema>

export const DeleteAccountSchema = z.object({ confirm: z.literal('DELETE') }).strict()
