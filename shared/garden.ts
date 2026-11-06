import { z } from 'zod'

export const GardenCommandSchema = z.object({
  requestId: z.uuid(), revision: z.number().int().nonnegative(),
  action: z.enum(['check-in', 'profile-reward', 'connection-reward', 'keep-in-touch', 'build', 'remove', 'geode', 'reset', 'move', 'undo']),
  id: z.string().max(40).optional(),
  position: z.object({ x: z.number().finite().min(0).max(1448), y: z.number().finite().min(0).max(1086) }).strict().optional(),
}).strict().superRefine((value, ctx) => {
  const needsId = ['build', 'remove', 'move'].includes(value.action)
  if (needsId !== (value.id !== undefined) || (value.action === 'move') !== (value.position !== undefined))
    ctx.addIssue({ code: 'custom', message: 'Unexpected Garden action fields.' })
})
export type GardenCommand = z.infer<typeof GardenCommandSchema>
export const GardenResponseSchema = z.object({
  revision: z.number().int().nonnegative(), canUndo: z.boolean(),
  community: z.object({
    balance: z.number().int().nonnegative().max(1000000), owned: z.array(z.string()),
    earnedChapters: z.array(z.number()), geodeUnlocks: z.array(z.string()),
    positions: z.record(z.string(), z.object({x:z.number(),y:z.number()})),
    purchaseCosts: z.record(z.string(), z.number().int().nonnegative()), freshStart: z.boolean(),
  }),
  rewards: z.object({
    day: z.string(), nextCheckIn: z.string(), checkedIn: z.boolean(), weekDays: z.number().int().min(0).max(7),
    weeklyBonus: z.boolean(), profileClaimed: z.boolean(), profileEligible: z.boolean(),
    // Optional during rolling upgrades: old rewards still work before the additive migration.
    weekStart: z.iso.date().optional(), checkInDays: z.array(z.iso.date()).max(7).optional(),
    social: z.object({connectionsClaimed:z.number().int().min(0).max(2),connectionAvailable:z.boolean(),keepInTouchClaimed:z.boolean(),keepInTouchAvailable:z.boolean()}).optional(),
  }),
})
export type GardenResponse = z.infer<typeof GardenResponseSchema>
export type GardenRewardAction = Extract<GardenCommand['action'],'check-in'|'profile-reward'|'connection-reward'|'keep-in-touch'>
export function hasGardenReward(rewards?:GardenResponse['rewards']) {
  return !!rewards && (!rewards.checkedIn || (rewards.profileEligible&&!rewards.profileClaimed) || rewards.social?.connectionAvailable===true || rewards.social?.keepInTouchAvailable===true)
}
