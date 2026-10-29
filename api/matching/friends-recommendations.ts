import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { FriendsBatchResponseSchema, FriendsProjectionSchema } from '../../shared/friends-discovery.js'
import { friendsConfig } from './friends-config.js'
import { rankFriendsPool } from './friends-scoring.js'

export interface FriendsScoringTransport {
  pool(actorId: string, excludedIds: string[]): Promise<unknown>
}
export function createFriendsScoringTransport(url: string, serviceKey: string): FriendsScoringTransport {
  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  return {
    async pool(actorId, excludedIds) {
      const { data, error } = await client.rpc('get_friends_scoring_pool', {
        actor_in: z.uuid().parse(actorId), excluded_in: excludedIds,
      }).abortSignal(AbortSignal.timeout(5000)).retry(false)
      if (error) throw new Error('Friends scoring pool unavailable')
      return data
    },
  }
}

export async function rankedFriendsBatch(
  transport: FriendsScoringTransport, actorId: string, excludedIds: string[], limit: number,
  project: (targets: string[]) => PromiseLike<{ data: unknown; error: { code?: string } | null }>,
) {
  const ranked = rankFriendsPool(await transport.pool(actorId, excludedIds))
  if (ranked.some(person => person.id === actorId || excludedIds.includes(person.id))) throw new Error('Invalid Friends pool identity')
  const targets = ranked.slice(0, friendsConfig.maxProjectionCandidates).map(person => person.id)
  if (!targets.length) return { candidates: [], algorithmVersion: friendsConfig.version }
  // One actor-JWT transaction projects all candidates and rechecks current hard
  // constraints. Reject unrequested/duplicate/private fields, never spread raw SQL.
  const result = await project(targets)
  if (result.error) throw new Error('Friends eligibility could not be confirmed')
  const safe = FriendsProjectionSchema.parse(result.data)
  const allowed = new Set(targets)
  if (safe.candidates.some(person => !allowed.has(person.id))) throw new Error('Friends projection mismatch')
  const byId = new Map(safe.candidates.map(person => [person.id, person]))
  const candidates = targets.flatMap(id => { const person = byId.get(id); return person ? [person] : [] }).slice(0, limit)
  return FriendsBatchResponseSchema.parse({ candidates, algorithmVersion: friendsConfig.version })
}
