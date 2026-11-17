import { z } from 'zod'
export const ProfilePhotoStateSchema=z.object({revision:z.number().int().nonnegative().safe(),hasPhoto:z.boolean(),updatedAt:z.iso.datetime({offset:true}).nullable()}).strict()
 .refine(value=>value.revision!==0||!value.hasPhoto&&value.updatedAt===null)
export type ProfilePhotoState=z.infer<typeof ProfilePhotoStateSchema>
export const ProfilePhotoWriteSchema=z.object({expectedRevision:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER-1),requestId:z.uuid(),jpegBase64:z.string().max(349528).nullable()}).strict()

export type ProfilePhotoWrite=z.infer<typeof ProfilePhotoWriteSchema>

export const profilePhotoLimit = 4
export const ProfileGalleryStateSchema = z.object({
  revision: z.number().int().nonnegative().safe(),
  count: z.number().int().min(0).max(profilePhotoLimit),
}).strict().refine(value => value.revision !== 0 || value.count === 0)
export type ProfileGalleryState = z.infer<typeof ProfileGalleryStateSchema>

const galleryBase = { expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1), requestId: z.uuid() }
const position = z.number().int().min(1).max(profilePhotoLimit)
export const ProfileGalleryChangeSchema = z.discriminatedUnion('action', [
  z.object({ ...galleryBase, action: z.literal('move'), position, toPosition: position }).strict(),
  z.object({ ...galleryBase, action: z.literal('remove'), position }).strict(),
])
export type ProfileGalleryChange = z.infer<typeof ProfileGalleryChangeSchema>
export type ProfileGalleryEdit = ProfileGalleryChange | z.infer<typeof ProfileGalleryAppendSchema>
export const ProfileGalleryAppendSchema = z.object({ ...galleryBase, action: z.literal('append'), jpegBase64: z.string().max(349528) }).strict()
