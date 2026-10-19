import { z } from 'zod'
export const ProfilePhotoStateSchema=z.object({revision:z.number().int().nonnegative().safe(),hasPhoto:z.boolean(),updatedAt:z.iso.datetime({offset:true}).nullable()}).strict()
 .refine(value=>value.revision!==0||!value.hasPhoto&&value.updatedAt===null)
export type ProfilePhotoState=z.infer<typeof ProfilePhotoStateSchema>
export const ProfilePhotoWriteSchema=z.object({expectedRevision:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER-1),requestId:z.uuid(),jpegBase64:z.string().max(349528).nullable()}).strict()

export type ProfilePhotoWrite=z.infer<typeof ProfilePhotoWriteSchema>
