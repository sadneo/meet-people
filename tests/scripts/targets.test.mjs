import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { hostedBuildEnv, hostedTarget, privateValues, readSecrets, withoutTarget } from '../../scripts/lib/targets.mjs'

test('only secret-named .env values count as private, so public IDs never fail a release scan', () => {
  const secrets = { GOOGLE_CLIENT_ID: 'x.apps.googleusercontent.com', FIREBASE_PROJECT_ID: 'cse416-meet-people', GOOGLE_CLIENT_SECRET: 'g-secret',
    INGEST_TOKEN: 'ingest', PRODUCTION_SUPABASE_SERVICE_ROLE_KEY: 'service', GOOGLE_MAPS_SERVER_API_KEY: 'maps', SEARCH_LOCATION_SIGNING_KEY: 'sign',
    FIREBASE_SERVICE_ACCOUNT_JSON: '{}', VITE_GOOGLE_MAPS_API_KEY: 'public', EMPTY_SECRET: '' }
  assert.deepEqual(Object.keys(privateValues(secrets)).sort(), ['FIREBASE_SERVICE_ACCOUNT_JSON', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_MAPS_SERVER_API_KEY', 'INGEST_TOKEN', 'PRODUCTION_SUPABASE_SERVICE_ROLE_KEY', 'SEARCH_LOCATION_SIGNING_KEY'])
})

test('a hosted APK build gets only the target values, never shell VITE_* or cleartext', () => {
  const env = hostedBuildEnv(hostedTarget(['--target', 'sandbox'], {}), { PATH: '/bin', VITE_DEV_LOGIN_PASSWORD: 'local', VITE_SUPABASE_URL: 'http://127.0.0.1:54321', CAP_CLEARTEXT: '1' })
  assert.deepEqual(env, { PATH: '/bin', VITE_API_BASE_URL: 'https://web.dev.pebble.garden', VITE_SUPABASE_URL: 'https://wixdiotkntapwrbibaom.supabase.co',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_kaK_4TJxKDDta7iD1IvegA_gW5EM5hZ', VITE_APP_SCHEME: 'com.cse416.meetpeople.dev',
    VITE_GOOGLE_MAPS_API_KEY: 'AIzaSyAqYGUSZD12OhU5Kb-mPKemWIsb5Bn8SR8' })
  assert.equal(hostedBuildEnv(hostedTarget(['--target', 'production'], {}), {}).VITE_APP_SCHEME, 'com.cse416.meetpeople')
  assert.equal('VITE_GOOGLE_MAPS_API_KEY' in hostedBuildEnv(hostedTarget(['--target', 'production'], {}), { VITE_GOOGLE_MAPS_API_KEY: 'shell' }), false)
})

test('hosted commands require an explicit, known target', () => {
  for (const args of [[], ['--target'], ['--target', 'staging'], ['--target=sandbox']]) {
    assert.throws(() => hostedTarget(args, {}), /--target sandbox\|production/)
  }
})

test('a target combines committed public values with its own prefixed secret', () => {
  const secrets = { SANDBOX_SUPABASE_SERVICE_ROLE_KEY: 'sandbox-key', PRODUCTION_SUPABASE_SERVICE_ROLE_KEY: 'production-key' }
  const sandbox = hostedTarget(['x', '--target', 'sandbox'], secrets)
  assert.equal(sandbox.name, 'sandbox')
  assert.equal(sandbox.supabaseProjectRef, 'wixdiotkntapwrbibaom')
  assert.equal(sandbox.supabaseUrl, 'https://wixdiotkntapwrbibaom.supabase.co')
  assert.equal(sandbox.serviceRoleKey, 'sandbox-key')
  const production = hostedTarget(['--target', 'production'], secrets)
  assert.equal(production.apiBaseUrl, 'https://pebble.garden')
  assert.equal(production.serviceRoleKey, 'production-key')
  assert.equal(hostedTarget(['--target', 'sandbox'], {}).serviceRoleKey, undefined)
})

test('withoutTarget strips the flag and its value only', () => {
  assert.deepEqual(withoutTarget(['https://a.test', '--target', 'sandbox', '--product']), ['https://a.test', '--product'])
})

test('readSecrets parses .env and tolerates its absence', () => {
  const root = mkdtempSync(join(tmpdir(), 'targets-'))
  assert.deepEqual(readSecrets(root), {})
  writeFileSync(join(root, '.env'), 'SANDBOX_SUPABASE_SERVICE_ROLE_KEY=abc\n')
  assert.deepEqual(readSecrets(root), { SANDBOX_SUPABASE_SERVICE_ROLE_KEY: 'abc' })
})
