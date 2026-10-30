import { z } from 'zod'
import { DatingAggregateSchema } from './dating.js'
import { MatchingProfileSchema } from './matchmaking.js'
import { discoveryDetailFields } from './discovery-details.js'
export const DatingRuntimeSchema=z.object({available:z.literal(true),aggregate:DatingAggregateSchema,canStart:z.boolean(),globalDiscovery:z.boolean(),datingDiscovery:z.boolean()}).strict()
export const DatingEnableSchema=z.object({expectedProfileRevision:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER-1),expectedSearchRevision:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER-1),enabled:z.boolean()}).strict()
export const DatingCandidateRequestSchema=z.object({excludedIds:z.array(z.uuid()).max(50).refine(value=>new Set(value).size===value.length)}).strict()
export const DatingCandidateSchema=z.object({...discoveryDetailFields,id:z.uuid(),name:MatchingProfileSchema.shape.display_name,age:z.number().int().min(18).max(99),city:MatchingProfileSchema.shape.location_city,bio:MatchingProfileSchema.shape.bio,
 avatar:MatchingProfileSchema.shape.avatar_url,photoRevision:z.number().int().nonnegative().safe(),interests:MatchingProfileSchema.shape.interests,
 areaDistanceMiles:z.number().int().nonnegative().max(100),heightInches:z.number().int().min(24).max(107).nullable(),gender:z.string().max(120).nullable(),sexuality:z.string().max(120).nullable(),intent:z.string().max(120),style:z.string().max(120)}).strict()
export const DatingCandidateResultSchema=z.object({candidate:DatingCandidateSchema.nullable()}).strict()
export const DatingBatchRequestSchema=DatingCandidateRequestSchema.extend({limit:z.number().int().min(1).max(10).default(10)}).strict()
export const DatingBatchResponseSchema=z.object({candidates:z.array(DatingCandidateSchema).max(10),algorithmVersion:z.literal('dating-rules-v1')}).strict().refine(value=>new Set(value.candidates.map(person=>person.id)).size===value.candidates.length)
export type DatingCandidate=z.infer<typeof DatingCandidateSchema>
export type DatingRuntime=z.infer<typeof DatingRuntimeSchema>
export type DatingEnable=z.infer<typeof DatingEnableSchema>
