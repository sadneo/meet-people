import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { DatingCandidateResultSchema, DatingBatchResponseSchema } from '../../shared/dating-live.js'
import { rankDatingPool } from './dating-scoring.js'

export interface DatingScoringTransport {
  pool(actorId: string, excludedIds: string[]): Promise<unknown>
}
export class DatingEligibilityError extends Error {
  constructor() { super('Dating requires an eligible adult profile, saved preferences and a confirmed search area. Review your Dating setup.') }
}

// A separate client with server credentials. Never reuse an actor client or
// expose this transport through an actor-accessible RPC.
export function createDatingScoringTransport(url: string, serviceKey: string): DatingScoringTransport {
  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  return {
    async pool(actorId, excludedIds) {
      const { data, error } = await client.rpc('get_dating_scoring_pool', {
        actor_in: z.uuid().parse(actorId), excluded_in: excludedIds,
      }).abortSignal(AbortSignal.timeout(5000)).retry(false)
      if (error?.code === 'DL409') throw new DatingEligibilityError()
      if (error) throw new Error('Dating scoring pool unavailable')
      return data
    },
  }
}

export async function rankedDatingCandidate(
  transport: DatingScoringTransport,
  actorId: string,
  excludedIds: string[],
  project: (target: string) => PromiseLike<{ data: unknown; error: { code?: string } | null }>,
) {
  const ranked = rankDatingPool(await transport.pool(actorId, excludedIds))
  if (ranked.some(candidate => candidate.id === actorId || excludedIds.includes(candidate.id))) {
    throw new Error('Invalid Dating pool identity')
  }
  // Projection is an actor RPC and locks/rechecks eligibility. No private inputs,
  // scores, hidden intentions or schedules are serialized into the HTTP result.
  // A changed candidate yields null. Bound revalidation to avoid a retry storm.
  for (const candidate of ranked.slice(0, 3)) {
    const result = await project(candidate.id)
    if (result.error?.code === 'DL409') throw new DatingEligibilityError()
    if (result.error) throw new Error('Dating eligibility could not be confirmed')
    const projected = DatingCandidateResultSchema.parse(result.data)
    if (projected.candidate && projected.candidate.id !== candidate.id) throw new Error('Dating projection mismatch')
    if (projected.candidate) return projected
  }
  return { candidate: null }
}
export async function rankedDatingBatch(transport: DatingScoringTransport, actorId: string, excludedIds: string[], limit: number,
  project: (target: string) => PromiseLike<{data:unknown;error:{code?:string}|null}>) {
  const ranked=rankDatingPool(await transport.pool(actorId,excludedIds))
  if(ranked.some(person=>person.id===actorId||excludedIds.includes(person.id)))throw new Error('Invalid Dating pool identity')
  const candidates=[]
  for(let offset=0;offset<Math.min(20,ranked.length)&&candidates.length<limit;offset+=3){
    const batch=await Promise.all(ranked.slice(offset,offset+3).map(async person=>{
      const result=await project(person.id)
      if(result.error?.code==='DL409')throw new DatingEligibilityError()
      if(result.error)throw new Error('Dating eligibility could not be confirmed')
      const safe=DatingCandidateResultSchema.parse(result.data)
      if(safe.candidate&&safe.candidate.id!==person.id)throw new Error('Dating projection mismatch')
      return safe.candidate
    }))
    candidates.push(...batch.filter(person=>person!==null))
  }
  return DatingBatchResponseSchema.parse({candidates:candidates.slice(0,limit),algorithmVersion:'dating-rules-v1'})
}
