import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const project = 'cse416-meet-people', ref = 'wacgxhsdhrqigrmqaonc', region = 'us-east4'
const url = `https://${ref}.supabase.co`
if (process.env.DEPLOY_ENVIRONMENT !== 'production' || process.env.GCP_PROJECT_ID !== project || process.env.SUPABASE_URL !== url) {
  throw new Error('Explicit isolated production configuration required.')
}
const directory = mkdtempSync(join(tmpdir(), 'pebble-dining-schedules-'))
const cli = (command, args) => {
  // Capture output: Scheduler responses contain the ingestion authentication header.
  try { return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }
  catch { throw new Error(`${command} failed while configuring dining schedules; credentials were not logged.`) }
}
const cloudArgs = ['--project='+project, '--quiet']
try {
  const queryPath = join(directory, 'read-token.sql')
  writeFileSync(queryPath, "select decrypted_secret from vault.decrypted_secrets where name='pebble_ingest_token'", { mode: 0o600 })
  const result = JSON.parse(cli('pnpm', ['exec', 'supabase', 'db', 'query', '--linked', '--project-ref', ref, '--file', queryPath, '--output', 'json']))
  const rows = Array.isArray(result) ? result : result.rows
  const token = rows?.length === 1 ? rows[0].decrypted_secret : null
  if (typeof token !== 'string' || !token || /[\r\n]/.test(token)) throw new Error('One valid existing ingestion token is required.')
  const name = 'pebble-ingest-dining-schedule', uri = `${url}/functions/v1/ingest-dining`
  const found = spawnSync('gcloud', ['scheduler', 'jobs', 'describe', name, '--location='+region, '--format=json', ...cloudArgs], { encoding: 'utf8' })
  if (found.status !== 0 && !found.stderr?.includes('NOT_FOUND')) throw new Error('Cannot inspect dining schedule; refusing to guess.')
  const existing = found.status === 0 ? JSON.parse(found.stdout) : null
  if (existing && (existing.httpTarget?.uri !== uri || existing.state !== 'ENABLED')) {
    throw new Error(`Review the existing target/state for ${name} before changing it.`)
  }
  const flagsPath = join(directory, 'dining.json')
  writeFileSync(flagsPath, JSON.stringify({
    '--schedule': '0 6 * * *', '--time-zone': 'America/New_York',
    '--uri': uri, '--http-method': 'POST',
    [existing ? '--update-headers' : '--headers']: { 'Content-Type': 'application/json', 'x-ingest-token': token },
    '--message-body': JSON.stringify({ mode: 'full', dryRun: false }),
    '--attempt-deadline': '180s', '--max-retry-attempts': 0, '--max-retry-duration': '0s',
    '--description': 'Production dining menu import; daily at 6 a.m. America/New_York; next seven days.',
  }), { mode: 0o600 })
  cli('gcloud', ['scheduler', 'jobs', existing ? 'update' : 'create', 'http', name, '--location='+region, '--flags-file='+flagsPath, ...cloudArgs])
  const saved = JSON.parse(cli('gcloud', ['scheduler', 'jobs', 'describe', name, '--location='+region, '--format=json', ...cloudArgs]))
  if (saved.schedule !== '0 6 * * *' || saved.timeZone !== 'America/New_York' || saved.state !== 'ENABLED'
    || saved.httpTarget?.uri !== uri || saved.httpTarget.httpMethod !== 'POST'
    || Buffer.from(saved.httpTarget.body, 'base64').toString() !== JSON.stringify({ mode: 'full', dryRun: false })
    || !Object.entries(saved.httpTarget.headers ?? {}).some(([key, value]) => key.toLowerCase() === 'x-ingest-token' && value === token)) {
    throw new Error(`Dining schedule readback failed for ${name}.`)
  }
  console.info(`${name}: enabled, daily at 6 a.m. America/New_York, production full import.`)
} finally {
  rmSync(directory, { recursive: true, force: true })
}
