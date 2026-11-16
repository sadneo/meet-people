import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import process from 'node:process'
import console from 'node:console'

// Add new Edge Functions here. Tests fail if a function directory is in neither list.
export const EDGE_FUNCTIONS = ['embed-interest', 'ingest-sbengaged', 'enrich-sbengaged', 'export-sbengaged', 'ingest-nutrislice', 'ingest-sbu-hospital', 'ingest-dining']
// Present in supabase/functions but deliberately never deployed.
export const UNDEPLOYED_FUNCTIONS = ['ingest-ticketmaster']

// Every step is safe to repeat, so re-running Deploy is the recovery path after a partial failure.
export function stageSteps(stage, env) {
  if (!['production', 'sandbox'].includes(env.DEPLOY_ENVIRONMENT)) throw new Error('Choose production or sandbox')
  if (stage === 'backend') {
    const ref = env.SUPABASE_PROJECT_REF
    if (!/^[a-z]{20}$/.test(ref ?? '')) throw new Error('Set SUPABASE_PROJECT_REF to the deployment target.')
    return [
      ...EDGE_FUNCTIONS.map(name => [`Deploy Edge Function ${name}`, 'pnpm', ['exec', 'supabase', 'functions', 'deploy', name, '--project-ref', ref, '--use-api']]),
      ['Apply reviewed migrations', 'node', ['scripts/push-reviewed-migrations.mjs', '--yes']],
      ['Install canonical product backend', 'node', ['scripts/deploy-product-schema.mjs']],
      ['Configure hosted services', 'pnpm', ['hosting:configure']],
      ['Configure shared month-ahead event sync and paced photo queue', 'node', ['scripts/configure-sbengaged-sync.mjs']],
    ]
  }
  if (stage === 'services') return [
    ['Deploy API', 'sh', ['scripts/deploy-api.sh']],
    ...(env.DEPLOY_ENVIRONMENT === 'production' ? [
      ['Deploy approved production workers and schedules', 'node', ['scripts/deploy-production-workers.mjs']],
      ['Configure production dining imports at 6 a.m. New York time', 'node', ['scripts/deploy-dining-schedules.mjs']],
    ] : [
      ['Deploy disabled event worker (no execution or schedule)', 'sh', ['scripts/deploy-worker.sh']],
    ]),
  ]
  throw new Error('Choose the backend or services stage')
}

export function runStage(stage, env, exec = (command, args) => execFileSync(command, args, { stdio: 'inherit' })) {
  for (const [name, command, args] of stageSteps(stage, env)) {
    console.info(`::group::${name}`)
    try { exec(command, args) }
    catch (error) { console.info('::endgroup::'); console.error(`::error::${name} failed. Earlier steps already applied; re-run Deploy after fixing.`); throw error }
    console.info('::endgroup::')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runStage(process.argv[2], process.env)
