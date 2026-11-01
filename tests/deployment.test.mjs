import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { test } from 'node:test'
import { assertCurrentDeployment, resolveDeployment } from '../scripts/resolve-deployment.mjs'
import { deploymentConfiguration, validateFrontendConfiguration } from '../scripts/configure-deployment.mjs'

test('main deploys only production; dev deploys only sandbox; manual sources belong to the destination branch', () => {
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
    git(['checkout', '-b', 'dev'])
    git(['commit', '--allow-empty', '-m', 'dev'])
    const dev = git(['rev-parse', 'HEAD'])
    git(['update-ref', 'refs/remotes/origin/dev', dev])
    git(['checkout', '-b', 'feature/demo'])
    git(['commit', '--allow-empty', '-m', 'feature'])
    const feature = git(['rev-parse', 'HEAD'])
    git(['update-ref', 'refs/remotes/origin/feature/demo', feature])
    const env = { GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', DEPLOY_ENVIRONMENT: 'production', SOURCE_REF: main, SKIP_CHECKS: 'true' }
    assert.throws(() => resolveDeployment(env, git), /reason/)
    assert.equal(resolveDeployment({ ...env, OVERRIDE_REASON: 'Known baseline test failures' }, git).sha, main)
    assert.throws(() => resolveDeployment({ ...env, SOURCE_REF: feature, SKIP_CHECKS: 'false' }, git))
    assert.throws(() => resolveDeployment({ ...env, SOURCE_REF: 'main', SKIP_CHECKS: 'false' }, git), /full commit SHA/)
    assert.throws(() => resolveDeployment({ ...env, GITHUB_REF: 'refs/heads/dev' }, git), /Production must use the workflow on main/)
    assert.throws(() => resolveDeployment({ ...env, SOURCE_REF: dev, SKIP_CHECKS: 'false' }, git))
    assert.throws(() => resolveDeployment({ ...env, DEPLOY_ENVIRONMENT: 'sandbox', SOURCE_REF: 'feature/demo', SKIP_CHECKS: 'false' }, git), /full commit SHA/)
    assert.throws(() => resolveDeployment({ ...env, DEPLOY_ENVIRONMENT: 'sandbox', SOURCE_REF: feature, SKIP_CHECKS: 'false' }, git))
    const sandbox = resolveDeployment({ ...env, DEPLOY_ENVIRONMENT: 'sandbox', SOURCE_REF: '', SKIP_CHECKS: 'false' }, git)
    assert.equal(sandbox.sha, dev)
    assert.equal(sandbox.branch, 'dev')
    assert.equal(sandbox.environment, 'sandbox')
    assert.equal(resolveDeployment({ ...env, DEPLOY_ENVIRONMENT: 'sandbox', SOURCE_REF: 'dev', SKIP_CHECKS: 'false', GITHUB_REF: 'refs/heads/dev' }, git).sha, dev)
    assert.equal(resolveDeployment({ ...env, DEPLOY_ENVIRONMENT: 'sandbox', SOURCE_REF: main, SKIP_CHECKS: 'false' }, git).sha, main, 'Manual rollback accepts an ancestor of dev')
    assert.throws(() => resolveDeployment({ ...env, DEPLOY_ENVIRONMENT: 'sandbox', SOURCE_REF: 'main', SKIP_CHECKS: 'false' }, git), /full commit SHA/)
    const automatic = resolveDeployment({ GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: main, SKIP_CHECKS: 'true' }, git)
    assert.equal(automatic.skip_checks, 'false', 'Automatic deployments cannot skip checks')
    assert.equal(automatic.environment, 'production')
    assert.equal(automatic.branch, 'main')
    const automaticDev = resolveDeployment({ GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/dev', GITHUB_SHA: dev, SKIP_CHECKS: 'true', DEPLOY_ENVIRONMENT: 'production' }, git)
    assert.deepEqual(automaticDev, { sha: dev, branch: 'dev', environment: 'sandbox', skip_checks: 'false' })
    assert.throws(() => resolveDeployment({ GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/dev', GITHUB_SHA: feature }, git))
    assert.throws(() => resolveDeployment({ GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/feature/demo', GITHUB_SHA: feature }, git), /workflow on main or dev/)
    assert.throws(() => resolveDeployment({ ...env, GITHUB_EVENT_NAME: 'pull_request' }, git), /Unsupported/)
    assert.throws(() => resolveDeployment({ ...env, DEPLOY_ENVIRONMENT: 'invalid' }, git), /Choose production or sandbox/)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('superseded automatic sandbox releases cannot mutate the environment; manual rollbacks remain available', () => {
  const sha = 'a'.repeat(40)
  const env = { GITHUB_EVENT_NAME: 'push', DEPLOY_ENVIRONMENT: 'sandbox', RELEASE_SHA: sha }
  const git = args => {
    assert.deepEqual(args, ['ls-remote', '--exit-code', 'origin', 'refs/heads/dev'])
    return `${sha}\trefs/heads/dev`
  }
  assertCurrentDeployment(env, git)
  assert.throws(() => assertCurrentDeployment({ ...env, RELEASE_SHA: 'b'.repeat(40) }, git), /Superseded sandbox release/)
  assert.throws(() => assertCurrentDeployment(env, () => { throw new Error('Remote unavailable') }), /Remote unavailable/)
  const noLookup = () => { throw new Error('Unexpected branch lookup') }
  assertCurrentDeployment({ ...env, GITHUB_EVENT_NAME: 'workflow_dispatch' }, noLookup)
  assertCurrentDeployment({ ...env, DEPLOY_ENVIRONMENT: 'production' }, noLookup)
})

test('sandbox sites share only the sandbox backend and Auth callbacks', () => {
  const base = JSON.parse(readFileSync('firebase.json', 'utf8'))
  const env = {
    DEPLOY_ENVIRONMENT: 'sandbox', GCP_PROJECT_ID: 'example-project', GCP_REGION: 'us-east4', GAR_REPOSITORY: 'meet-people-sandbox',
    API_SERVICE: 'pebble-api-sandbox', API_RUNTIME_ACCOUNT: 'pebble-api-sandbox@example-project.iam.gserviceaccount.com', API_SECRET: 'pebble-supabase-service-role-sandbox',
    WORKER_JOB: 'pebble-event-group-worker-sandbox', WORKER_RUNTIME_ACCOUNT: 'pebble-worker-sandbox@example-project.iam.gserviceaccount.com',
    FIREBASE_WEB_SITE_ID: 'cse416-meet-people-sandbox', FIREBASE_MOBILE_SITE_ID: 'cse416-meet-people-dev',
    SUPABASE_PROJECT_REF: 'wixdiotkntapwrbibaom', SUPABASE_URL: 'https://wixdiotkntapwrbibaom.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'test-public-key',
  }
  const config = deploymentConfiguration(env, base)
  assert.ok(config.auth.includes('site_url = "https://mobile.dev.pebble.garden"'))
  assert.ok(config.auth.includes('com.cse416.meetpeople://app/auth/callback**'))
  assert.ok(config.auth.includes('com.cse416.meetpeople://app/reset-password**'))
  for (const domain of ['web.dev.pebble.garden', 'mobile.dev.pebble.garden']) {
    assert.ok(config.auth.includes(`https://${domain}/auth/callback**`))
    assert.ok(config.auth.includes(`https://${domain}/reset-password**`))
  }
  assert.ok(!config.auth.includes('https://pebble.garden/'))
  assert.deepEqual(config.firebase.hosting.map(site => [site.site, site.public]), [
    ['cse416-meet-people-sandbox', 'dist/web'], ['cse416-meet-people-dev', 'dist/mobile'],
  ])
  for (const site of config.firebase.hosting) {
    assert.equal(site.rewrites[0].run.serviceId, 'pebble-api-sandbox')
    assert.equal(site.rewrites[0].run.pinTag, true)
    assert.ok(config.auth.includes(`https://${site.site}.web.app/auth/callback**`))
    assert.ok(config.auth.includes(`https://${site.site}.web.app/reset-password**`))
  }
  assert.throws(() => deploymentConfiguration({ ...env, SUPABASE_PROJECT_REF: 'wacgxhsdhrqigrmqaonc', SUPABASE_URL: 'https://wacgxhsdhrqigrmqaonc.supabase.co' }, base), /production database/)
  assert.throws(() => deploymentConfiguration({ ...env, SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst', SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co' }, base), /pebble-sandbox/)
  assert.throws(() => deploymentConfiguration({ ...env, FIREBASE_WEB_SITE_ID: 'cse416-meet-people' }, base), /production site/)
  assert.throws(() => deploymentConfiguration({ ...env, FIREBASE_MOBILE_SITE_ID: 'cse416-meet-people' }, base), /production site/)
  assert.throws(() => deploymentConfiguration({ ...env, FIREBASE_MOBILE_SITE_ID: env.FIREBASE_WEB_SITE_ID }, base), /distinct/)
  assert.throws(() => deploymentConfiguration({ ...env, FIREBASE_MOBILE_SITE_ID: undefined }, base))
  assert.throws(() => deploymentConfiguration({ ...env, API_SECRET: 'pebble-supabase-service-role' }, base))
  const production = deploymentConfiguration({
    ...env, DEPLOY_ENVIRONMENT: 'production', API_SERVICE: 'pebble-api', API_SECRET: 'pebble-supabase-service-role',
    API_RUNTIME_ACCOUNT: 'pebble-api@example-project.iam.gserviceaccount.com', WORKER_JOB: 'pebble-event-group-worker',
    WORKER_RUNTIME_ACCOUNT: 'pebble-event-group-worker@example-project.iam.gserviceaccount.com',
    FIREBASE_WEB_SITE_ID: 'cse416-meet-people', SUPABASE_PROJECT_REF: 'wacgxhsdhrqigrmqaonc', SUPABASE_URL: 'https://wacgxhsdhrqigrmqaonc.supabase.co',
  }, base)
  assert.equal(production.firebase.hosting.length, 1)
  assert.equal(production.firebase.hosting[0].site, 'cse416-meet-people')
  assert.equal(production.firebase.hosting[0].public, 'dist/web')
  assert.equal(production.firebase.hosting[0].rewrites[0].run.serviceId, 'pebble-api')
  assert.ok(production.auth.includes('site_url = "https://pebble.garden"'))
  assert.ok(production.auth.includes('https://pebble.garden/auth/callback**'))
  assert.ok(!production.auth.includes('.dev.pebble.garden'))
})

test('frontend builds reject the wrong branch, project, missing key or unresolved commit', () => {
  const env = { DEPLOY_ENVIRONMENT: 'sandbox', VITE_BUILD_BRANCH: 'dev', VITE_BUILD_SHA: 'a'.repeat(40), VITE_SUPABASE_URL: 'https://wixdiotkntapwrbibaom.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'public-key' }
  assert.deepEqual(validateFrontendConfiguration(env), { branch: 'dev', sha: env.VITE_BUILD_SHA, supabaseUrl: env.VITE_SUPABASE_URL })
  assert.throws(() => validateFrontendConfiguration({ ...env, VITE_BUILD_BRANCH: 'main' }), /dev/)
  assert.throws(() => validateFrontendConfiguration({ ...env, VITE_SUPABASE_URL: 'https://wacgxhsdhrqigrmqaonc.supabase.co' }), /matching Supabase/)
  assert.throws(() => validateFrontendConfiguration({ ...env, VITE_BUILD_SHA: 'dev' }), /commit SHA/)
  assert.throws(() => validateFrontendConfiguration({ ...env, VITE_SUPABASE_PUBLISHABLE_KEY: '' }), /public key/)
  assert.throws(() => validateFrontendConfiguration({ ...env, DEPLOY_ENVIRONMENT: 'other' }), /sandbox or production/)
  const production = { ...env, DEPLOY_ENVIRONMENT: 'production', VITE_BUILD_BRANCH: 'main', VITE_SUPABASE_URL: 'https://wacgxhsdhrqigrmqaonc.supabase.co' }
  assert.equal(validateFrontendConfiguration(production).branch, 'main')
  assert.throws(() => validateFrontendConfiguration({ ...production, VITE_BUILD_BRANCH: 'dev' }), /main/)
  assert.throws(() => validateFrontendConfiguration({ ...production, VITE_SUPABASE_URL: env.VITE_SUPABASE_URL }), /matching Supabase/)
})

test('dev web and mobile include their own screens and toolbar; production web excludes mobile and development controls', () => {
  const env = { ...process.env, DEPLOY_ENVIRONMENT: 'sandbox', VITE_BUILD_BRANCH: 'dev', VITE_BUILD_SHA: 'a'.repeat(40), VITE_SUPABASE_URL: 'https://wixdiotkntapwrbibaom.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'test-public-key' }
  const bundle = (product = 'web') => readdirSync(`dist/${product}/assets`).filter(file => file.endsWith('.js')).map(file => readFileSync(`dist/${product}/assets/${file}`, 'utf8')).join('\n')
  execFileSync('pnpm', ['build:web:devtools'], { stdio: 'inherit', env })
  assert.ok(bundle().includes('Development navigation'))
  assert.ok(!bundle().includes('/__dev/login'))
  assert.ok(!bundle().includes('Continue with email'))
  execFileSync('pnpm', ['build:mobile:devtools'], { stdio: 'inherit', env })
  assert.ok(bundle('mobile').includes('Development navigation'))
  assert.ok(bundle('mobile').includes('Continue with email'))
  assert.ok(!bundle('mobile').includes('/__dev/login'))
  execFileSync('node', ['scripts/configure-deployment.mjs', '--write-build-info'], { stdio: 'inherit', env })
  for (const product of ['web', 'mobile']) {
    assert.deepEqual(JSON.parse(readFileSync(`dist/${product}/build-info.json`, 'utf8')), { branch: 'dev', sha: env.VITE_BUILD_SHA, supabaseUrl: env.VITE_SUPABASE_URL, product })
    assert.ok(bundle(product).includes(env.VITE_SUPABASE_URL))
  }
  execFileSync('pnpm', ['build:web'], { stdio: 'inherit', env: { ...process.env, VITE_DEV_TOOLS: 'false' } })
  assert.ok(!bundle().includes('Development navigation'))
  assert.ok(!bundle().includes('/__dev/login'))
})

test('hosted smoke checks reject incorrect product, branch, commit, backend and frontend bundles', () => {
  const info = { branch: 'dev', sha: 'a'.repeat(40), supabaseUrl: 'https://wixdiotkntapwrbibaom.supabase.co', product: 'mobile' }
  function smoke(overrides = {}, javascript = `${info.supabaseUrl} Continue with email`) {
    const mock = `globalThis.fetch = async input => {
      const path = new URL(input).pathname;
      const body = path === '/build-info.json' ? ${JSON.stringify({ ...info, ...overrides })}
        : path.startsWith('/assets/') ? ${JSON.stringify(javascript)}
        : path === '/api/health' ? {status:'ok'}
        : path === '/api/auth/email' ? {exists:false}
        : path === '/api/events' ? {events:[]}
        : path === '/api/matchmaking/account' ? {}
        : '<div id="root"></div><script src="/assets/index-test.js"></script>';
      return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
        status: path === '/api/matchmaking/account' ? 401 : 200,
        headers: {'content-type':'text/html', 'cache-control': path.startsWith('/assets/') ? 'immutable' : 'private, no-store'}
      });
    };`
    return execFileSync('node', ['--import', `data:text/javascript,${encodeURIComponent(mock)}`, 'tests/integration/hosted/test-hosted.mjs', 'https://example.test'], {
      env: { ...process.env, HOSTED_PRODUCT: 'mobile', VITE_BUILD_BRANCH: info.branch, RELEASE_SHA: info.sha, VITE_SUPABASE_URL: info.supabaseUrl },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  }
  assert.doesNotThrow(() => smoke())
  for (const overrides of [{product:'web'}, {branch:'main'}, {sha:'b'.repeat(40)}, {supabaseUrl:'https://wacgxhsdhrqigrmqaonc.supabase.co'}]) {
    assert.throws(() => smoke(overrides))
  }
  assert.throws(() => smoke({}, 'https://wacgxhsdhrqigrmqaonc.supabase.co Continue with email'))
  assert.throws(() => smoke({}, info.supabaseUrl))
})
