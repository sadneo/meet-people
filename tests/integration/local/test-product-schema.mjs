// Replay both supported schema tracks in disposable, network-none containers.
// The running local stack supplies Auth DDL only; no user rows are copied.
import assert from 'node:assert/strict'
import { URL } from 'node:url'
import { readFileSync, readdirSync } from 'node:fs'
import { setTimeout } from 'node:timers/promises'
import process from 'node:process'
import console from 'node:console'
import { buildProductSchema } from '../../../scripts/product-schema.mjs'
import { containerResult, containerSync } from '../../../scripts/lib/containers.mjs'
import { requireStack } from '../../../scripts/lib/stack.mjs'

const root = new URL('../../../', import.meta.url)
const source = path => readFileSync(new URL(path, root), 'utf8')
const migrations = readdirSync(new URL('supabase/migrations', root)).filter(name => name.endsWith('.sql')).sort()
const prerequisite = '20261027000000_product_prerequisites.sql'
const { dbContainer } = requireStack()
const image = containerSync(['inspect', dbContainer, '--format', '{{.Config.Image}}'])
const auth = containerSync(['exec', dbContainer, 'pg_dump', '-U', 'postgres', '-d', 'postgres', '--schema-only', '--schema=auth', '--no-owner', '--no-privileges'])

async function replay(track, check) {
  const container = `pebble-product-schema-test-${process.pid}-${track}`
  function query(text, expectSuccess = true) {
    const result = containerResult(['exec', '-i', container, 'psql', '-X', '-qAt', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: text })
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
  containerSync(['run', '--detach', '--name', container, '--network', 'none', '--env', 'POSTGRES_PASSWORD=disposable-test', image])
  try {
    let ready = false
    for (let attempt = 0; attempt < 60; attempt++) {
      // initdb starts a temporary server too. Wait for the final PID 1 server
      // before replay so initialization cannot restart it during our queries.
      if (containerResult(['exec', container, 'sh', '-c', 'read process_name < /proc/1/comm; case "$process_name" in *postgres*) pg_isready -U postgres ;; *) exit 1 ;; esac']).status === 0) { ready = true; break }
      const running = containerSync(['inspect', container, '--format', '{{.State.Running}}'])
      if (running !== 'true') throw new Error(containerSync(['logs', container]))
      await setTimeout(1000)
    }
    assert.ok(ready, 'Disposable PostgreSQL did not finish initialization')
    query('create schema if not exists extensions; create extension if not exists pgcrypto with schema extensions; drop schema auth cascade;')
    query(auth)
    query(source('tests/integration/sql/realtime-bootstrap.sql'))
    await check(query, migrate)
  } finally { containerSync(['rm', '--force', '--volumes', container]) }
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
  query(source('tests/integration/sql/messaging-realtime.sql'))
  query(source('tests/integration/sql/messaging-typing.sql'))
  query(source('tests/integration/sql/hosted-services.sql'))
  query(source('tests/integration/sql/public-live-events.sql'))
  query(source('tests/integration/sql/garden-rewards.sql'))
  query(source('tests/integration/sql/progressive-onboarding.sql'))
  query(source('tests/integration/sql/profile-photo-gallery.sql'))
  query(source('tests/integration/sql/profile-customization.sql'))
  query(source('tests/integration/sql/photo-captions-prompts.sql'))
  query(source('tests/integration/sql/username-normalization.sql'))
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
  query(source('tests/integration/sql/messaging-realtime-legacy.sql'))
  query(source('tests/integration/sql/messaging-typing.sql'))
  query(source('tests/integration/sql/public-live-events.sql'))
  query(source('tests/integration/sql/garden-rewards.sql'))
  query(source('tests/integration/sql/progressive-onboarding.sql'))
  query(source('tests/integration/sql/profile-photo-gallery.sql'))
  query(source('tests/integration/sql/profile-customization.sql'))
  query(source('tests/integration/sql/photo-captions-prompts.sql'))
  query(source('tests/integration/sql/username-normalization.sql'))
  console.info('PASS: activated legacy upgrade, nonempty-store rollback, unchanged source receipt and duplicate-install refusal.')
})
