import { z } from 'zod'
import { FriendsLabelSchema } from './friends-search-preferences.js'
const id = z.uuid().transform(value => value.toLowerCase())
export const SearchModeSchema = z.enum(['friends', 'dating'])
export const SearchPlaceSchema = z.object({ id, label: FriendsLabelSchema, region: z.string().max(120) }).strict()
export const SearchPlacesSchema = z.object({ places: z.array(SearchPlaceSchema).max(10) }).strict()
export const ResolveSearchAreaSchema = z.object({ requestId: id, mode: SearchModeSchema, source: z.enum(['home', 'temporary']), placeId: id }).strict()
export const BrowserSearchLocationSchema = z.object({ requestId: id, mode: SearchModeSchema, latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), accuracyMeters: z.number().positive().max(1000), observedAt: z.iso.datetime({ offset: true }), consent: z.literal(true) }).strict()
export const SearchLocationReceiptSchema = z.object({ id, mode: SearchModeSchema, source: z.enum(['home', 'temporary']), areaLabel: FriendsLabelSchema,
  method: z.enum(['geocoded-area', 'device-reported', 'selected-area']), expiresAt: z.iso.datetime({ offset: true }), usable: z.boolean() }).strict()
export type SearchLocationReceipt = z.infer<typeof SearchLocationReceiptSchema>
export type ResolveSearchArea = z.infer<typeof ResolveSearchAreaSchema>
export type BrowserSearchLocation = z.infer<typeof BrowserSearchLocationSchema>
