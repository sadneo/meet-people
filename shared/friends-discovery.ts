import { z } from 'zod'
import { MatchingProfileSchema } from './matchmaking.js'
import { discoveryDetailFields } from './discovery-details.js'
const id = z.uuid().transform(value => value.toLowerCase())

export const FriendsBatchRequestSchema = z.object({
  excludedIds: z.array(id).max(200).refine(values => new Set(values).size === values.length, 'Choose distinct IDs.'),
  limit: z.number().int().min(1).max(10).default(10),
}).strict()
export const FriendsDiscoveryCandidateSchema = z.object({
  ...discoveryDetailFields,
  id, name: MatchingProfileSchema.shape.display_name,
  age: z.number().int().min(18).max(99),
  city: MatchingProfileSchema.shape.location_city, bio: MatchingProfileSchema.shape.bio,
  avatar: MatchingProfileSchema.shape.avatar_url,
  photoRevision: z.number().int().nonnegative().safe(),
  interests: MatchingProfileSchema.shape.interests,
  areaDistanceMiles: z.number().int().min(0).max(100),
}).strict()
export const FriendsProjectionSchema = z.object({
  candidates: z.array(FriendsDiscoveryCandidateSchema).max(30),
}).strict().refine(value => new Set(value.candidates.map(person => person.id)).size === value.candidates.length)
export const FriendsBatchResponseSchema = z.object({
  candidates: z.array(FriendsDiscoveryCandidateSchema).max(10),
  algorithmVersion: z.literal('friends-rules-v1'),
}).strict().refine(value => new Set(value.candidates.map(person => person.id)).size === value.candidates.length)
export type FriendsDiscoveryCandidate = z.infer<typeof FriendsDiscoveryCandidateSchema>
