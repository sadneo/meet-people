import { createEventGroupWorkerTransport, runEventGroupCycle } from './event-group-worker.js'
import { eventWorkerSession } from './event-worker-auth.js'

if (process.env.EVENT_GROUP_WORKER_ENABLED !== 'true' || process.env.MATCHMAKING_SCORING_ENABLED !== 'true') {
  console.info('Event group worker paused; scoring disabled.')
} else {
  let session: Awaited<ReturnType<typeof eventWorkerSession>> | undefined
  try {
    session = await eventWorkerSession({ url: process.env.SUPABASE_URL ?? '', publicKey: process.env.SUPABASE_PUBLISHABLE_KEY ?? '', credentials: process.env.EVENT_GROUP_WORKER_CREDENTIALS_JSON, legacyJwt: process.env.EVENT_GROUP_WORKER_JWT })
    const jwt = session.jwt
    const result = await runEventGroupCycle({ enabled: true, scoringEnabled: true, workerId: process.env.EVENT_GROUP_WORKER_ID ?? 'local-worker', maxJobs: 3, timeoutMs: 15000, leaseSeconds: 120 }, () => createEventGroupWorkerTransport({ url: process.env.SUPABASE_URL ?? '', publicKey: process.env.SUPABASE_PUBLISHABLE_KEY ?? '', workerJwt: jwt }, { enabled: true, scoringEnabled: true }), diagnostic => console.error(`Event group diagnostic: stage=${diagnostic.stage}; reason=${diagnostic.reason}. Inspect job/lease state before restarting; no automatic replay.`))
    console.info(`Event group cycle: ${result.state}; completed=${result.processed}`)
    if (result.state === 'uncertain') process.exitCode = 1
  } catch {
    console.error('Event group worker stopped: contract or transport unavailable.')
    process.exitCode = 1
  } finally { await session?.close() }
}
