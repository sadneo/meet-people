import { z } from 'zod'
import { isPublicSupabaseKey } from './env.js'

const JobSchema = z.object({ jobId: z.uuid(), leaseToken: z.uuid(), eventId: z.uuid(), anchorId: z.uuid() }).strict()
const RankedSchema = z.array(z.object({ profile_id: z.uuid() })).max(100)
const FailedSchema = z.object({ state: z.literal('failed') })
export type EventGroupJob = z.infer<typeof JobSchema>
type FailureReason = 'no_candidates' | 'scoring_uncertain' | 'completion_uncertain'
export interface EventGroupWorkerTransport {
  claim(workerId: string, leaseSeconds: number): Promise<unknown>
  rank(job: EventGroupJob): Promise<unknown>
  complete(job: EventGroupJob, members: string[]): Promise<unknown>
  fail(job: EventGroupJob, reason: FailureReason): Promise<unknown>
  reconcile(job: EventGroupJob): Promise<unknown>
}
const SettingsSchema = z.object({ enabled: z.boolean(), scoringEnabled: z.boolean(), workerId: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/), maxJobs: z.number().int().min(1).max(5), timeoutMs: z.number().int().min(1).max(15000), leaseSeconds: z.number().int().min(120).max(600) })
export type WorkerSettings = z.infer<typeof SettingsSchema>
async function timed<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try { return await Promise.race([operation, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Uncertain RPC outcome')), timeoutMs) })]) }
  finally { clearTimeout(timer) }
}
export function selectGroupMembers(job: EventGroupJob, raw: unknown): string[] | null {
  const rows = RankedSchema.parse(raw)
  // No invented threshold or pairwise matcher: anchor + first three distinct
  // eligible Winso-ranked queue peers. SQL must revalidate all consent on commit.
  const members = [job.anchorId]
  for (const row of rows) {
    if (!members.includes(row.profile_id)) members.push(row.profile_id)
    if (members.length === 4) break
  }
  return members.length >= 2 ? members : null
}
export async function runEventGroupCycle(settings: WorkerSettings, factory: () => Promise<EventGroupWorkerTransport>) {
  // These gates precede factory invocation, SDK import, configuration or network.
  if (settings.enabled !== true || settings.scoringEnabled !== true) return { state: 'paused' as const, processed: 0 }
  const config = SettingsSchema.parse(settings)
  const rpc = await factory()
  let processed = 0
  for (let index = 0; index < config.maxJobs; index++) {
    let job: EventGroupJob
    try {
      const claimed = await timed(rpc.claim(config.workerId, config.leaseSeconds), config.timeoutMs)
      if (claimed === null) break
      job = JobSchema.parse(claimed)
    } catch { return { state: 'uncertain' as const, processed } }
    let members: string[] | null
    try { members = selectGroupMembers(job, await timed(rpc.rank(job), config.timeoutMs)) }
    catch {
      try { FailedSchema.parse(await timed(rpc.fail(job, 'scoring_uncertain'), config.timeoutMs)) } catch { /* Lease/reconciliation remains parent-owned. */ }
      return { state: 'uncertain' as const, processed }
    }
    if (!members) {
      try { FailedSchema.parse(await timed(rpc.fail(job, 'no_candidates'), config.timeoutMs)) }
      catch { return { state: 'uncertain' as const, processed } }
      continue
    }
    try {
      z.object({ state: z.literal('completed') }).parse(await timed(rpc.complete(job, members), config.timeoutMs))
      processed++
    } catch {
      try {
        const result = z.object({ state: z.enum(['completed', 'leased', 'expired', 'failed']) }).parse(await timed(rpc.reconcile(job), config.timeoutMs))
        if (result.state === 'completed') processed++
        else if (result.state === 'leased') FailedSchema.parse(await timed(rpc.fail(job, 'completion_uncertain'), config.timeoutMs))
      } catch { /* No retries, guessed completion, or competing actor calls. */ }
      return { state: 'uncertain' as const, processed }
    }
  }
  return { state: 'idle' as const, processed }
}

export async function createEventGroupWorkerTransport(config: { url: string; publicKey: string; workerJwt: string; fetch?: typeof fetch }, gates: Pick<WorkerSettings, 'enabled' | 'scoringEnabled'>): Promise<EventGroupWorkerTransport> {
  if (gates.enabled !== true || gates.scoringEnabled !== true) throw new Error('Worker paused')
  if (!isPublicSupabaseKey(config.publicKey) || !z.string().url().safeParse(config.url).success || !config.workerJwt) throw new Error('Worker configuration unavailable')
  const { createClient } = await import('@supabase/supabase-js')
  const client = createClient(config.url, config.publicKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${config.workerJwt}` }, fetch: config.fetch },
  })
  async function call(name: string, args: Record<string, unknown>) {
    const controller = new AbortController()
    // Supabase awaits the body after fetch resolves headers. Attach cancellation
    // to the entire RPC, including parsing, before releasing its deadline.
    const timer = setTimeout(() => controller.abort(), 15000)
    try {
      const { data, error } = await client.rpc(name, args).abortSignal(controller.signal).retry(false)
      if (error) throw new Error('Worker RPC unavailable')
      return data as unknown
    } finally { clearTimeout(timer) }
  }
  const lease = (job: EventGroupJob) => ({ job_id_in: job.jobId, lease_token_in: job.leaseToken })
  return {
    claim: (workerId, leaseSeconds) => call('claim_event_group_job', { worker_id: workerId, lease_seconds: leaseSeconds }),
    rank: job => call('worker_rank_event_group', lease(job)),
    complete: (job, members) => call('complete_event_group_job', { ...lease(job), members }),
    fail: (job, reason) => call('fail_event_group_job', { ...lease(job), reason_code: reason }),
    reconcile: job => call('reconcile_event_group_job', lease(job)),
  }
}
