import { z } from 'zod'
import { MatchingProfileSchema, type MatchingProfile } from './matchmaking.js'

// Identity validation stays identical to the established legacy contract.
export const AccountProfileSchema = z.object({
  username: MatchingProfileSchema.shape.username,
  display_name: MatchingProfileSchema.shape.display_name,
  bio: MatchingProfileSchema.shape.bio,
  avatar_url: MatchingProfileSchema.shape.avatar_url,
}).strict()
export type AccountProfile = z.infer<typeof AccountProfileSchema>
export const AccountProfileResponseSchema = z.object({ profile: AccountProfileSchema.nullable() }).strict()
export const SavedAccountProfileResponseSchema = z.object({ profile: AccountProfileSchema }).strict()
export function withAccountIdentity(legacy: MatchingProfile, account: AccountProfile): MatchingProfile {
  return { ...legacy, ...AccountProfileSchema.parse(account) }
}
