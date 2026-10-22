import { afterEach, expect, it, vi } from 'vitest'
import { createEventGroupWorkerTransport, runEventGroupCycle, selectGroupMembers, type EventGroupWorkerTransport } from '../../api/event-group-worker'

const anchor = 'a0000000-0000-4000-8000-000000000001'
const other = 'a0000000-0000-4000-8000-000000000002'
const job = { jobId: anchor, leaseToken: other, eventId: other, anchorId: anchor }
const settings = { enabled: true, scoringEnabled: true, workerId: 'test-worker', maxJobs: 2, timeoutMs: 20, leaseSeconds: 120 }
const transport = (): EventGroupWorkerTransport => ({ claim: vi.fn().mockResolvedValueOnce(job).mockResolvedValue(null), rank: vi.fn().mockResolvedValue([{ profile_id: other }]), complete: vi.fn().mockResolvedValue({ state: 'completed' }), fail: vi.fn().mockResolvedValue({ state: 'failed' }), reconcile: vi.fn().mockResolvedValue({ state: 'completed' }) })
afterEach(() => { vi.useRealTimers() })
it('worker gates run before constructing transport or invoking any SDK/network operations', async () => {
  const factory = vi.fn()
  for (const [enabled, scoringEnabled] of [[false, false], [true, false], [false, true]]) {
    expect(await runEventGroupCycle({ ...settings, enabled, scoringEnabled }, factory)).toMatchObject({ state: 'paused', processed: 0 })
  }
  expect(factory).not.toHaveBeenCalled()
})
it('preserves rank order, includes the leased anchor, deduplicates and caps proposals at four', () => {
  const third = 'a0000000-0000-4000-8000-000000000003', fourth = 'a0000000-0000-4000-8000-000000000004', fifth = 'a0000000-0000-4000-8000-000000000005'
  expect(selectGroupMembers(job, [{ profile_id: other }, { profile_id: other }, { profile_id: third }, { profile_id: fourth }, { profile_id: fifth }])).toEqual([anchor, other, third, fourth])
  expect(selectGroupMembers(job, [])).toBeNull()
})
it('processes only bounded leased jobs with one ranking RPC each and atomic completion', async () => {
  const rpc = transport()
  expect(await runEventGroupCycle(settings, async () => rpc)).toMatchObject({ state: 'idle', processed: 1 })
  expect(rpc.rank).toHaveBeenCalledTimes(1)
  expect(rpc.complete).toHaveBeenCalledWith(job, [anchor, other])
  expect(rpc.fail).not.toHaveBeenCalled()
})
it('does not retry a timed-out ranking call; reports failure with only a fixed reason code', async () => {
  const rpc = transport()
  vi.mocked(rpc.rank).mockReturnValue(new Promise(() => {}))
  await runEventGroupCycle(settings, async () => rpc)
  expect(rpc.rank).toHaveBeenCalledTimes(1)
  expect(rpc.fail).toHaveBeenCalledWith(job, 'scoring_uncertain')
  expect(rpc.complete).not.toHaveBeenCalled()
})
it('reconciles uncertain completion instead of retrying scoring/completion or undoing a committed proposal', async () => {
  const rpc = transport()
  vi.mocked(rpc.complete).mockReturnValue(new Promise(() => {}))
  await runEventGroupCycle(settings, async () => rpc)
  expect(rpc.reconcile).toHaveBeenCalledWith(job)
  expect(rpc.complete).toHaveBeenCalledTimes(1)
  expect(rpc.rank).toHaveBeenCalledTimes(1)
  expect(rpc.fail).not.toHaveBeenCalled()
})
it('does not complete singletons; respects cycle bounds even when every job has no peers', async () => {
  const rpc = transport()
  vi.mocked(rpc.claim).mockReset().mockResolvedValue(job)
  vi.mocked(rpc.rank).mockResolvedValue([])
  expect(await runEventGroupCycle({ ...settings, maxJobs: 5 }, async () => rpc)).toEqual({ state: 'idle', processed: 0 })
  expect(rpc.claim).toHaveBeenCalledTimes(5)
  expect(rpc.rank).toHaveBeenCalledTimes(5)
  expect(rpc.fail).toHaveBeenCalledTimes(5)
  expect(rpc.fail).toHaveBeenCalledWith(job, 'no_candidates')
  expect(rpc.complete).not.toHaveBeenCalled()
  const factory = vi.fn(async () => rpc)
  await expect(runEventGroupCycle({ ...settings, maxJobs: 6 }, factory)).rejects.toThrow()
  expect(factory).not.toHaveBeenCalled()
  expect(() => selectGroupMembers(job, Array(101).fill({ profile_id: other }))).toThrow()
})
it('stops on uncertain claim/malformed lease before ranking or choosing an actor', async () => {
  const rpc = transport()
  vi.mocked(rpc.claim).mockReset().mockResolvedValue({ ...job, leaseToken: null })
  expect(await runEventGroupCycle(settings, async () => rpc)).toEqual({ state: 'uncertain', processed: 0 })
  expect(rpc.rank).not.toHaveBeenCalled()
  vi.mocked(rpc.claim).mockReset().mockReturnValue(new Promise(() => {}))
  await runEventGroupCycle(settings, async () => rpc)
  expect(rpc.rank).not.toHaveBeenCalled()
})
it('only fails uncertain completion after reconciliation confirms the lease remains held', async () => {
  const rpc = transport()
  vi.mocked(rpc.complete).mockRejectedValue(new Error('not logged private detail'))
  vi.mocked(rpc.reconcile).mockResolvedValue({ state: 'leased' })
  await runEventGroupCycle(settings, async () => rpc)
  expect(rpc.fail).toHaveBeenCalledWith(job, 'completion_uncertain')
  expect(rpc.rank).toHaveBeenCalledTimes(1)
  vi.mocked(rpc.claim).mockReset().mockResolvedValueOnce(job).mockResolvedValue(null)
  vi.mocked(rpc.fail).mockClear()
  vi.mocked(rpc.reconcile).mockRejectedValue(new Error('uncertain'))
  expect(await runEventGroupCycle(settings, async () => rpc)).toEqual({ state: 'uncertain', processed: 0 })
  expect(rpc.fail).not.toHaveBeenCalled()
})
it('uses only fixed worker-bound functions/public key with lease tokens, not raw Winso actor calls (in-memory fetch)', async () => {
  const calls: { name: string; body: unknown; key: string | null; authorization: string | null }[] = []
  const fetchMock: typeof fetch = vi.fn(async (input, init) => {
    const name = String(input).split('/').at(-1)!
    const headers = new Headers(init?.headers)
    calls.push({ name, body: JSON.parse(String(init?.body)), key: headers.get('apikey'), authorization: headers.get('authorization') })
    return Response.json(name === 'claim_event_group_job' ? job : name === 'worker_rank_event_group' ? [{ profile_id: other }] : { state: name === 'fail_event_group_job' ? 'failed' : 'completed' })
  })
  const config = { url: 'https://worker.invalid', publicKey: 'sb_publishable_test', workerJwt: 'synthetic-worker-bound-jwt', fetch: fetchMock }
  await expect(createEventGroupWorkerTransport(config, { enabled: true, scoringEnabled: false })).rejects.toThrow('Worker paused')
  expect(fetchMock).not.toHaveBeenCalled()
  const rpc = await createEventGroupWorkerTransport(config, { enabled: true, scoringEnabled: true })
  await rpc.claim('test-worker', 120); await rpc.rank(job); await rpc.complete(job, [anchor, other]); await rpc.fail(job, 'no_candidates'); await rpc.reconcile(job)
  expect(calls.map(call => call.name)).toEqual(['claim_event_group_job', 'worker_rank_event_group', 'complete_event_group_job', 'fail_event_group_job', 'reconcile_event_group_job'])
  expect(calls.every(call => call.key === config.publicKey && call.authorization === `Bearer ${config.workerJwt}`)).toBe(true)
  expect(calls[0].body).toEqual({ worker_id: 'test-worker', lease_seconds: 120 })
  expect(calls[1].body).toEqual({ job_id_in: anchor, lease_token_in: other })
  expect(calls[2].body).toEqual({ job_id_in: anchor, lease_token_in: other, members: [anchor, other] })
  expect(calls[3].body).toEqual({ job_id_in: anchor, lease_token_in: other, reason_code: 'no_candidates' })
})
for (const stalled of ['worker_rank_event_group', 'complete_event_group_job']) it(`aborts a stalled ${stalled} body after headers, stops uncertain and never rescores (in-memory transport)`, async () => {
  const calls: string[] = []
  let signal!: AbortSignal
  let headersReturned = false
  const fetchMock: typeof fetch = vi.fn(async (input, init) => {
    const name = String(input).split('/').at(-1)!
    calls.push(name)
    if (name === stalled) {
      signal = init!.signal as AbortSignal
      const response = new Response(new ReadableStream({ start(controller) {
        controller.enqueue(new TextEncoder().encode('{'))
        signal.addEventListener('abort', () => controller.error(new DOMException('synthetic stalled body', 'AbortError')), { once: true })
      } }))
      headersReturned = true
      return response
    }
    return Response.json(name === 'claim_event_group_job' ? job : name === 'worker_rank_event_group' ? [{ profile_id: other }] : { state: name === 'fail_event_group_job' ? 'failed' : 'completed' })
  })
  const rpc = await createEventGroupWorkerTransport({ url: 'https://worker.invalid', publicKey: 'sb_publishable_test', workerJwt: 'synthetic-worker-bound-jwt', fetch: fetchMock }, { enabled: true, scoringEnabled: true })
  vi.useFakeTimers()
  const outcome = runEventGroupCycle({ ...settings, timeoutMs: 15000 }, async () => rpc)
  await vi.advanceTimersByTimeAsync(0)
  expect(headersReturned).toBe(true)
  expect(signal.aborted).toBe(false)
  await vi.advanceTimersByTimeAsync(15000)
  expect(signal.aborted).toBe(true)
  expect(await outcome).toEqual({ state: 'uncertain', processed: stalled === 'complete_event_group_job' ? 1 : 0 })
  expect(calls.filter(name => name === 'worker_rank_event_group')).toHaveLength(1)
  expect(calls.filter(name => name === 'claim_event_group_job')).toHaveLength(1)
  if (stalled === 'worker_rank_event_group') {
    expect(calls).toEqual(['claim_event_group_job', 'worker_rank_event_group', 'fail_event_group_job'])
  } else {
    expect(calls).toEqual(['claim_event_group_job', 'worker_rank_event_group', 'complete_event_group_job', 'reconcile_event_group_job'])
  }
  expect(vi.getTimerCount()).toBe(0)
})
