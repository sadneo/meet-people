import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { supabaseRefs } from './configure-deployment.mjs'

// The daily food import (Nutrislice + hospital) is paused in sandbox and production.
// Every release keeps it paused; to resume, restore the configure_dining_schedule() call here.
const ref = supabaseRefs[process.env.DEPLOY_ENVIRONMENT]
if (!Object.hasOwn(supabaseRefs, process.env.DEPLOY_ENVIRONMENT) || process.env.SUPABASE_PROJECT_REF !== ref || process.env.SUPABASE_URL !== `https://${ref}.supabase.co`) {
  throw new Error('Explicit matching production or sandbox configuration required.')
}
const directory = mkdtempSync(join(tmpdir(), 'pebble-dining-schedules-'))
try {
  const file = join(directory, 'pause.sql')
  writeFileSync(file, `select cron.alter_job(jobid, active := false) from cron.job where jobname='pebble-ingest-dining';
select jobname,active from cron.job where jobname='pebble-ingest-dining';`, { mode: 0o600 })
  let output
  try {
    output = execFileSync('pnpm', ['exec','supabase','db','query','--linked','--project-ref',ref,'--file',file,'--output','json','--yes'], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] })
  } catch { throw new Error('Supabase dining schedule pause failed; credentials were not logged.') }
  const result = JSON.parse(output), rows = Array.isArray(result) ? result : result.rows
  if (!Array.isArray(rows) || rows.length > 1 || rows.some(row => row.jobname !== 'pebble-ingest-dining' || row.active !== false)) {
    throw new Error('Supabase dining schedule readback failed.')
  }
  console.info('pebble-ingest-dining: Supabase cron paused; no scheduled food imports.')
} finally { rmSync(directory, { recursive: true, force: true }) }
