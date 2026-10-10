// Source-only entrypoint. NOT run/activated in this task. No SDK or network
// operations, including dynamic module loading, occur before both explicit gates.
import process from 'node:process'
import console from 'node:console'
if (process.env.EVENT_GROUP_WORKER_ENABLED !== 'true' || process.env.MATCHMAKING_SCORING_ENABLED !== 'true') {
  console.info('Event group worker paused; scoring disabled.')
} else {
  try {
    // Requires the existing tsx loader when an operator separately authorizes it.
    const { runEventGroupCycle, createEventGroupWorkerTransport } = await import('../api/event-group-worker.ts')
    const result = await runEventGroupCycle({ enabled: true, scoringEnabled: true, workerId: process.env.EVENT_GROUP_WORKER_ID ?? 'local-worker', maxJobs: 3, timeoutMs: 15000, leaseSeconds: 120 }, () => createEventGroupWorkerTransport({ url: process.env.SUPABASE_URL ?? '', publicKey: process.env.SUPABASE_PUBLISHABLE_KEY ?? '', workerJwt: process.env.EVENT_GROUP_WORKER_JWT ?? '' }, { enabled: true, scoringEnabled: true }))
    // Aggregate only: never job/user identifiers, provider errors or credentials.
    console.info(`Event group cycle: ${result.state}; completed=${result.processed}`)
  } catch {
    console.error('Event group worker stopped: contract or transport unavailable.')
    process.exitCode = 1
  }
}
