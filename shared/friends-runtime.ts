import { z } from 'zod'
export const FriendsRuntimeSchema=z.object({available:z.literal(true),policy:z.literal('nearby-first-v1'),canJoin:z.boolean()}).strict()
