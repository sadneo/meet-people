import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import process from 'node:process'
import console from 'node:console'

export function deploymentConfiguration(env, base) {
  const sandbox = env.DEPLOY_ENVIRONMENT === 'sandbox'
  assert.ok(sandbox || env.DEPLOY_ENVIRONMENT === 'production', 'Choose sandbox or production')
  for (const key of ['GCP_PROJECT_ID', 'GCP_REGION', 'GAR_REPOSITORY', 'API_SERVICE', 'API_RUNTIME_ACCOUNT', 'API_SECRET', 'WORKER_JOB', 'WORKER_RUNTIME_ACCOUNT', 'FIREBASE_HOSTING_SITE_ID', 'SUPABASE_PROJECT_REF', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY']) {
    assert.ok(env[key], `Missing ${key}; configure the GitHub environment`)
  }
  assert.match(env.SUPABASE_PROJECT_REF, /^[a-z]{20}$/)
  assert.equal(env.SUPABASE_URL, `https://${env.SUPABASE_PROJECT_REF}.supabase.co`)
  const productionRef = 'wacgxhsdhrqigrmqaonc'
  assert.equal(env.API_SERVICE, sandbox ? 'pebble-api-sandbox' : 'pebble-api')
  assert.equal(env.API_SECRET, sandbox ? 'pebble-supabase-service-role-sandbox' : 'pebble-supabase-service-role')
  assert.equal(env.API_RUNTIME_ACCOUNT, `${env.API_SERVICE}@${env.GCP_PROJECT_ID}.iam.gserviceaccount.com`)
  assert.equal(env.WORKER_JOB, sandbox ? 'pebble-event-group-worker-sandbox' : 'pebble-event-group-worker')
  assert.equal(env.WORKER_RUNTIME_ACCOUNT, `${sandbox ? 'pebble-worker-sandbox' : env.WORKER_JOB}@${env.GCP_PROJECT_ID}.iam.gserviceaccount.com`)
  if (sandbox) assert.notEqual(env.SUPABASE_PROJECT_REF, productionRef, 'Sandbox must never use the production database')
  else assert.equal(env.SUPABASE_PROJECT_REF, productionRef, 'Production must use its existing database')
  const sites = [env.FIREBASE_HOSTING_SITE_ID]
  if (sandbox) sites.push(env.FIREBASE_DEVTOOLS_SITE_ID)
  assert.equal(new Set(sites).size, sites.length, 'Sites must be distinct')
  for (const site of sites) {
    assert.match(site ?? '', /^[a-z0-9][a-z0-9-]{0,28}[a-z0-9]$/)
    if (sandbox) assert.notEqual(site, 'cse416-meet-people', 'Sandbox must never overwrite the production site')
    else assert.equal(site, 'cse416-meet-people')
  }
  const hosting = sites.map((site, index) => ({
    ...base.hosting,
    site,
    public: index === 0 ? 'dist/web' : 'dist/web-devtools',
    rewrites: base.hosting.rewrites.map(rewrite => rewrite.run ? {
      ...rewrite, run: { ...rewrite.run, serviceId: env.API_SERVICE, region: env.GCP_REGION },
    } : rewrite),
  }))
  const redirects = sites.flatMap(site => [`https://${site}.web.app/auth/callback**`, `https://${site}.web.app/reset-password**`])
  const auth = `project_id = "meet-people"\n\n[auth]\nsite_url = ${JSON.stringify(`https://${sites[0]}.web.app`)}\nadditional_redirect_urls = ${JSON.stringify(redirects)}\nenable_signup = true\nminimum_password_length = 8\n\n[auth.email]\nenable_confirmations = true\nsecure_password_change = true\n`
  return { firebase: { hosting }, auth }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.ok(process.env.SUPABASE_ACCESS_TOKEN, 'Missing SUPABASE_ACCESS_TOKEN')
  const config = deploymentConfiguration(process.env, JSON.parse(readFileSync('firebase.json', 'utf8')))
  writeFileSync('firebase.deploy.json', JSON.stringify(config.firebase, null, 2) + '\n')
  mkdirSync('hosting/deployment/supabase', { recursive: true })
  writeFileSync('hosting/deployment/supabase/config.toml', config.auth)
  console.info(`Validated ${process.env.DEPLOY_ENVIRONMENT} resource isolation; generated Hosting and Auth configuration.`)
}
