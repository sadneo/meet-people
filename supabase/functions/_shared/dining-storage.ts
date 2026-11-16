import { createClient } from 'npm:@supabase/supabase-js@2.116.0'
import { menuWindow } from './dining-menus.ts'
import type { DiningStorage } from './dining-ingestion.ts'

export function getDiningStorage(): DiningStorage | null {
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return null
  const supabase = createClient(url, key, { auth: { persistSession: false } })
  return {
    async startRun(source, input) {
      const window = menuWindow(input)
      const { data, error } = await supabase.from('ingestion_runs').insert({
        source, mode: input.mode, status: 'running',
        window_starts_at: `${window.startsAt}T00:00:00Z`, window_ends_at: `${window.endsAt}T00:00:00Z`,
      }).select('id').single()
      if (error || !data) throw new Error('ingestion_run_start_failed')
      return data.id as string
    },
    async finishRun(id, summary) {
      const { error } = await supabase.from('ingestion_runs').update({
        status: summary.status, finished_at: new Date().toISOString(), request_count: summary.requestCount,
        fetched_count: summary.fetchedCount, accepted_count: summary.acceptedCount, skipped_count: summary.skippedCount,
        upserted_count: summary.upsertedCount, deleted_count: summary.deletedCount, error_summary: summary.issues,
      }).eq('id', id)
      if (error) throw new Error('ingestion_run_finish_failed')
    },
    async upsert(rows) {
      let count = 0
      for (let offset = 0; offset < rows.length; offset += 100) {
        const batch = rows.slice(offset, offset + 100)
        const { error } = await supabase.from('dining_menus').upsert(batch, { onConflict: 'source,external_id' })
        if (error) return { count, error: 'dining_menus_upsert_failed' }
        count += batch.length
      }
      return { count }
    },
    async deleteExpired(source, cutoffDate) {
      const { error, count } = await supabase.from('dining_menus').delete({ count: 'exact' }).eq('source', source).lt('menu_date', cutoffDate)
      if (error) throw new Error('old_dining_menus_cleanup_failed')
      return count ?? 0
    },
  }
}
