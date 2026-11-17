import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { freePorts } from './lib/ports.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))

export async function runBrowser(args, env = {}) {
  const [port] = await freePorts(1)
  const child = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', ...(args.some(arg => arg === '-c' || arg.startsWith('--config')) ? [] : ['--config', 'playwright.config.ts']), ...args], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...env, PEBBLE_BROWSER_PORT: String(port), PEBBLE_RUN_ID: randomUUID() },
  })
  const forward = signal => child.kill(signal)
  const signals = ['SIGINT', 'SIGTERM']
  for (const signal of signals) process.on(signal, forward)
  return new Promise(resolve => child.on('exit', (code, signal) => {
    for (const name of signals) process.removeListener(name, forward)
    resolve(code ?? (signal ? 1 : 0))
  }))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(await runBrowser(process.argv.slice(2)))
