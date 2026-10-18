import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import console from 'node:console'

const ref = process.env.SUPABASE_PROJECT_REF
if (!/^[a-z]{20}$/.test(ref ?? '')) throw new Error('Set SUPABASE_PROJECT_REF to the intended hosted project.')
const quote = value => `'${value.replaceAll("'", "''")}'`
const directory = mkdtempSync(join(tmpdir(), 'pebble-hosting-'))
function cli(args) {
  try { return execFileSync('pnpm', ['exec', 'supabase', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }
  catch { throw new Error('Supabase configuration failed. Check CLI login/access and applied migrations; credentials were not logged.') }
}
function query(sql) {
  const file = join(directory, 'configure.sql')
  writeFileSync(file, sql, { mode: 0o600 })
  return JSON.parse(cli(['db', 'query', '--linked', '--project-ref', ref, '--file', file, '--output', 'json']))
}
try {
  const definitions = [
    ['pebble_project_url', `https://${ref}.supabase.co`],
    ['pebble_ingest_token', process.env.INGEST_TOKEN],
    ['pebble_embed_secret', process.env.EMBED_SHARED_SECRET],
  ]
  const values = {}
  for (const [name, supplied] of definitions) {
    const rows = query(`select id, decrypted_secret from vault.decrypted_secrets where name = ${quote(name)}`)
    const value = supplied || rows[0]?.decrypted_secret || randomBytes(32).toString('hex')
    if (/[\r\n]/.test(value)) throw new Error('Secrets must be single-line values.')
    if (rows[0]) query(`select vault.update_secret(${quote(rows[0].id)}::uuid, ${quote(value)})`)
    else query(`select vault.create_secret(${quote(value)}, ${quote(name)})`)
    values[name] = value
  }
  const secrets = { INGEST_TOKEN: values.pebble_ingest_token, EMBED_SHARED_SECRET: values.pebble_embed_secret }
  if (process.env.GEMINI_API_KEY) secrets.GEMINI_API_KEY = process.env.GEMINI_API_KEY
  if (process.env.TICKETMASTER_API_KEY) secrets.TICKETMASTER_API_KEY = process.env.TICKETMASTER_API_KEY
  if (Object.values(secrets).some(value => /[\r\n]/.test(value))) throw new Error('Secrets must be single-line values.')
  const file = join(directory, 'functions.env')
  writeFileSync(file, Object.entries(secrets).map(([name, value]) => `${name}=${JSON.stringify(value)}`).join('\n'), { mode: 0o600 })
  cli(['secrets', 'set', '--project-ref', ref, '--env-file', file])
  cli(['config', 'push', '--project-ref', ref, '--workdir', 'hosting', '--yes'])
  console.info('Hosted Vault and Edge Function secrets configured; existing generated tokens preserved.')
} finally {
  rmSync(directory, { recursive: true, force: true })
}
