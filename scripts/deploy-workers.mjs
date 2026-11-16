import { execFileSync, spawnSync } from 'node:child_process'
import process from 'node:process'
import console from 'node:console'
import { supabaseRefs } from './configure-deployment.mjs'

const environment = process.env.DEPLOY_ENVIRONMENT, project = 'cse416-meet-people', region = 'us-east4'
if (!Object.hasOwn(supabaseRefs, environment) || process.env.GCP_PROJECT_ID !== project || process.env.SUPABASE_URL !== `https://${supabaseRefs[environment]}.supabase.co`) throw new Error('Explicit matching production or sandbox configuration required.')
const image = process.env.API_IMAGE
if (!image?.includes('@sha256:') || !process.env.SUPABASE_PUBLISHABLE_KEY) throw new Error('Immutable API image and public key required.')
const suffix = environment === 'sandbox' ? '-sandbox' : ''
const groupJob = process.env.WORKER_JOB, groupIdentity = process.env.WORKER_RUNTIME_ACCOUNT
if (groupJob !== `pebble-event-group-worker${suffix}` || !groupIdentity?.endsWith(`@${project}.iam.gserviceaccount.com`)) throw new Error('Configure WORKER_JOB and WORKER_RUNTIME_ACCOUNT for this environment.')
const run = args => execFileSync('gcloud', [...args, '--project='+project, '--quiet'], { stdio: 'inherit' })
const ensureIdentity = name => {
  const email = `${name}@${project}.iam.gserviceaccount.com`
  const result = spawnSync('gcloud', ['iam', 'service-accounts', 'describe', email, '--project='+project, '--format=value(email)'], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`Provision runtime identity ${name} before deploying workers.`)
  return email
}
const pushIdentity = ensureIdentity('pebble-push-dispatcher'+suffix)
const scheduler = ensureIdentity('pebble-worker-scheduler'+suffix)
for (const worker of [
  { name:'pebble-push-dispatcher'+suffix, identity:pushIdentity, main:'push-dispatcher-main', env:'FIREBASE_PROJECT_ID='+project+',PUSH_DISPATCH_ENABLED=true', secret:`SUPABASE_SERVICE_ROLE_KEY=pebble-supabase-service-role${suffix}:latest`, schedule:'* * * * *' },
  { name:groupJob, identity:groupIdentity, main:'event-group-worker-main', env:`EVENT_GROUP_WORKER_ENABLED=true,MATCHMAKING_SCORING_ENABLED=true,EVENT_GROUP_WORKER_ID=${environment}-worker`, secret:`EVENT_GROUP_WORKER_CREDENTIALS_JSON=pebble-event-group-worker-credentials-${environment}:1`, schedule:'*/2 * * * *' },
]) {
  run(['run','jobs','deploy',worker.name,'--region='+region,'--image='+image,'--service-account='+worker.identity,
    '--command=node','--args=dist/api/api/'+worker.main+'.js','--tasks=1','--parallelism=1','--max-retries=0','--task-timeout=120s','--cpu=1','--memory=512Mi',
    '--set-env-vars=SUPABASE_URL='+process.env.SUPABASE_URL+',SUPABASE_PUBLISHABLE_KEY='+process.env.SUPABASE_PUBLISHABLE_KEY+','+worker.env,'--set-secrets='+worker.secret])
  run(['run','jobs','add-iam-policy-binding',worker.name,'--region='+region,'--member=serviceAccount:'+scheduler,'--role=roles/run.invoker'])
  const schedule = worker.name+'-schedule'
  const found = spawnSync('gcloud',['scheduler','jobs','describe',schedule,'--location='+region,'--project='+project,'--format=value(name)'],{encoding:'utf8'})
  if (found.status !== 0 && !found.stderr?.includes('NOT_FOUND')) throw new Error('Cannot inspect worker schedule; refusing to guess.')
  run(['scheduler','jobs',found.status === 0 ? 'update' : 'create','http',schedule,'--location='+region,'--schedule='+worker.schedule,'--time-zone=Etc/UTC',
    '--uri=https://run.googleapis.com/v2/projects/'+project+'/locations/'+region+'/jobs/'+worker.name+':run','--http-method=POST','--message-body={}',
    '--oauth-service-account-email='+scheduler,'--oauth-token-scope=https://www.googleapis.com/auth/cloud-platform','--attempt-deadline=30s','--max-retry-attempts=0'])
}
console.info(`${environment} worker schedules configured. No downloaded Google service-account private keys used. Inspect executions and actual push delivery.`)
