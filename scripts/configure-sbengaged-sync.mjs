import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { supabaseRefs } from './configure-deployment.mjs'

const targets = {
  production: { ref: supabaseRefs.production, mode: 'producer' },
  sandbox: { ref: supabaseRefs.sandbox, mode: 'mirror' },
}
const target = targets[process.env.DEPLOY_ENVIRONMENT]
if (!target || process.env.SUPABASE_PROJECT_REF !== target.ref || process.env.SUPABASE_URL !== `https://${target.ref}.supabase.co`) {
  throw new Error('Explicit matching production or sandbox configuration required.')
}
const directory = mkdtempSync(join(tmpdir(), 'pebble-sbengaged-config-'))
const cli = args => {
  try { return execFileSync('pnpm', ['exec', 'supabase', ...args, '--yes'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }
  catch { throw new Error('SB Engaged configuration failed; credentials were not logged.') }
}
try {
  const file = join(directory, 'configure.sql')
  writeFileSync(file, `do $$ begin if not exists(select 1 from vault.secrets where name='pebble_sbengaged_export_token') then raise exception 'Provision the shared export credential first';end if;end $$;\nselect hosting_private.configure_sbengaged_schedules('${target.mode}');\ndo $$ declare legacy record; begin select jobid,command into legacy from cron.job where jobname='ingest-sbengaged-hourly'; if found then if position('https://${target.ref}.supabase.co/functions/v1/ingest-sbengaged' in legacy.command)=0 then raise exception 'Unexpected legacy event target'; end if; perform cron.unschedule(legacy.jobid); end if; end $$;\nselect jobname,schedule,active from cron.job where jobname in('pebble-ingest-sbengaged','pebble-enrich-sbengaged') order by jobname`, { mode: 0o600 })
  const result = JSON.parse(cli(['db', 'query', '--linked', '--project-ref', target.ref, '--file', file, '--output', 'json']))
  const rows = Array.isArray(result) ? result : result.rows
  const schedules = target.mode === 'producer' ? { 'pebble-ingest-sbengaged': '17 * * * *', 'pebble-enrich-sbengaged': '*/5 * * * *' } : { 'pebble-ingest-sbengaged': '20 * * * *' }
  if (!rows || rows.length !== Object.keys(schedules).length || !rows.every(row => row.active === true && schedules[row.jobname] === row.schedule)) throw new Error('Source schedule readback failed.')
  console.info(`${process.env.DEPLOY_ENVIRONMENT}: ${target.mode}; 30-day metadata sync enabled${target.mode === 'producer' ? '; photos limited to 10 every five minutes' : '; upstream crawling disabled'}.`)
} finally { rmSync(directory, { recursive: true, force: true }) }
