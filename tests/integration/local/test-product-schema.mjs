// Replay both supported schema tracks in disposable, network-none containers.
// The running local stack supplies Auth DDL only; no user rows are copied.
import assert from 'node:assert/strict'
import { URL } from 'node:url'
import { readFileSync, readdirSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { setTimeout } from 'node:timers/promises'
import process from 'node:process'
import console from 'node:console'
import { buildProductSchema } from '../../../scripts/product-schema.mjs'

const root = new URL('../../../', import.meta.url)
const source = path => readFileSync(new URL(path, root), 'utf8')
const migrations = readdirSync(new URL('supabase/migrations', root)).filter(name => name.endsWith('.sql')).sort()
const prerequisite = '20261027000000_product_prerequisites.sql'
const image = execFileSync('docker', ['inspect', 'supabase_db_meet-people', '--format', '{{.Config.Image}}'], { encoding: 'utf8' }).trim()
const auth = execFileSync('docker', ['exec', 'supabase_db_meet-people', 'pg_dump', '-U', 'postgres', '-d', 'postgres', '--schema-only', '--schema=auth', '--no-owner', '--no-privileges'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })

async function replay(track, check) {
  const container = `pebble-product-schema-test-${process.pid}-${track}`
  function query(text, expectSuccess = true) {
    const result = spawnSync('docker', ['exec', '-i', container, 'psql', '-X', '-qAt', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: text, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
    if (expectSuccess) assert.equal(result.status, 0, result.stderr)
    else assert.notEqual(result.status, 0, 'Unsafe installation unexpectedly succeeded')
    return result.stdout.trim()
  }
  function migrate(names) {
    for (const name of names) {
      try { query(source(`supabase/migrations/${name}`)) }
      catch (cause) { throw new Error(`Migration failed: ${name}`, { cause }) }
    }
  }
  execFileSync('docker', ['run', '--detach', '--name', container, '--network', 'none', '--env', 'POSTGRES_PASSWORD=disposable-test', image], { stdio: 'pipe' })
  try {
    let ready = false
    for (let attempt = 0; attempt < 60; attempt++) {
      // initdb starts a temporary server too. Wait for the final PID 1 server
      // before replay so initialization cannot restart it during our queries.
      if (spawnSync('docker', ['exec', container, 'sh', '-c', 'read process_name < /proc/1/comm; case "$process_name" in *postgres*) pg_isready -U postgres ;; *) exit 1 ;; esac'], { stdio: 'pipe' }).status === 0) { ready = true; break }
      const running = execFileSync('docker', ['inspect', container, '--format', '{{.State.Running}}'], { encoding: 'utf8' }).trim()
      if (running !== 'true') throw new Error(execFileSync('docker', ['logs', container], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
      await setTimeout(1000)
    }
    assert.ok(ready, 'Disposable PostgreSQL did not finish initialization')
    query('create schema if not exists extensions; create extension if not exists pgcrypto with schema extensions; drop schema auth cascade;')
    query(auth)
    await check(query, migrate)
  } finally { execFileSync('docker', ['rm', '--force', '--volumes', container], { stdio: 'pipe' }) }
}

await replay('uuid', (query, migrate) => {
  migrate(migrations)
  const bundle = buildProductSchema('uuid')
  assert.equal(query(`select source_hash='${bundle.hash}' and version='${bundle.version}' from deployment_private.product_versions`), 't')
  assert.equal(query("select atttypid='uuid'::regtype from pg_attribute where attrelid='public.conversations'::regclass and attname='id'"), 't')
  query("insert into public.conversations(kind,source_key) values('event_group','preserved-test')")
  query(source(`supabase/migrations/${prerequisite}`))
  assert.equal(query("select count(*)=1 and to_regnamespace('messaging_archive') is null from public.conversations"), 't', 'Existing native contact data was changed')
  query(bundle.sql, false)
  assert.equal(query('select count(*) from deployment_private.product_versions'), '1')
  query("delete from public.conversations where source_key='preserved-test'")
  query(source('supabase/seed.sql'))
  query(source('tests/integration/sql/seed-messaging.sql'))
  query(source('tests/integration/sql/hosted-services.sql'))
  console.info('PASS: fresh migration replay, native UUID preservation, product receipt, seeds and SQL security checks.')
})

await replay('legacy', (query, migrate) => {
  migrate(migrations.filter(name => name < prerequisite))
  const bundle = buildProductSchema()
  query("insert into public.conversations(kind,source_key) values('event_group','preserved-test')")
  query(bundle.sql, false)
  assert.equal(query("select count(*)=1 and to_regnamespace('messaging_archive') is null from public.conversations"), 't', 'Failed conversion did not preserve the old store')
  query("delete from public.conversations where source_key='preserved-test'")
  query(bundle.sql)
  migrate(migrations.filter(name => name >= prerequisite))
  assert.equal(query(`select source_hash='${bundle.hash}' and version='${bundle.version}' from deployment_private.product_versions`), 't')
  query(bundle.sql, false)
  assert.equal(query('select count(*) from deployment_private.product_versions'), '1')
  console.info('PASS: activated legacy upgrade, nonempty-store rollback, unchanged source receipt and duplicate-install refusal.')
})
