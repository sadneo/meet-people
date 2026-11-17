import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { freePorts } from './lib/ports.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))

export async function runBrowser(args, env = {}) {
  const [port] = await freePorts(1)
  const child = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.config.ts', ...args], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...env, PEBBLE_BROWSER_PORT: String(port), PEBBLE_RUN_ID: randomUUID() },
  })
  const stop = signal => () => child.kill(signal)
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, stop(signal))
  return new Promise(resolve => child.on('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0))))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(await runBrowser(process.argv.slice(2)))
