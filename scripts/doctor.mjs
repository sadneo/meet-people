import { execFile } from 'node:child_process'
import { lstat, readFile } from 'node:fs/promises'
import { createConnection } from 'node:net'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseEnv, promisify } from 'node:util'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const execute = promisify(execFile)
const signatures = ['get_account()', 'public_live_events(text,integer,integer,uuid)', 'get_connection_request_allowance()', 'get_friends_discovery_status()']
const schemaQuery = `select json_build_object('missing', (select coalesce(json_agg(name), '[]'::json) from unnest(array[${signatures.map(name => `'${name}'`).join(',')}]) name where to_regprocedure('public.' || name) is null), 'worker', to_regprocedure('public.claim_local_event_group_job(text,integer,uuid)') is not null);`

function localUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash
  } catch { return false }
}

function publicKey(value = '') {
  if (value.startsWith('sb_publishable_')) return value.length > 15
  try { return value.split('.').length === 3 && JSON.parse(Buffer.from(value.split('.')[1], 'base64url')).role === 'anon' } catch { return false }
}

async function occupied(port) {
  return new Promise(resolve => {
    const socket = createConnection({ host: '127.0.0.1', port })
    const finish = value => { socket.destroy(); resolve(value) }
    socket.setTimeout(700, () => finish(null))
    socket.once('connect', () => finish(true))
    socket.once('error', error => finish(error.code === 'ECONNREFUSED' ? false : null))
  })
}

