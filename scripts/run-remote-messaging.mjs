import { readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { parseEnv } from 'node:util'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { freePorts } from './lib/ports.mjs'

export function remoteMessagingEnvironment(configuration, inherited = process.env) {
  const url = new URL(configuration.SUPABASE_URL ?? '')
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co') || url.username || url.password || url.pathname !== '/') {
    throw new Error('Remote messaging requires an HTTPS Supabase project URL in .env.')
  }
  if (configuration.VITE_SUPABASE_URL && configuration.VITE_SUPABASE_URL !== url.origin) {
    throw new Error('Browser and server Supabase URLs must match in .env.')
  }
  const publicKey = configuration.SUPABASE_PUBLISHABLE_KEY ?? configuration.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!publicKey || !configuration.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Set the public and server Supabase keys in .env.')
  if (configuration.VITE_SUPABASE_PUBLISHABLE_KEY && configuration.VITE_SUPABASE_PUBLISHABLE_KEY !== publicKey) {
    throw new Error('Browser and server Supabase public keys must match in .env.')
  }
  // Pass only explicit public browser settings. Vite must not load .env.local or
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
  const environment = remoteMessagingEnvironment(parseEnv(readFileSync(new URL('../.env', import.meta.url), 'utf8')),
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
