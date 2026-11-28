import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { freePorts } from './lib/ports.mjs'
import { hostedTarget } from './lib/targets.mjs'

export function remoteMessagingEnvironment(configuration, inherited = process.env) {
  const url = new URL(configuration.SUPABASE_URL ?? '')
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co') || url.username || url.password || url.pathname !== '/') {
    throw new Error('Remote messaging requires an HTTPS Supabase project URL.')
  }
  if (configuration.VITE_SUPABASE_URL && configuration.VITE_SUPABASE_URL !== url.origin) {
    throw new Error('Browser and server Supabase URLs must match.')
  }
  const publicKey = configuration.SUPABASE_PUBLISHABLE_KEY ?? configuration.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!publicKey || !configuration.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Set the public and server Supabase keys.')
  if (configuration.VITE_SUPABASE_PUBLISHABLE_KEY && configuration.VITE_SUPABASE_PUBLISHABLE_KEY !== publicKey) {
    throw new Error('Browser and server Supabase public keys must match.')
  }
  // Pass only explicit public browser settings. Vite must not load .env or
  // forward a VITE_* password from an unrelated local development configuration.
  const environment = Object.fromEntries(Object.entries({ ...inherited, ...configuration }).filter(([name]) => !name.startsWith('VITE_')))
  if (!inherited.PORT) throw new Error('Remote messaging needs PORT; run pnpm dev --remote.')
  return { ...environment, NODE_ENV: 'development', PORT: inherited.PORT, API_PORT: inherited.PORT,
    SUPABASE_URL: url.origin, SUPABASE_PUBLISHABLE_KEY: publicKey,
    VITE_SUPABASE_URL: url.origin, VITE_SUPABASE_PUBLISHABLE_KEY: publicKey,
    VITE_API_BASE_URL: '', VITE_DEV_TOOLS: 'false' }
}

async function main() {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const [api, web] = process.env.PORT && process.env.VITE_PORT ? [] : await freePorts(2)
  const port = process.env.VITE_PORT ?? String(web)
  const target = hostedTarget(process.argv.slice(2))
  if (!target.serviceRoleKey) throw new Error(`Set ${target.name.toUpperCase()}_SUPABASE_SERVICE_ROLE_KEY in .env.`)
  const environment = remoteMessagingEnvironment({ SUPABASE_URL: target.supabaseUrl, SUPABASE_PUBLISHABLE_KEY: target.supabasePublishableKey, SUPABASE_SERVICE_ROLE_KEY: target.serviceRoleKey },
    { ...process.env, PORT: process.env.PORT ?? String(api) })
  const children = []
  let stopping = false
  const stop = () => { if (stopping) return; stopping = true; for (const child of children) child.kill('SIGTERM') }
  for (const [args, extra] of [[['exec', 'tsx', 'api/server.ts'], {}], [['exec', 'vite', '--config', 'vite.remote.config.ts', '--mode', 'remote'], { VITE_PORT: port }]]) {
    const child = spawn('pnpm', args, { cwd: root, env: { ...environment, ...extra }, stdio: 'inherit' })
    children.push(child)
    child.on('error', () => { process.exitCode = 1; stop() })
    child.on('exit', code => { if (!stopping) { process.exitCode = code || 1; stop() } })
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  console.log(`Remote Supabase: ${new URL(environment.SUPABASE_URL).hostname}`)
  console.log(`Open http://127.0.0.1:${port}/messages and sign in with remote accounts.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main().catch(error => { console.error(error.message); process.exit(2) })
