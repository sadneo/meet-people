import { createClient } from 'npm:@supabase/supabase-js@2.116.0'
import type { SbEngagedStore } from './sbengaged-ingestion.ts'
import type { PhotoStore } from './sbengaged-photo-worker.ts'

export function sbEngagedStore() {
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('Source storage unavailable')
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  async function call(name: string, args = {}) {
    const { data, error } = await client.rpc(name, args).abortSignal(AbortSignal.timeout(20000)).retry(false)
    if (error) throw new Error('Source storage operation failed')
    return data
  }
  const sync: SbEngagedStore = {
    begin: mode => call('sbengaged_begin_sync', { p_mode: mode }),
    async start(mode, starts, ends) {
      const { data, error } = await client.from('ingestion_runs').insert({ source: 'sbengaged', mode, status: 'running', window_starts_at: starts, window_ends_at: ends }).select('id').single()
      if (error || !data) throw new Error('Source run unavailable')
      return data.id
    },
    upsert: (token, rows) => call('sbengaged_upsert_events', { p_token: token, p_rows: rows }),
    finish: (token, starts, ends, seen, full) => call('sbengaged_finish_sync', { p_token: token, p_starts: starts, p_ends: ends, p_seen: seen, p_full: full }),
    async report(id, summary) {
      const { error } = await client.from('ingestion_runs').update(summary).eq('id', id)
      if (error) throw new Error('Source reporting failed')
    },
    release: token => call('sbengaged_release_sync', { p_token: token }),
    cooldown: seconds => call('sbengaged_origin_cooldown', { p_seconds: seconds }),
  }
  const photos: PhotoStore = {
    claim: () => call('sbengaged_claim_photos'), cooldown: sync.cooldown,
    complete: (job, token, result) => call('sbengaged_complete_photo', { p_id: job.listingId, p_token: token, p_outcome: result.outcome,
      p_image: result.image, p_retry_seconds: result.retrySeconds, p_http: result.httpStatus }),
    release: token => call('sbengaged_release_photos', { p_token: token }),
  }
  return { sync, photos, exportSnapshot: () => call('sbengaged_export_snapshot'),
    runtimeConfig: () => call('sbengaged_runtime_config') as Promise<{ mode: string; exportToken: string; sharedUrl: string }> }
}
