// One-way cutover after deploy-dining-schedules.mjs verifies the native job.
import { spawnSync } from 'node:child_process'

const project = 'cse416-meet-people', ref = 'wacgxhsdhrqigrmqaonc'
if (process.env.DEPLOY_ENVIRONMENT !== 'production' || process.env.GCP_PROJECT_ID !== project
  || process.env.SUPABASE_PROJECT_REF !== ref || process.env.SUPABASE_URL !== `https://${ref}.supabase.co`) {
  throw new Error('Explicit isolated production configuration required.')
}
// Refuse retirement unless native configuration and readback succeed first.
await import('./deploy-dining-schedules.mjs')
const name = 'pebble-ingest-dining-schedule'
const flags = ['--project='+project,'--location=us-east4','--quiet']
// Capture output because the legacy job description includes auth headers.
const found = spawnSync('gcloud', ['scheduler','jobs','describe',name,...flags,'--format=json'], { encoding:'utf8' })
if (found.status !== 0) {
  if (!found.stderr?.includes('NOT_FOUND')) throw new Error('Cannot inspect legacy dining schedule; refusing to guess.')
  console.info(`${name}: already retired.`)
} else {
  const existing = JSON.parse(found.stdout)
  if (existing.httpTarget?.uri !== `https://${ref}.supabase.co/functions/v1/ingest-dining`) throw new Error('Unexpected legacy dining target; refusing deletion.')
  const deleted = spawnSync('gcloud', ['scheduler','jobs','delete',name,...flags], { encoding:'utf8' })
  if (deleted.status !== 0) throw new Error('Legacy dining schedule retirement failed; credentials were not logged.')
  const check = spawnSync('gcloud', ['scheduler','jobs','describe',name,...flags,'--format=json'], { encoding:'utf8' })
  if (check.status === 0 || !check.stderr?.includes('NOT_FOUND')) throw new Error('Legacy dining retirement readback failed.')
  console.info(`${name}: retired; food and event scraping now use Supabase cron.`)
}
