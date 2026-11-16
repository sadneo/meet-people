// Synthetic production-like legacy upgrade. No hosted connection, no app DB writes.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { setTimeout } from 'node:timers/promises'
import { URL } from 'node:url'
import process from 'node:process'
import console from 'node:console'
import { buildProductSchema } from '../../../scripts/product-schema.mjs'

const root = new URL('../../../', import.meta.url)
const source = path => readFileSync(new URL(path, root), 'utf8')
const names = readdirSync(new URL('supabase/migrations/', root)).filter(name => name.endsWith('.sql')).sort()
const head = '20261101000000'
const baseline = names.filter(name => name.split('_')[0] <= head)
const pending = names.filter(name => name.split('_')[0] > head)
assert.deepEqual(pending, [
  '20261104060000_push_notifications.sql', '20261104060100_push_accepted_and_match.sql',
  '20261105000000_garden_economy.sql', '20261105010000_garden_social_rewards.sql',
  '20261113000000_adult_only_release.sql', '20261113010000_garden_cave.sql',
  '20261114010000_push_service_grants.sql',
], 'Production baseline changed; review the rehearsal before executing.')
const container = `pebble-production-rehearsal-${process.pid}`
const docker = args => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 }).trim()
// Local Auth DDL only. No production access, and no source-table rows are copied.
const image = docker(['inspect', 'supabase_db_meet-people', '--format', '{{.Config.Image}}'])
const auth = docker(['exec', 'supabase_db_meet-people', 'pg_dump', '-U', 'postgres', '-d', 'postgres', '--schema-only', '--schema=auth', '--no-owner', '--no-privileges'])
const sql = text => execFileSync('docker', ['exec', '-i', container, 'psql', '-X', '-qAt', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: text, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 }).trim()
const migrate = name => {
  try {
    sql(source(`supabase/migrations/${name}`))
    sql(`insert into supabase_migrations.schema_migrations(version) values('${name.split('_')[0]}');`)
    console.info(`PASS: ${name}`)
  } catch (cause) { throw new Error(`Migration failed: ${name}`, { cause }) }
}
let created = false
try {
  docker(['run', '--detach', '--name', container, '--label', 'pebble.task=production-rehearsal', '--network', 'none', '--memory', '1g', '--cpus', '2', '--env', 'POSTGRES_PASSWORD=disposable-rehearsal', image])
  created = true
  console.info(`Owned container: ${container}; emergency cleanup: docker rm -f -v ${container}`)
  let ready = false
  for (let i = 0; i < 60; i++) {
    if (spawnSync('docker', ['exec', container, 'sh', '-c', 'read name < /proc/1/comm; case "$name" in *postgres*) pg_isready -U postgres ;; *) exit 1 ;; esac'], { stdio: 'pipe' }).status === 0) { ready = true; break }
    if (docker(['inspect', container, '--format', '{{.State.Running}}']) !== 'true') throw new Error(docker(['logs', container]))
    await setTimeout(1000)
  }
  assert.ok(ready, 'PostgreSQL startup timed out')
  sql('create schema if not exists extensions; create extension if not exists pgcrypto with schema extensions; drop schema auth cascade;')
  sql(auth)
  sql('create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations(version text primary key);')
  const prerequisite = '20261027000000_product_prerequisites.sql'
  for (const name of baseline.filter(name => name < prerequisite)) migrate(name)
  const bundle = buildProductSchema()
  sql(bundle.sql)
  for (const name of baseline.filter(name => name >= prerequisite)) migrate(name)
  assert.equal(sql(`select source_hash='${bundle.hash}' from deployment_private.product_versions`), 't')
  assert.equal(sql('select count(*) from supabase_migrations.schema_migrations'), String(baseline.length))
  // Reproduce the live state: push objects exist, but version receipts are absent.
  for (const name of pending.slice(0, 2)) sql(source(`supabase/migrations/${name}`))
  assert.equal(sql("select to_regnamespace('garden_private') is null"), 't')
  // The shared demo seed assumes native UUID messaging; production uses legacy
  // bigint messaging. Seed only our own minimal synthetic preservation fixture.
  sql(`insert into auth.users(id,email_confirmed_at,created_at,is_anonymous)
    values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',now(),now()-interval '20 days',false);
    insert into public.profiles(id,username,display_name,birthdate)
    values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','production-rehearsal','Synthetic upgrade fixture','2000-01-01');`)
  const fingerprint = () => sql(`select md5(coalesce(jsonb_agg(to_jsonb(p) order by id)::text,'')) from public.profiles p`)
  const before = fingerprint()
  assert.notEqual(sql('select count(*) from public.profiles'), '0')
  for (const name of pending) migrate(name)
  assert.equal(fingerprint(), before, 'Upgrade changed existing synthetic profiles')
  assert.equal(sql('select count(*) from supabase_migrations.schema_migrations'), String(names.length))
  sql(source('tests/integration/sql/garden-rewards.sql'))
  sql(source('tests/integration/sql/public-live-events.sql'))
  sql(source('tests/integration/sql/adult-release.sql'))
  assert.equal(sql(`select has_table_privilege('anon','public.push_devices','SELECT') or has_table_privilege('authenticated','public.push_devices','SELECT') or has_table_privilege('authenticated','garden_private.wallets','SELECT')`), 'f')
  console.info('PASS: legacy production-like upgrade, existing push replay, preserved synthetic profiles, migration history, Garden rewards, public events and direct-table denial.')
} finally {
  if (created) {
    docker(['rm', '--force', '--volumes', container])
    console.info(`CLEANED: ${container} and its anonymous volumes. Existing Docker resources untouched.`)
  }
}
