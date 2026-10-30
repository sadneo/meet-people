import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { ActiveWorkerResultSchema } from '../../shared/active-friends.js'
import { ActivePoolSchema, chooseActiveGroup, type ActiveSelection } from './active-search.js'

export interface ActiveFriendsWorker {
  sweep(): Promise<unknown>
  claim(): Promise<unknown>
  finish(unit: string, token: string, selection: ActiveSelection | null): Promise<unknown>
  reconcile(unit: string): Promise<unknown>
}
export function createActiveFriendsWorker(url: string, serviceKey: string): ActiveFriendsWorker {
  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  async function rpc(name: 'sweep_active_friends' | 'claim_active_friends_job' | 'finish_active_friends_job' | 'reconcile_active_friends_job', args = {}) {
    const { data, error } = await client.rpc(name, args).abortSignal(AbortSignal.timeout(5000)).retry(false)
    if (error) throw new Error('Active matching unavailable')
    return data
  }
  return {
    sweep: () => rpc('sweep_active_friends'), claim: () => rpc('claim_active_friends_job'),
    finish: (unit, token, selection) => rpc('finish_active_friends_job', { unit_in: unit, token_in: token, selection_in: selection }),
    reconcile: unit => rpc('reconcile_active_friends_job', { unit_in: unit }),
  }
}
export async function runActiveFriendsCycle(worker: ActiveFriendsWorker | null) {
  if (!worker) return { state: 'paused' as const, processed: 0 }
  let pool: z.infer<typeof ActivePoolSchema>
  try {
    z.object({ ok: z.literal(true) }).strict().parse(await worker.sweep())
    const raw = await worker.claim()
    if (raw === null) return { state: 'idle' as const, processed: 0 }
    pool = ActivePoolSchema.parse(raw)
  } catch { return { state: 'uncertain' as const, processed: 0 } }
  const selection = chooseActiveGroup(pool)
  try { return ActiveWorkerResultSchema.parse(await worker.finish(pool.unitId, pool.leaseToken, selection)) }
  catch {
    // An uncertain write is reconciled, never submitted again. The lease and
    // scheduled sweep recover infrastructure failures without resetting FIFO age.
    try { return ActiveWorkerResultSchema.parse(await worker.reconcile(pool.unitId)) }
    catch { return { state: 'uncertain' as const, processed: 0 } }
  }
}
