import { z } from 'zod'

export const EventQuerySchema = z.object({
  category: z.string().trim().min(1).max(80).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
}).refine(value => (value.latitude === undefined) === (value.longitude === undefined), 'Coordinates must be supplied together.')

export const EventSchema = z.object({
  id: z.string().uuid(), title: z.string(), description: z.string().nullable(),
  category: z.string().nullable(), starts_at: z.string().nullable(), ends_at: z.string().nullable(),
  location_name: z.string().nullable(), address: z.string().nullable(), city: z.string().nullable(),
  image_url: z.string().nullable(), source: z.string(), source_url: z.string().nullable(),
  status: z.string(), distance_miles: z.number().nullable(),
  interested_count: z.number().int().nonnegative(),
})
export type LiveEvent = z.infer<typeof EventSchema>
export const EventsResponseSchema = z.object({ events: z.array(EventSchema), categories: z.array(z.string()), page: z.number(), hasMore: z.boolean() })
export const EventCompanySchema = z.object({
  interested: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
  interestedCount: z.number(), isInterested: z.boolean(),
  group: z.object({ id: z.string().uuid(), members: z.array(z.object({ id: z.string().uuid(), name: z.string() })) }).nullable(),
})
export type EventCompany = z.infer<typeof EventCompanySchema>
