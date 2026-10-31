import { z } from 'zod'

// No private scoring payload is part of a browser response contract.
export const MatchingScoringSettingsSchema = z.object({
  timeZone: z.string().max(100).refine(value => {
    // Use named IANA zones, not fixed offsets or the backend machine's timezone.
    if (value !== 'UTC' && !value.includes('/')) return false
    try { new Intl.DateTimeFormat('en', { timeZone: value }).format(); return true } catch { return false }
  }).nullable(),
  showAvailability: z.boolean(),
}).strict()
export const SaveMatchingScoringSettingsSchema = MatchingScoringSettingsSchema.extend({
  expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1),
}).strict()
export const MatchingScoringSettingsResponseSchema = MatchingScoringSettingsSchema.extend({
  revision: z.number().int().nonnegative().safe(),
}).strict()
export type SaveMatchingScoringSettings = z.infer<typeof SaveMatchingScoringSettingsSchema>
