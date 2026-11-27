import { z } from 'zod'
import { EventSchema } from './events.js'

export const EVENT_PICKS_LIMIT = 3

// Why a pick was chosen. The app words it; only interests the people show on
// their own cards are ever named.
export const EventPickReasonSchema = z.object({
  kind: z.enum(['shared', 'viewer', 'peer', 'both']),
  viewerInterest: z.string().nullable(),
  peerInterest: z.string().nullable(),
}).strict()
export const EventPickSchema = z.object({ event: EventSchema, reason: EventPickReasonSchema }).strict()
export const EventPicksResponseSchema = z.object({
  picks: z.array(EventPickSchema).max(EVENT_PICKS_LIMIT),
  algorithmVersion: z.string(),
}).strict()

// Private inputs from get_conversation_event_pool (backend service only).
const miles = z.number().nonnegative().nullable()
export const EventPoolEventSchema = EventSchema.omit({ distance_miles: true }).extend({
  viewerDistanceMiles: miles, peerDistanceMiles: miles,
}).strict()
export const EventPoolSchema = z.object({
  mode: z.enum(['friends', 'dating']).nullable(),
  viewerInterests: z.array(z.string()).max(20),
  peerInterests: z.array(z.string()).max(20),
  viewerRadiusMiles: z.number().int().positive().nullable(),
  peerRadiusMiles: z.number().int().positive().nullable(),
  events: z.array(EventPoolEventSchema).max(200),
}).strict()

export type EventPickReason = z.infer<typeof EventPickReasonSchema>
export type EventPick = z.infer<typeof EventPickSchema>
export type EventPicksResponse = z.infer<typeof EventPicksResponseSchema>
export type EventPool = z.infer<typeof EventPoolSchema>
export type EventPoolEvent = z.infer<typeof EventPoolEventSchema>
