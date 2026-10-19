import { createEventGroupWorkerTransport, runEventGroupCycle } from './event-group-worker.js'

if (process.env.EVENT_GROUP_WORKER_ENABLED !== 'true' || process.env.MATCHMAKING_SCORING_ENABLED !== 'true') {
  console.info('Event group worker paused; scoring disabled.')
} else {
  try {
    const result = await runEventGroupCycle({ enabled: true, scoringEnabled: true, workerId: process.env.EVENT_GROUP_WORKER_ID ?? 'local-worker', maxJobs: 3, timeoutMs: 15000, leaseSeconds: 120 }, () => createEventGroupWorkerTransport({ url: process.env.SUPABASE_URL ?? '', publicKey: process.env.SUPABASE_PUBLISHABLE_KEY ?? '', workerJwt: process.env.EVENT_GROUP_WORKER_JWT ?? '' }, { enabled: true, scoringEnabled: true }))
    console.info(`Event group cycle: ${result.state}; completed=${result.processed}`)
    if (result.state === 'uncertain') process.exitCode = 1
  } catch {
    console.error('Event group worker stopped: contract or transport unavailable.')
    process.exitCode = 1
  }
}
