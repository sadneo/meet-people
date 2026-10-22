// Full replay in a disposable, network-none PostgreSQL container. The running
// local stack is read only for Auth DDL; no user rows or credentials are copied.
import assert from 'node:assert/strict'
import { URL } from 'node:url'
import { readFileSync, readdirSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { setTimeout } from 'node:timers/promises'
import console from 'node:console'
import { buildProductSchema } from './product-schema.mjs'

const container = 'pebble-product-schema-test'
const root = new URL('../', import.meta.url)
const source = path => readFileSync(new URL(path, root), 'utf8')
function query(text, expectSuccess = true) {
  const result = spawnSync('docker', ['exec', '-i', container, 'psql', '-X', '-qAt', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: text, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
  if (expectSuccess) assert.equal(result.status, 0, result.stderr)
  else assert.notEqual(result.status, 0, 'Unsafe installation unexpectedly succeeded')
  return result.stdout.trim()
}
const image = execFileSync('docker', ['inspect', 'supabase_db_meet-people', '--format', '{{.Config.Image}}'], { encoding: 'utf8' }).trim()
execFileSync('docker', ['run', '--detach', '--rm', '--name', container, '--network', 'none', '--env', 'POSTGRES_PASSWORD=disposable-test', image], { stdio: 'pipe' })
try {
  for (let attempt = 0; attempt < 30; attempt++) {
    if (spawnSync('docker', ['exec', container, 'pg_isready', '-U', 'postgres'], { stdio: 'pipe' }).status === 0) break
    await setTimeout(1000)
  }
  const auth = execFileSync('docker', ['exec', 'supabase_db_meet-people', 'pg_dump', '-U', 'postgres', '-d', 'postgres', '--schema-only', '--schema=auth', '--no-owner', '--no-privileges'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
  query('create schema if not exists extensions; create extension if not exists pgcrypto with schema extensions; drop schema auth cascade;')
  query(auth)
  for (const name of readdirSync(new URL('supabase/migrations', root)).filter(name => name.endsWith('.sql')).sort()) query(source(`supabase/migrations/${name}`))
  const bundle = buildProductSchema()
  query("insert into public.conversations(kind,source_key) values('event_group','preserved-test')")
  query(bundle.sql, false)
  assert.equal(query("select count(*)=1 and to_regnamespace('messaging_archive') is null from public.conversations"), 't', 'Failed conversion did not preserve the old store')
  query("delete from public.conversations where source_key='preserved-test'")
  query(bundle.sql)
  assert.equal(query(`select source_hash='${bundle.hash}' from deployment_private.product_versions`), 't')
  query(bundle.sql, false)
  assert.equal(query('select count(*) from deployment_private.product_versions'), '1')
  console.info('PASS: full migrations + canonical product install, nonempty-store rollback, source receipt, duplicate-install refusal.')
} finally { execFileSync('docker', ['stop', container], { stdio: 'pipe' }) }
