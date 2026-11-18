import { execFile } from 'node:child_process'
import { lstat, readFile } from 'node:fs/promises'
import { createConnection } from 'node:net'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseEnv, promisify } from 'node:util'
import { engineCli, engineEnv } from './lib/containers.mjs'
import { credentialsDir, currentStack } from './lib/stack.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const execute = promisify(execFile)
const signatures = ['get_account()', 'public_live_events(text,integer,integer,uuid)', 'get_connection_request_allowance()', 'get_friends_discovery_status()']
const schemaQuery = `select json_build_object('missing', (select coalesce(json_agg(name), '[]'::json) from unnest(array[${signatures.map(name => `'${name}'`).join(',')}]) name where to_regprocedure('public.' || name) is null), 'worker', to_regprocedure('public.claim_local_event_group_job(text,integer,uuid)') is not null);`

const hostedEnvKeys = ['VITE_API_BASE_URL', 'SUPABASE_URL', 'VITE_SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY']
const legacyEnvFiles = ['.env.local', 'supabase/.env', '.env.android', '.env.android-dev', '.env.prod', '.env.hosting.local', '.env.development', '.env.development.local']

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
  stat = lstat, probe = occupied, which, stack = currentStack(directory, env) } = {}) {
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

  // Local Supabase values come from the running stack; .env holds only secrets.
  let secrets = {}
  try {
    const text = await read(join(directory, '.env'), 'utf8')
    if (text.length > 65536) throw new Error('Oversized environment')
    secrets = parseEnv(text)
    add('env-file:.env', 'pass', '.env is readable.')
  } catch (error) {
    if (error.code === 'ENOENT') add('env-file:.env', 'warn', 'No .env: Google sign-in and functions are off. Copy .env.example to .env and fill in what you need.')
    else add('env-file:.env', 'fail', 'Could not read .env; check syntax and permissions. Contents are never printed.')
  }
  for (const name of legacyEnvFiles) {
    try { await read(join(directory, name), 'utf8') } catch (error) { if (error.code === 'ENOENT') continue }
    add(`legacy-env:${name}`, 'warn', `${name} is retired and may still be picked up by Vite or the Supabase CLI. Move its secrets to .env (see .env.example), then delete it.`)
  }
  // An old-style .env pointed the app at a hosted project; pnpm dev now supplies local values and hosted ones need --target.
  const hosted = hostedEnvKeys.filter(name => secrets[name])
  if (hosted.length) add('env-hosted-values', 'warn', `.env still sets ${hosted.join(', ')}. Remove them: local values come from pnpm dev, hosted ones from shared/targets.json and SANDBOX_/PRODUCTION_ keys.`)
  const config = { ...secrets, ...env }
  const leaked = Object.keys(config).filter(name => name.startsWith('VITE_') && /SECRET|SERVICE_ROLE|PASSWORD|PRIVATE/i.test(name))
  add('browser-secrets', leaked.length ? 'fail' : 'pass', leaked.length ? 'Potential private configuration uses VITE_* names. Remove it before building; values are never printed.' : 'No obviously private VITE_* variable names found (not a comprehensive secret scan).')
  const maps = config.VITE_GOOGLE_MAPS_API_KEY && config.GOOGLE_MAPS_SERVER_API_KEY && /^[a-f0-9]{64}$/i.test(config.SEARCH_LOCATION_SIGNING_KEY ?? '') && config.GOOGLE_MAPS_STORAGE_APPROVED === 'true'
  add('maps', maps ? 'pass' : 'warn', maps ? 'Maps configuration is present; provider restrictions and DB signing key are not verified.' : 'Optional Maps setup is incomplete. See docs/google-search-locations.md; no provider requests were made.')

  // pnpm dev picks free ports each run, so only explicitly configured ports are probed.
  for (const [name, raw] of [['web', env.VITE_PORT], ['mobile', env.VITE_PORT], ['api', env.PORT]]) {
    if (raw === undefined) continue
    const port = Number(raw)
    if (!Number.isInteger(port) || port < 1 || port > 65535) { add(`port:${name}`, 'fail', `Invalid ${name} port configuration.`); continue }
    const busy = await probe(port)
    add(`port:${name}`, busy === false ? 'pass' : 'warn', busy === false ? `${name} port ${port} is available.` : busy ? `${name} port ${port} is occupied; this may be your running app. Ownership was not verified.` : `${name} port ${port} could not be checked.`)
  }
  if (env.VITE_PORT !== undefined) add('frontend-ports', 'warn', 'VITE_PORT overrides both web and mobile ports. pnpm dev sets it per process; unset it in your shell.')
  if (String(env.API_PORT ?? 3001) !== String(env.PORT ?? 3001)) add('api-proxy', 'warn', 'API_PORT (Vite proxy) and PORT (API listener) differ. pnpm dev sets both; unset them in your shell.')

  const cli = await engineCli({ which })
  const dockerEnv = await engineEnv(env, { stat, uid })
  const docker = (args) => command(cli, args, { env: dockerEnv })
  const engine = await docker(['info'])
  add('docker', engine ? 'pass' : 'fail', engine ? 'Docker-compatible engine is reachable.' : 'Docker-compatible engine is unavailable. Start it or review DOCKER_HOST/socket permissions.')
  if (engine && !stack) add('supabase-db', 'fail', 'No local stack for this worktree. Run pnpm dev first.')
  else if (engine) {
    const metadata = await docker(['inspect', '--format', '{"running":{{json .State.Running}},"project":{{json (index .Config.Labels "com.supabase.cli.project")}}}', stack.dbContainer])
    let owned = false
    try { const container = JSON.parse(metadata); owned = container.running === true && container.project === stack.projectId } catch { /* Fail closed. */ }
    add('supabase-db', owned ? 'pass' : 'fail', owned ? 'Expected local Supabase database container is running.' : 'Expected local database is absent, stopped, or has unexpected ownership. Run pnpm dev; doctor starts nothing.')
    if (owned) {
      // No application RPCs are invoked. The session itself is read-only and bounded.
      const result = await docker(['exec', '-e', 'PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=3000', stack.dbContainer, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', schemaQuery])
      try {
        const schema = JSON.parse(result)
        if (!Array.isArray(schema.missing) || schema.missing.some(name => !signatures.includes(name)) || typeof schema.worker !== 'boolean') throw new Error('Unexpected schema response')
        add('schema', schema.missing.length ? 'fail' : 'pass', schema.missing.length ? `Missing local RPCs: ${schema.missing.join(', ')}. Review docs/demo-matchmaking-readiness.md; do not reset existing data.` : 'Core account, Events, allowance and Friends status RPC signatures exist (permissions/behavior not verified).')
        add('worker-schema', schema.worker ? 'pass' : 'warn', schema.worker ? 'Optional local group-worker claim RPC exists. This does not prove a worker is running.' : 'Optional local group-worker claim RPC is absent. See pnpm dev and docs/demo-data.md; setup changes require an explicit action.')
      } catch { add('schema', 'fail', 'Read-only local schema inspection failed. Check database readiness; no migrations were applied.') }
    }
  }
  try {
    const file = await stat(join(credentialsDir(stack?.projectId ?? 'meet-people', home), 'development-account.json'))
    const safe = file.isFile() && (uid === undefined || file.uid === uid) && (file.mode & 0o7777) === 0o600 && file.size <= 8192
    add('development-login', safe ? 'pass' : 'warn', safe ? 'Development credential file metadata is valid; contents, authentication and onboarding were not checked.' : 'Optional development credential file has unsafe type, ownership, permissions or size. Review dev/development-login.ts; doctor does not read it.')
  } catch { add('development-login', 'warn', 'Optional development credential file is absent or inaccessible. Normal sign-in remains available; doctor does not provision accounts.') }
  return { checks, summary: Object.fromEntries(['pass', 'warn', 'fail'].map(status => [status, checks.filter(check => check.status === status).length])) }
}

export async function main(args = process.argv.slice(2), options = {}) {
  if (args.includes('--help')) { console.log('Usage: pnpm dev --check [--json]\nRead-only local diagnostics. Warnings exit 0; failed prerequisites exit 1. No installs, login, resets or provider requests.'); return 0 }
  if (args.some(arg => arg !== '--json')) { console.error('Usage: pnpm dev --check [--json]'); return 1 }
  try {
    const report = await diagnose(options)
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
