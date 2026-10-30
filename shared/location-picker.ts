import { z } from 'zod'
import { FriendsLabelSchema } from './friends-search-preferences.js'
import { SearchModeSchema } from './search-locations.js'

export const MapCenterSchema = z.object({ latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180) }).strict()
const session = z.uuid()
export const MapSuggestionsRequestSchema = z.object({ mode: SearchModeSchema, sessionToken: session, input: z.string().trim().min(2).max(120) }).strict()
export const MapSuggestionsSchema = z.object({ suggestions: z.array(z.object({ placeId: z.string().min(1).max(255), label: z.string().min(1).max(300) }).strict()).max(10) }).strict()
export const MapPreviewRequestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('place'), mode: SearchModeSchema, placeId: z.string().min(1).max(255), sessionToken: session }).strict(),
  z.object({ kind: z.literal('pin'), mode: SearchModeSchema, center: MapCenterSchema, deviceAssisted: z.boolean().default(false) }).strict(),
])
export const MapTicketSchema = z.object({ payload: z.string().min(1).max(4096), signature: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
export const MapPreviewSchema = z.object({ center: MapCenterSchema, areaLabel: FriendsLabelSchema, ticket: MapTicketSchema, expiresAt: z.iso.datetime({ offset: true }) }).strict()
export const MapSelectionSchema = z.object({ center: MapCenterSchema, areaLabel: FriendsLabelSchema, usable: z.boolean() }).strict()
export const MapConfigSchema = z.object({ available: z.boolean() }).strict()
export type MapCenter = z.infer<typeof MapCenterSchema>
export type MapPreview = z.infer<typeof MapPreviewSchema>
export type MapPreviewRequest = z.infer<typeof MapPreviewRequestSchema>
export type MapSuggestionsRequest = z.infer<typeof MapSuggestionsRequestSchema>
export type MapTicket = z.infer<typeof MapTicketSchema>
