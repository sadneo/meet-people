// Exercise the real deployment script without cloud access.
// @vitest-environment node
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { expect, it } from 'vitest'

it('deploys and schedules the same workers in both environments, each with only its own resources', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pebble-worker-'))
  try {
    writeFileSync(join(directory, 'gcloud'), '#!/bin/sh\n[ "$3" = describe ] && [ "$2" = jobs ] && { echo NOT_FOUND >&2; exit 1; }\necho "$*"\n', { mode: 0o700 })
    const base = { ...process.env, PATH: `${directory}:${process.env.PATH}`, GCP_PROJECT_ID: 'cse416-meet-people', API_IMAGE: 'image@sha256:test', SUPABASE_PUBLISHABLE_KEY: 'public-test' }
    const environments = {
      production: { DEPLOY_ENVIRONMENT: 'production', SUPABASE_URL: 'https://wacgxhsdhrqigrmqaonc.supabase.co', WORKER_JOB: 'pebble-event-group-worker', WORKER_RUNTIME_ACCOUNT: 'pebble-event-group-worker@cse416-meet-people.iam.gserviceaccount.com' },
      sandbox: { DEPLOY_ENVIRONMENT: 'sandbox', SUPABASE_URL: 'https://wixdiotkntapwrbibaom.supabase.co', WORKER_JOB: 'pebble-event-group-worker-sandbox', WORKER_RUNTIME_ACCOUNT: 'pebble-worker-sandbox@cse416-meet-people.iam.gserviceaccount.com' },
    }
    const run = (env: Record<string, string>) => spawnSync('node', ['scripts/deploy-workers.mjs'], { env: { ...base, ...env }, encoding: 'utf8' })
    const production = run(environments.production), sandbox = run(environments.sandbox)
    expect(production.status, production.stderr).toBe(0)
    expect(sandbox.status, sandbox.stderr).toBe(0)
    expect(sandbox.stdout).toContain('run jobs deploy pebble-push-dispatcher-sandbox')
    expect(sandbox.stdout).toContain('scheduler jobs create http pebble-event-group-worker-sandbox-schedule')
    expect(sandbox.stdout).toContain('EVENT_GROUP_WORKER_CREDENTIALS_JSON=pebble-event-group-worker-credentials-sandbox:1')
    expect(sandbox.stdout).toContain('SUPABASE_SERVICE_ROLE_KEY=pebble-supabase-service-role-sandbox:latest')
    expect(production.stdout).not.toContain('sandbox')
    expect(production.stdout).not.toContain('--execute-now')
    const normalize = (output: string) => output.replaceAll('pebble-worker-sandbox@', 'pebble-event-group-worker@').replace(/-?(sandbox|production)/g, '').replace(/https:\/\/\w+\.supabase\.co/g, 'DATABASE')
    expect(normalize(sandbox.stdout)).toBe(normalize(production.stdout))
    for (const mismatch of [
      { ...environments.sandbox, SUPABASE_URL: environments.production.SUPABASE_URL },
      { ...environments.sandbox, WORKER_JOB: 'pebble-event-group-worker' },
      { ...environments.production, DEPLOY_ENVIRONMENT: 'typo' },
      { ...environments.production, API_IMAGE: 'image:latest' },
    ]) expect(run(mismatch).status).not.toBe(0)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
