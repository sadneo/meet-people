import { z } from 'zod'
import { PublicProfileDetailsSchema } from './profile-details.js'

export const discoveryDetailFields = {
  details: PublicProfileDetailsSchema.optional(),
  sharedAvailability: z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    period: z.enum(['morning', 'afternoon', 'evening', 'late night']),
    timeZone: z.string().min(1).max(100),
  }).strict().nullable().optional(),
}
