import { env } from './env.js'
import { createActiveFriendsWorker, runActiveFriendsCycle } from './matching/active-worker.js'
import { activeFriendsConfig } from './matching/active-config.js'
if (env.ACTIVE_FRIENDS_ENABLED !== 'true') {
  console.log(JSON.stringify({ state: 'paused', processed: 0 }))
} else {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Active matching worker requires server configuration.')
  const worker = createActiveFriendsWorker(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY), started = Date.now()
  let cycles = 0, reserved = 0
  while (cycles < activeFriendsConfig.workerMaxCycles && Date.now() - started < activeFriendsConfig.workerBudgetMs) {
    cycles++
    const outcome = await runActiveFriendsCycle(worker)
    reserved += outcome.processed
    if (outcome.state === 'uncertain') { process.exitCode = 1; break }
    if (outcome.state === 'idle') break
  }
  console.log(JSON.stringify({ cycles, reserved, state: process.exitCode ? 'uncertain' : 'complete' }))
}
