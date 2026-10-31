import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { test } from 'node:test'
import { resolveDeployment } from '../scripts/resolve-deployment.mjs'
import { deploymentConfiguration } from '../scripts/configure-deployment.mjs'

test('manual overrides require a reason and production commits must belong to main', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pebble-deployment-'))
  const git = args => execFileSync('git', ['-C', directory, ...args], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_AUTHOR_NAME: 'Deployment check', GIT_AUTHOR_EMAIL: 'check@example.test', GIT_COMMITTER_NAME: 'Deployment check', GIT_COMMITTER_EMAIL: 'check@example.test' },
  }).trim()
  try {
    git(['init', '--initial-branch=main'])
    git(['commit', '--allow-empty', '-m', 'main'])
    const main = git(['rev-parse', 'HEAD'])
    git(['update-ref', 'refs/remotes/origin/main', main])
    git(['checkout', '-b', 'feature/demo'])
    git(['commit', '--allow-empty', '-m', 'feature'])
    const feature = git(['rev-parse', 'HEAD'])
    git(['update-ref', 'refs/remotes/origin/feature/demo', feature])
    const env = { GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', DEPLOY_ENVIRONMENT: 'production', SOURCE_REF: main, SKIP_CHECKS: 'true' }
    assert.throws(() => resolveDeployment(env, git), /reason/)
    assert.equal(resolveDeployment({ ...env, OVERRIDE_REASON: 'Known baseline test failures' }, git).sha, main)
    assert.throws(() => resolveDeployment({ ...env, SOURCE_REF: feature, SKIP_CHECKS: 'false' }, git))
    assert.throws(() => resolveDeployment({ ...env, SOURCE_REF: 'main', SKIP_CHECKS: 'false' }, git), /full commit SHA/)
    assert.throws(() => resolveDeployment({ ...env, GITHUB_REF: 'refs/heads/dev' }, git), /workflow on main/)
    assert.equal(resolveDeployment({ ...env, DEPLOY_ENVIRONMENT: 'sandbox', SOURCE_REF: 'feature/demo', SKIP_CHECKS: 'false' }, git).sha, feature)
    const automatic = resolveDeployment({ GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: main, SKIP_CHECKS: 'true' }, git)
    assert.equal(automatic.skip_checks, 'false', 'Automatic deployments cannot skip checks')
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('sandbox sites share only the sandbox backend and Auth callbacks', () => {
  const base = JSON.parse(readFileSync('firebase.json', 'utf8'))
  const env = {
    DEPLOY_ENVIRONMENT: 'sandbox', GCP_PROJECT_ID: 'example-project', GCP_REGION: 'us-east4', GAR_REPOSITORY: 'meet-people-sandbox',
    API_SERVICE: 'pebble-api-sandbox', API_RUNTIME_ACCOUNT: 'pebble-api-sandbox@example-project.iam.gserviceaccount.com', API_SECRET: 'pebble-supabase-service-role-sandbox',
    WORKER_JOB: 'pebble-event-group-worker-sandbox', WORKER_RUNTIME_ACCOUNT: 'pebble-worker-sandbox@example-project.iam.gserviceaccount.com',
    FIREBASE_HOSTING_SITE_ID: 'pebble-sandbox', FIREBASE_DEVTOOLS_SITE_ID: 'pebble-devtools',
    SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst', SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'test-public-key',
  }
  const config = deploymentConfiguration(env, base)
  assert.deepEqual(config.firebase.hosting.map(site => site.public), ['dist/web', 'dist/web-devtools'])
  for (const site of config.firebase.hosting) {
    assert.equal(site.rewrites[0].run.serviceId, 'pebble-api-sandbox')
    assert.equal(site.rewrites[0].run.pinTag, true)
    assert.ok(config.auth.includes(`https://${site.site}.web.app/auth/callback**`))
    assert.ok(config.auth.includes(`https://${site.site}.web.app/reset-password**`))
  }
  assert.throws(() => deploymentConfiguration({ ...env, SUPABASE_PROJECT_REF: 'wacgxhsdhrqigrmqaonc', SUPABASE_URL: 'https://wacgxhsdhrqigrmqaonc.supabase.co' }, base), /production database/)
  assert.throws(() => deploymentConfiguration({ ...env, FIREBASE_HOSTING_SITE_ID: 'cse416-meet-people' }, base), /production site/)
  assert.throws(() => deploymentConfiguration({ ...env, API_SECRET: 'pebble-supabase-service-role' }, base))
})

test('optimized developer build includes the toolbar; normal build excludes it; local login is absent from both', () => {
  const bundle = () => readdirSync('dist/web/assets').filter(file => file.endsWith('.js')).map(file => readFileSync(`dist/web/assets/${file}`, 'utf8')).join('\n')
  execFileSync('pnpm', ['build:web:devtools'], { stdio: 'inherit' })
  assert.ok(bundle().includes('Development navigation'))
  assert.ok(!bundle().includes('/__dev/login'))
  execFileSync('pnpm', ['build:web'], { stdio: 'inherit', env: { ...process.env, VITE_DEV_TOOLS: 'false' } })
  assert.ok(!bundle().includes('Development navigation'))
  assert.ok(!bundle().includes('/__dev/login'))
})
