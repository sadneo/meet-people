import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { supabaseRefs } from './configure-deployment.mjs'

// Operator setup for this app's two fixed projects. Normal releases preserve
// these secrets and use configure-sbengaged-sync.mjs to reconcile the schedules.
const producer = supabaseRefs.production, mirror = supabaseRefs.sandbox
const directory = mkdtempSync(join(tmpdir(), 'pebble-event-sharing-'))
let activeCredential = ''
const quote = value => `'${value.replaceAll("'", "''")}'`
const cli = args => {
  try { return execFileSync('pnpm', ['exec', 'supabase', ...args, '--yes'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }
  catch (error) {
    const detail = `${error.stderr ?? ''}\n${error.stdout ?? ''}`.replace(/[A-Za-z0-9_-]{32,}/g, '[redacted]').slice(-3000)
    // eslint-disable-next-line preserve-caught-error -- Raw CLI errors may include credential-bearing output; retain only redacted diagnostics.
    throw new Error(`Public event sharing setup failed: ${activeCredential ? detail.replaceAll(activeCredential, '[redacted]') : detail}`)
  }
}
function query(ref, sql) {
  const file = join(directory, 'setup.sql')
  writeFileSync(file, sql, { mode: 0o600 })
  const data = JSON.parse(cli(['db', 'query', '--linked', '--project-ref', ref, '--file', file, '--output', 'json']))
  return Array.isArray(data) ? data : data.rows
}
try {
  const sourceRows = query(producer, "select decrypted_secret from vault.decrypted_secrets where name='pebble_sbengaged_export_token'")
  if (!Array.isArray(sourceRows) || sourceRows.length > 1) throw new Error('Shared export credential inventory is ambiguous.')
  const token = sourceRows[0]?.decrypted_secret ?? randomBytes(32).toString('hex')
  if (typeof token !== 'string' || !/^[a-zA-Z0-9_-]{32,256}$/.test(token)) throw new Error('Invalid shared export credential.')
  activeCredential = token
  for (const [ref, mode] of [[producer, 'producer'], [mirror, 'mirror']]) {
    const rows = query(ref, "select id from vault.secrets where name='pebble_sbengaged_export_token'")
    if (rows.length > 1) throw new Error('Duplicate shared credential entries.')
    if (rows[0]) query(ref, `select vault.update_secret(${quote(rows[0].id)}::uuid,${quote(token)})`)
    else query(ref, `select vault.create_secret(${quote(token)},'pebble_sbengaged_export_token')`)
    console.info(`${ref}: ${mode} public-event sharing credential provisioned; existing ingestion credentials preserved.`)
  }
} finally { rmSync(directory, { recursive: true, force: true }) }
