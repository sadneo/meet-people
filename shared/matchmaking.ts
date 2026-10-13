import { z } from 'zod'

export const ModeSchema = z.enum(['active', 'downtime'])
export type MatchingMode = z.infer<typeof ModeSchema>
export const JoinQueueSchema = z.object({ mode: ModeSchema }).strict()
export const QueueStatusSchema = z.object({ mode: ModeSchema.nullable() }).strict()
const label = z.string().trim().min(1).max(120)
const safeUrl = z.string().url().max(2048).refine(value => {
  try {
    const parts = /^https:\/\/([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::([0-9]{1,5}))?(?:[/?#][^\s]*)?$/i.exec(value)
    return Boolean(parts && /^[a-z](?:[a-z0-9-]*[a-z0-9])?$/i.test(parts[1].split('.').at(-1) ?? '') && (!parts[2] || Number(parts[2]) <= 65535) && new URL(value).protocol === 'https:')
  }
  catch { return false }
})
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$|^24:00:00$/)
export const AvailabilitySchema = z.object({ dow: z.number().int().min(0).max(6), start_time: time, end_time: time }).strict()
  .refine(value => value.start_time < value.end_time, 'Start must precede end on the same day.')
export const MatchingProfileSchema = z.object({
  username: z.string().trim().min(1).max(80), display_name: label,
  bio: z.string().max(1000).nullable(),
  birthdate: z.iso.date().nullable(), location_city: z.string().trim().max(120).nullable(),
  avatar_url: safeUrl.nullable(), interests: z.array(label).max(30),
  availability: z.array(AvailabilitySchema).max(56),
}).strict().refine(value => new Set(value.interests).size === value.interests.length, 'Duplicate interests.')
  .refine(value => value.availability.every((a, i) => value.availability.every((b, j) => i === j || a.dow !== b.dow || a.end_time <= b.start_time || b.end_time <= a.start_time)), 'Availability windows must not overlap.')
export type MatchingProfile = z.infer<typeof MatchingProfileSchema>
export const ProfileResponseSchema = z.object({ profile: MatchingProfileSchema.nullable() }).strict()
export const SavedProfileResponseSchema = z.object({ profile: MatchingProfileSchema }).strict()
export const ListingIdSchema = z.uuid()
export const ListingInterestRequestSchema = z.object({}).strict()
export const ListingMatchmakingStatusSchema = z.object({ isInterested: z.boolean(), available: z.boolean() }).strict()
export type ListingMatchmakingStatus = z.infer<typeof ListingMatchmakingStatusSchema>
export const EventCompatibilityCandidateSchema = z.object({ id: z.uuid(), name: label, avatar: safeUrl.nullable(), interests: z.array(label).max(30) }).strict()
export const EventCompatibilityResponseSchema = z.object({ candidates: z.array(EventCompatibilityCandidateSchema) }).strict()
export type EventCompatibilityCandidate = z.infer<typeof EventCompatibilityCandidateSchema>
// Preserve the SQL ranking order; private columns are deliberately not consumed.
export const RawListingEventMatchesSchema = z.array(z.object({ profile_id: z.uuid(), display_name: label, avatar_url: safeUrl.nullable(), shared_interests: z.array(label).max(30) }))
export const EventGroupMemberSchema = z.object({ id: z.uuid(), name: label, avatar: safeUrl.nullable() })
export const EventGroupProposalSchema = z.object({ id: z.uuid(), members: z.array(EventGroupMemberSchema).min(2).max(4), eventId: z.uuid() })
  .refine(value => new Set(value.members.map(member => member.id)).size === value.members.length, 'Duplicate proposal members.')
export const EventGroupQueueSchema = z.object({ state: z.enum(['idle', 'waiting', 'proposal']), proposal: EventGroupProposalSchema.nullable() })
  .refine(value => (value.state === 'proposal') === (value.proposal !== null), 'Invalid proposal state.')
export type EventGroupQueue = z.infer<typeof EventGroupQueueSchema>
export const MatchingNotificationSchema = z.object({ id: z.uuid(), eventId: z.uuid(), proposalId: z.uuid(), readAt: z.iso.datetime({ offset: true }).nullable(), createdAt: z.iso.datetime({ offset: true }), title: label })
export const MatchingNotificationsSchema = z.object({ notifications: z.array(MatchingNotificationSchema).max(200), unreadCount: z.number().int().min(0).max(200) })
  .refine(value => value.unreadCount === value.notifications.filter(item => item.readAt === null).length, 'Invalid unread count.')
  .refine(value => new Set(value.notifications.map(item => item.id)).size === value.notifications.length, 'Duplicate notifications.')
export type MatchingNotifications = z.infer<typeof MatchingNotificationsSchema>
export const MeetupSchema = z.object({ id: z.number().int().positive().safe(), title: label.nullable(), location: z.string().max(200).nullable(), startsAt: z.iso.datetime({ offset: true }).nullable() }).strict()
export const CandidateSchema = z.object({ id: z.uuid(), name: label, avatar: safeUrl.nullable(), interests: z.array(label).max(30), overlap: z.enum(['none', 'some', 'extended']), mode: ModeSchema, meetup: MeetupSchema.nullable() }).strict()
export const MatchResultSchema = z.object({ candidate: CandidateSchema.nullable() }).strict()
export type MatchResult = z.infer<typeof MatchResultSchema>
export const MatchingErrorSchema = z.object({ code: z.enum(['auth', 'invalid', 'unavailable', 'provider', 'malformed']), error: z.string().max(160) }).strict()

// Validate the consumed raw SQL columns, then construct a separate public object.
export const RawQueueStatusSchema = z.array(z.object({ my_queue: z.enum(['matchmaking', 'downtime', 'dating']).nullable() })).length(1)
export const RawMatchSchema = z.array(z.object({
  queue_kind: z.enum(['matchmaking', 'downtime']), match_profile_id: z.uuid(),
  match_display_name: label, match_avatar_url: safeUrl.nullable(),
  shared_interests: z.array(label).max(30), overlap_minutes: z.number().int().nonnegative().max(10080),
  event_id: z.number().int().positive().safe().nullable(), event_title: label.nullable(),
  event_location: z.string().max(200).nullable(), event_starts_at: z.iso.datetime({ offset: true }).nullable(),
})).max(1)
