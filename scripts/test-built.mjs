import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { freePorts } from './lib/ports.mjs'
import { waitForRun } from './lib/wait.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))

export async function runBuilt(args, env = {}) {
  const [apiPort, webPort] = await freePorts(2)
  const run = randomUUID()
  const base = { ...process.env, ...env, PEBBLE_RUN_ID: run }
  const start = (command, childEnv) => spawn(process.execPath, command, { cwd: root, stdio: 'inherit', env: { ...base, ...childEnv } })
  const servers = [
    start(['--env-file-if-exists=.env.local', 'dist/api/api/server.js'], { PORT: String(apiPort) }),
    start(['node_modules/vite/bin/vite.js', 'preview'], { VITE_PREVIEW_PORT: String(webPort), API_PORT: String(apiPort) }),
  ]
  const abort = new AbortController()
  const kill = () => servers.forEach(server => server.kill())
  const onSignal = () => { abort.abort(); kill() }
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, onSignal)
  process.once('exit', kill)
  const exited = new Promise((_, reject) => servers.forEach(server => server.once('exit', code => reject(new Error(`Server exited early (${code}).`)))))
  exited.catch(() => {})
  try {
    await Promise.race([
      Promise.all([
        waitForRun(`http://127.0.0.1:${apiPort}/api/health`, run, { signal: abort.signal }),
        waitForRun(`http://127.0.0.1:${webPort}/__pebble/run`, run, { signal: abort.signal }),
      ]),
      exited,
    ])
    const tests = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.built.config.ts', ...args], {
      cwd: root,
      stdio: 'inherit',
      env: { ...base, PLAYWRIGHT_BASE_URL: `http://127.0.0.1:${webPort}` },
    })
    return await new Promise(resolve => tests.on('exit', code => resolve(code ?? 1)))
  } catch (error) {
    console.error(error.message)
    return 1
  } finally {
    servers.forEach(server => server.removeAllListeners('exit'))
    kill()
    process.removeListener('exit', kill)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(await runBuilt(process.argv.slice(2)))
