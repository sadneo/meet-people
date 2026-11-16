import { createClient } from '@supabase/supabase-js'
import { createFcmSender, createSupabasePushStore, runPushCycle } from './push-dispatcher.js'

// Sends queued pushes. Runs once and exits (Cloud Run Job + scheduler), or keeps polling when
// PUSH_DISPATCH_INTERVAL_MS is set (a small always-on worker gives near-instant delivery).
if (process.env.PUSH_DISPATCH_ENABLED !== 'true') {
  console.info('Push dispatcher paused; set PUSH_DISPATCH_ENABLED=true to send notifications.')
} else {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FIREBASE_PROJECT_ID, FIREBASE_SERVICE_ACCOUNT_JSON } = process.env
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !FIREBASE_PROJECT_ID) {
    console.error('Push dispatcher needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and FIREBASE_PROJECT_ID.')
    process.exit(1)
  }
  let serviceAccount: { client_email: string; private_key: string } | undefined
  try {
    if (FIREBASE_SERVICE_ACCOUNT_JSON) {
      serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON)
      if (!serviceAccount?.client_email || !serviceAccount.private_key) throw new Error('missing fields')
    }
  } catch {
    console.error('FIREBASE_SERVICE_ACCOUNT_JSON must be the service-account key JSON.')
    process.exit(1)
  }
  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const store = createSupabasePushStore(client)
  const send = createFcmSender({ projectId: FIREBASE_PROJECT_ID, serviceAccount })
  const interval = Number(process.env.PUSH_DISPATCH_INTERVAL_MS ?? 0)

  async function cycle() {
    try {
      const result = await runPushCycle(store, send)
      if (result.claimed) console.info(`Push cycle: claimed=${result.claimed} delivered=${result.delivered} retried=${result.retried} removedDevices=${result.removedDevices}`)
    } catch (error) {
      console.error('Push cycle failed', error instanceof Error ? error.message : 'unknown error')
      process.exitCode = 1
    }
  }

  if (interval >= 1000) {
    let stopping = false
    for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { stopping = true })
    while (!stopping) {
      await cycle()
      await new Promise(resolve => setTimeout(resolve, interval))
    }
  } else {
    await cycle()
  }
}
