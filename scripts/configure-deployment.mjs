import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import process from 'node:process'
import console from 'node:console'

export const supabaseRefs = { sandbox: 'wixdiotkntapwrbibaom', production: 'wacgxhsdhrqigrmqaonc' }
const productionSites = ['cse416-meet-people', 'cse416-meet-people-mobile']

export function validateFrontendConfiguration(env) {
  assert.ok(Object.hasOwn(supabaseRefs, env.DEPLOY_ENVIRONMENT), 'Choose sandbox or production')
  const branch = env.DEPLOY_ENVIRONMENT === 'sandbox' ? 'dev' : 'main'
  const supabaseUrl = `https://${supabaseRefs[env.DEPLOY_ENVIRONMENT]}.supabase.co`
  assert.equal(env.VITE_BUILD_BRANCH, branch, `Frontend must come from ${branch}`)
  assert.match(env.VITE_BUILD_SHA ?? '', /^[0-9a-f]{40}$/, 'Frontend requires a resolved commit SHA')
  assert.equal(env.VITE_SUPABASE_URL, supabaseUrl, 'Frontend must use the matching Supabase project')
  assert.ok(env.VITE_SUPABASE_PUBLISHABLE_KEY, 'Missing frontend Supabase public key')
  assert.ok(env.VITE_GOOGLE_MAPS_API_KEY?.trim(), 'Missing Maps browser key; configure VITE_GOOGLE_MAPS_API_KEY in the GitHub environment')
  return { branch, sha: env.VITE_BUILD_SHA, supabaseUrl }
}

export function deploymentConfiguration(env, base) {
  const sandbox = env.DEPLOY_ENVIRONMENT === 'sandbox'
  assert.ok(sandbox || env.DEPLOY_ENVIRONMENT === 'production', 'Choose sandbox or production')
  for (const key of ['GCP_PROJECT_ID', 'GCP_REGION', 'GAR_REPOSITORY', 'API_SERVICE', 'API_RUNTIME_ACCOUNT', 'API_SECRET', 'WORKER_JOB', 'WORKER_RUNTIME_ACCOUNT', 'FIREBASE_WEB_SITE_ID', 'FIREBASE_MOBILE_SITE_ID', 'SUPABASE_PROJECT_REF', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY']) {
    assert.ok(env[key], `Missing ${key}; configure the GitHub environment`)
  }
  assert.match(env.SUPABASE_PROJECT_REF, /^[a-z]{20}$/)
  assert.equal(env.SUPABASE_URL, `https://${env.SUPABASE_PROJECT_REF}.supabase.co`)
  assert.equal(env.API_SERVICE, sandbox ? 'pebble-api-sandbox' : 'pebble-api')
  assert.equal(env.API_SECRET, sandbox ? 'pebble-supabase-service-role-sandbox' : 'pebble-supabase-service-role')
  assert.equal(env.API_RUNTIME_ACCOUNT, `${env.API_SERVICE}@${env.GCP_PROJECT_ID}.iam.gserviceaccount.com`)
  assert.equal(env.WORKER_JOB, sandbox ? 'pebble-event-group-worker-sandbox' : 'pebble-event-group-worker')
  assert.equal(env.WORKER_RUNTIME_ACCOUNT, `${sandbox ? 'pebble-worker-sandbox' : env.WORKER_JOB}@${env.GCP_PROJECT_ID}.iam.gserviceaccount.com`)
  assert.equal(env.SUPABASE_PROJECT_REF, supabaseRefs[env.DEPLOY_ENVIRONMENT], sandbox ? 'Sandbox must use pebble-sandbox, never the production database' : 'Production must use its existing database')
  const sites = [env.FIREBASE_WEB_SITE_ID, env.FIREBASE_MOBILE_SITE_ID]
  assert.equal(new Set(sites).size, sites.length, 'Sites must be distinct')
  sites.forEach((site, index) => {
    assert.match(site ?? '', /^[a-z0-9][a-z0-9-]{0,28}[a-z0-9]$/)
    if (sandbox) assert.ok(!productionSites.includes(site), 'Sandbox must never overwrite a production site')
    else assert.equal(site, productionSites[index])
  })
  const hosting = sites.map((site, index) => ({
    ...base.hosting,
    site,
    public: index === 0 ? 'dist/web' : 'dist/mobile',
    rewrites: base.hosting.rewrites.map(rewrite => rewrite.run ? {
      ...rewrite, run: { ...rewrite.run, serviceId: env.API_SERVICE, region: env.GCP_REGION },
    } : rewrite),
  }))
  const domains = sandbox ? ['web.dev.pebble.garden', 'mobile.dev.pebble.garden'] : ['pebble.garden', 'mobile.pebble.garden']
  const origins = [...domains.map(domain => `https://${domain}`), ...sites.map(site => `https://${site}.web.app`)]
  const nativeSchemes = sandbox ? ['com.cse416.meetpeople', 'com.cse416.meetpeople.dev'] : ['com.cse416.meetpeople']
  const callbackOrigins = [...origins, ...nativeSchemes.map(scheme => `${scheme}://app`)]
  const redirects = callbackOrigins.flatMap(origin => [`${origin}/auth/callback**`, `${origin}/reset-password**`])
  const auth = `project_id = "meet-people"\n\n[auth]\nsite_url = ${JSON.stringify(origins[0])}\nadditional_redirect_urls = ${JSON.stringify(redirects)}\nenable_signup = true\nminimum_password_length = 8\n\n[auth.email]\nenable_confirmations = true\nsecure_password_change = true\n`
  return { firebase: { hosting }, auth }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--validate-frontend') || process.argv.includes('--write-build-info')) {
    const info = validateFrontendConfiguration(process.env)
    if (process.argv.includes('--write-build-info')) {
      for (const product of ['web', 'mobile']) {
        writeFileSync(`dist/${product}/build-info.json`, JSON.stringify({ ...info, product }) + '\n')
      }
    }
    console.info(`Validated ${info.branch} frontend configuration.`)
  } else {
    assert.ok(process.env.SUPABASE_ACCESS_TOKEN, 'Missing SUPABASE_ACCESS_TOKEN')
    const config = deploymentConfiguration(process.env, JSON.parse(readFileSync('firebase.json', 'utf8')))
    writeFileSync('firebase.deploy.json', JSON.stringify(config.firebase, null, 2) + '\n')
    mkdirSync('hosting/deployment/supabase', { recursive: true })
    writeFileSync('hosting/deployment/supabase/config.toml', config.auth)
    console.info(`Validated ${process.env.DEPLOY_ENVIRONMENT} resource isolation; generated Hosting and Auth configuration.`)
  }
}
