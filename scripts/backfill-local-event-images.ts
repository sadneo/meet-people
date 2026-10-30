import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { z } from 'zod'
import { fetchSbEngagedDetail, type SbEngagedDetail } from '../supabase/functions/_shared/sbengaged-detail-enrichment.js'
import { seedContainer } from './demo-seed/plan.js'

const options = parseArgs({ options: { limit: { type: 'string' }, 'dry-run': { type: 'boolean' } }, args: process.argv.slice(2).filter(value => value !== '--') }).values
const Row = z.object({ id: z.uuid(), external_id: z.string().regex(/^\d+$/), image_url: z.null(), details_synced_at: z.string().nullable() })
function sql(source: string) {
  const result = spawnSync('docker', ['exec', '-i', seedContainer, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: source, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 })
  if (result.status !== 0) throw new Error('Local event image SQL failed; no credentials printed')
  return result.stdout.trim()
}
async function main() {
  const limit = z.coerce.number().int().min(1).max(1000).parse(options.limit ?? 1000)
  const metadata = JSON.parse(execFileSync('docker', ['inspect', '--format', '{"running":{{json .State.Running}},"project":{{json (index .Config.Labels "com.supabase.cli.project")}}}', seedContainer], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
  if (!metadata.running || metadata.project !== 'meet-people') throw new Error('Verified local meet-people Supabase required')
  const rows = z.array(Row).parse(JSON.parse(sql(`select coalesce(jsonb_agg(to_jsonb(item)),'[]'::jsonb) from (select id,external_id,image_url,details_synced_at from public.listings where source='sbengaged' and listing_type='event' and status in('active','rescheduled') and image_url is null order by details_synced_at nulls first,starts_at,id limit ${limit}) item;`)))
  console.log(`${options['dry-run'] ? 'Preview' : 'Backfill'}: ${rows.length} existing SBU events missing images; public source pages only, concurrency 4.`)
  if (options['dry-run'] || !rows.length) return
  const directory = `worktree/event-image-backfill-${Date.now()}`
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  writeFileSync(`${directory}/before.json`, JSON.stringify(rows), { mode: 0o600, flag: 'wx' })
  const results: SbEngagedDetail[] = []
  for (let start = 0; start < rows.length; start += 4) {
    results.push(...await Promise.all(rows.slice(start, start + 4).map(row => fetchSbEngagedDetail(row.external_id))))
    if (results.length % 20 === 0 || results.length === rows.length) console.log(`Checked ${results.length}/${rows.length} source pages.`)
  }
  const checkedAt = new Date().toISOString()
  const updates = results.flatMap(result => result.success ? [{ ...rows.find(row => row.external_id === result.externalId)!, image_url: result.imageUrl, checked_at: checkedAt }] : [])
  const literal = `'${JSON.stringify(updates).replaceAll("'", "''")}'::jsonb`
  const saved = sql(`begin;set local lock_timeout='5s';set local statement_timeout='30s';
  do $$ begin if current_database()<>'postgres' or current_user<>'postgres' then raise exception 'Local operator required';end if;end $$;
  with changed as (update public.listings l set image_url=x.image_url,details_synced_at=x.checked_at
   from jsonb_to_recordset(${literal}) x(id uuid,external_id text,image_url text,details_synced_at timestamptz,checked_at timestamptz)
   where l.id=x.id and l.external_id=x.external_id and l.source='sbengaged' and l.listing_type='event'
   and l.image_url is null and l.details_synced_at is not distinct from x.details_synced_at
   returning l.id,l.image_url)
  select jsonb_build_object('imagesAdded',count(*) filter(where image_url is not null),'checkedWithoutImage',count(*) filter(where image_url is null)) from changed;commit;`)
  const report = { ...JSON.parse(saved), sourceFailures: results.filter(result => !result.success).map(result => result.externalId), noSourceImage: results.filter(result => result.success && !result.imageUrl).map(result => result.externalId), requests: results.reduce((sum, result) => sum + result.attempts, 0) }
  writeFileSync(`${directory}/report.json`, JSON.stringify(report), { mode: 0o600, flag: 'wx' })
  console.log(JSON.stringify(report))
}
main().catch(() => { console.error('Local image backfill failed. Existing images, event dates and queue memberships are preserved.'); process.exitCode = 1 })
