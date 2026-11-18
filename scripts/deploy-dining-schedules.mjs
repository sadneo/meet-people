import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ref = 'wacgxhsdhrqigrmqaonc'
if (process.env.DEPLOY_ENVIRONMENT !== 'production' || process.env.SUPABASE_PROJECT_REF !== ref || process.env.SUPABASE_URL !== `https://${ref}.supabase.co`) {
  throw new Error('Explicit isolated production configuration required.')
}
const directory = mkdtempSync(join(tmpdir(), 'pebble-dining-schedules-'))
try {
  const file = join(directory, 'configure.sql')
  writeFileSync(file, `select hosting_private.configure_dining_schedule();
select jobname,schedule,command,active from cron.job where jobname='pebble-ingest-dining';`, { mode: 0o600 })
  let output
  try {
    output = execFileSync('pnpm', ['exec','supabase','db','query','--linked','--project-ref',ref,'--file',file,'--output','json','--yes'], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] })
  } catch { throw new Error('Supabase dining schedule configuration failed; credentials were not logged.') }
  const result = JSON.parse(output), rows = Array.isArray(result) ? result : result.rows
  if (rows?.length !== 1 || rows[0].jobname !== 'pebble-ingest-dining' || rows[0].schedule !== '0 10,11 * * *'
    || rows[0].command !== 'select hosting_private.ingest_dining()' || rows[0].active !== true) {
    throw new Error('Supabase dining schedule readback failed.')
  }
  console.info('pebble-ingest-dining: Supabase cron enabled; one daily production import at 6 a.m. America/New_York (DST aware).')
} finally { rmSync(directory, { recursive: true, force: true }) }
