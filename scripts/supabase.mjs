import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { devStack, stackEnv } from './lib/stack.mjs'

const root = resolve(fileURLToPath(import.meta.url), '../..')

export async function supabase(args, stdio = 'inherit') {
  // config.toml reads secrets such as env(GOOGLE_CLIENT_ID) from the environment.
  if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'))
  const stack = await devStack(root)
  const child = spawn('sh', ['scripts/supabase.sh', ...args], { cwd: root, stdio, env: { ...process.env, ...stackEnv(stack) } })
  return { child, code: new Promise(done => child.once('error', () => done(1)).once('close', code => done(code ?? 1))) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await (await supabase(process.argv.slice(2))).code