// All external operations are injected so tests need no Docker, ports or credentials.
export async function diagnose({ directory = root, env = process.env, node = process.versions.node,
  home = homedir(), uid = process.getuid?.(), run = execute, read = readFile,
  stat = lstat, probe = occupied } = {}) {
  const checks = []
  const add = (id, status, message) => checks.push({ id, status, message })
  const command = async (file, args, extra = {}) => {
    try { return (await run(file, args, { cwd: directory, env, timeout: 5000, maxBuffer: 65536, encoding: 'utf8', ...extra })).stdout.trim() } catch { return null }
  }
  const pkg = JSON.parse(await read(join(directory, 'package.json'), 'utf8'))
  const major = Number(node.split('.')[0])
  add('node', major < 22 ? 'fail' : major === 22 ? 'pass' : 'warn', major === 22 ? 'Node.js 22 matches CI.' : major < 22 ? 'Use Node.js 22 or newer; CI uses 22.' : 'Node.js is newer than CI; use 22 when reproducing CI issues.')
  const version = await command('pnpm', ['--version'])
  const expected = pkg.packageManager.split('@')[1]
  add('pnpm', version === expected ? 'pass' : 'fail', version === expected ? 'pnpm matches package.json.' : 'Use the pnpm version declared in package.json; doctor installs nothing.')
  try { await stat(join(directory, 'node_modules/.pnpm')); add('dependencies', 'pass', 'Dependencies are installed (lockfile freshness is not verified).') }
  catch { add('dependencies', 'fail', 'Dependencies are missing. Run pnpm install --frozen-lockfile.') }
  add('supabase-cli', await command('pnpm', ['exec', 'supabase', '--version']) ? 'pass' : 'fail', 'Supabase CLI: requires installed project dependencies; use pnpm exec supabase --version to investigate.')

  const files = {}
  for (const name of ['.env', '.env.local', '.env.development', '.env.development.local']) {
    try {
      const text = await read(join(directory, name), 'utf8')
      if (text.length > 65536) throw new Error('Oversized environment')
      files[name] = parseEnv(text)
    } catch (error) { if (error.code !== 'ENOENT') add(`env-file:${name}`, 'fail', `Could not read ${name}; check syntax and permissions. Contents are never printed.`) }
  }
  const server = { ...files['.env.local'], ...env }
  const browser = { ...files['.env'], ...files['.env.local'], ...files['.env.development'], ...files['.env.development.local'], ...env }
  for (const [name, config] of [['SUPABASE_URL', server], ['VITE_SUPABASE_URL', browser]]) {
    add(name, !config[name] ? 'fail' : localUrl(config[name]) ? 'pass' : 'warn', !config[name] ? `${name} is missing. For local Supabase, review pnpm env:local (writes .env.local).` : localUrl(config[name]) ? `${name} targets loopback.` : `${name} is not a plain local HTTP origin. Doctor will not contact it.`)
  }
  if (server.SUPABASE_URL && browser.VITE_SUPABASE_URL) {
    let same = false
    try { same = new URL(server.SUPABASE_URL).origin === new URL(browser.VITE_SUPABASE_URL).origin } catch { /* Invalid configuration is reported above. */ }
    add('supabase-targets', same ? 'pass' : 'fail', same ? 'Browser and API target the same Supabase origin.' : 'SUPABASE_URL and VITE_SUPABASE_URL do not identify the same origin. Align browser/API configuration.')
  }
  for (const [name, config] of [['SUPABASE_PUBLISHABLE_KEY', server], ['VITE_SUPABASE_PUBLISHABLE_KEY', browser]]) {
    add(name, publicKey(config[name]) ? 'pass' : 'fail', publicKey(config[name]) ? `${name} has a public-key shape (not authenticated).` : `${name} is missing or not a public publishable/anon key. Never use a service-role key in VITE_*.`)
  }
  add('server-key', server.SUPABASE_SERVICE_ROLE_KEY ? 'pass' : 'fail', server.SUPABASE_SERVICE_ROLE_KEY ? 'SUPABASE_SERVICE_ROLE_KEY is present (validity is not verified).' : 'SUPABASE_SERVICE_ROLE_KEY is missing; local API features require it.')
  const leaked = Object.keys(browser).filter(name => name.startsWith('VITE_') && /SECRET|SERVICE_ROLE|PASSWORD|PRIVATE/i.test(name))
  add('browser-secrets', leaked.length ? 'fail' : 'pass', leaked.length ? 'Potential private configuration uses VITE_* names. Remove it before building; values are never printed.' : 'No obviously private VITE_* variable names found (not a comprehensive secret scan).')
  const maps = browser.VITE_GOOGLE_MAPS_API_KEY && server.GOOGLE_MAPS_SERVER_API_KEY && /^[a-f0-9]{64}$/i.test(server.SEARCH_LOCATION_SIGNING_KEY ?? '') && server.GOOGLE_MAPS_STORAGE_APPROVED === 'true'
  add('maps', maps ? 'pass' : 'warn', maps ? 'Maps configuration is present; provider restrictions and DB signing key are not verified.' : 'Optional Maps setup is incomplete. See docs/google-search-locations.md; no provider requests were made.')

  for (const [name, raw] of [['web', env.VITE_PORT ?? 3000], ['api', env.PORT ?? files['.env.local']?.PORT ?? 3001]]) {
    const port = Number(raw)
    if (!Number.isInteger(port) || port < 1 || port > 65535) { add(`port:${name}`, 'fail', `Invalid ${name} port configuration.`); continue }
    const busy = await probe(port)
    add(`port:${name}`, busy === false ? 'pass' : 'warn', busy === false ? `${name} port ${port} is available.` : busy ? `${name} port ${port} is occupied; this may be your running app. Ownership was not verified.` : `${name} port ${port} could not be checked.`)
  }
  if (String(env.API_PORT ?? 3001) !== String(server.PORT ?? 3001)) add('api-proxy', 'warn', 'API_PORT (Vite proxy) and PORT (API listener) differ. Align them before pnpm dev.')

  // Match scripts/supabase.sh's rootless Podman socket fallback without changing global configuration.
  const dockerEnv = { ...env }
  if (!dockerEnv.DOCKER_HOST) {
    try {
      const socket = join(env.XDG_RUNTIME_DIR ?? `/run/user/${uid}`, 'podman/podman.sock')
      if ((await stat(socket)).isSocket()) dockerEnv.DOCKER_HOST = `unix://${socket}`
    } catch { /* Docker's default socket remains authoritative. */ }
  }
  const docker = (args) => command('docker', args, { env: dockerEnv })
  const engine = await docker(['info', '--format', '{{json .ServerVersion}}'])
  add('docker', engine ? 'pass' : 'fail', engine ? 'Docker-compatible engine is reachable.' : 'Docker-compatible engine is unavailable. Start it or review DOCKER_HOST/socket permissions.')
  if (engine) {
    const metadata = await docker(['inspect', '--format', '{"running":{{json .State.Running}},"project":{{json (index .Config.Labels "com.supabase.cli.project")}}}', 'supabase_db_meet-people'])
    let owned = false
    try { const container = JSON.parse(metadata); owned = container.running === true && container.project === 'meet-people' } catch { /* Fail closed. */ }
    add('supabase-db', owned ? 'pass' : 'fail', owned ? 'Expected local Supabase database container is running.' : 'Expected local database is absent, stopped, or has unexpected ownership. Review pnpm supabase:start; doctor starts nothing.')
    if (owned) {
      // No application RPCs are invoked. The session itself is read-only and bounded.
      const result = await docker(['exec', '-e', 'PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=3000', 'supabase_db_meet-people', 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', schemaQuery])
      try {
        const schema = JSON.parse(result)
        if (!Array.isArray(schema.missing) || schema.missing.some(name => !signatures.includes(name)) || typeof schema.worker !== 'boolean') throw new Error('Unexpected schema response')
        add('schema', schema.missing.length ? 'fail' : 'pass', schema.missing.length ? `Missing local RPCs: ${schema.missing.join(', ')}. Review docs/demo-matchmaking-readiness.md; do not reset existing data.` : 'Core account, Events, allowance and Friends status RPC signatures exist (permissions/behavior not verified).')
        add('worker-schema', schema.worker ? 'pass' : 'warn', schema.worker ? 'Optional local group-worker claim RPC exists. This does not prove a worker is running.' : 'Optional local group-worker claim RPC is absent. See pnpm dev:groups and docs/demo-data.md; setup changes require an explicit action.')
      } catch { add('schema', 'fail', 'Read-only local schema inspection failed. Check database readiness; no migrations were applied.') }
    }
  }
  try {
    const file = await stat(join(home, '.local/share/pebble/development-account.json'))
    const safe = file.isFile() && (uid === undefined || file.uid === uid) && (file.mode & 0o7777) === 0o600 && file.size <= 8192
    add('development-login', safe ? 'pass' : 'warn', safe ? 'Development credential file metadata is valid; contents, authentication and onboarding were not checked.' : 'Optional development credential file has unsafe type, ownership, permissions or size. Review dev/development-login.ts; doctor does not read it.')
  } catch { add('development-login', 'warn', 'Optional development credential file is absent or inaccessible. Normal sign-in remains available; doctor does not provision accounts.') }
  return { checks, summary: Object.fromEntries(['pass', 'warn', 'fail'].map(status => [status, checks.filter(check => check.status === status).length])) }
}

export async function main(args = process.argv.slice(2)) {
  if (args.includes('--help')) { console.log('Usage: pnpm run doctor [--json] (alias: pnpm dev:doctor)\nRead-only local diagnostics. Warnings exit 0; failed prerequisites exit 1. No installs, login, resets or provider requests.'); return 0 }
  if (args.some(arg => arg !== '--json')) { console.error('Usage: pnpm run doctor [--json]'); return 1 }
  try {
    const report = await diagnose()
    if (args.includes('--json')) console.log(JSON.stringify(report, null, 2))
    else {
      console.log('Pebble doctor — read-only local diagnostics\n')
      for (const check of report.checks) console.log(`${check.status.toUpperCase().padEnd(4)} ${check.id}: ${check.message}`)
      console.log(`\n${report.summary.pass} passed, ${report.summary.warn} warnings, ${report.summary.fail} failures. Nothing was changed.`)
    }
    return report.summary.fail ? 1 : 0
  } catch { console.error('Doctor could not complete. Check repository files and permissions. Diagnostic details were withheld to protect configuration values.'); return 1 }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main()
