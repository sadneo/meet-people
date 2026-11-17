import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { delimiter, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import concurrently from 'concurrently'
import { engineReachable as reachable } from './lib/containers.mjs'
import { freePorts } from './lib/ports.mjs'
import { childEnv, currentStack, startDevStack } from './lib/stack.mjs'
import { waitForRun } from './lib/wait.mjs'
import { main as doctor } from './doctor.mjs'
import { ensureLocalEnv } from './write-local-env.mjs'

const root = resolve(fileURLToPath(import.meta.url), '../..')
const attempts = 3

export function parts({ root: base, exists = existsSync, engine = false, ports } = {}) {
  const installed = exists(join(base, 'node_modules'))
  const app = (name, command, env) => ({ name, required: true, ready: installed, needs: 'pnpm install', command, env: ports && env })
  return [
    { name: 'supabase', required: true, ready: engine, needs: 'Docker or rootless Podman' },
    { name: 'env', required: true, ready: engine, needs: 'Supabase running (.env.local is written only when missing)' },
    app('web', 'vite', { VITE_PORT: String(ports?.web) }),
    app('mobile', 'vite --config vite.mobile.config.ts', { VITE_PORT: String(ports?.mobile) }),
    app('api', 'tsx watch --env-file-if-exists=.env.local api/server.ts', { PORT: String(ports?.api) }),
    { name: 'functions', required: false, ready: exists(join(base, 'supabase/.env')), needs: 'supabase/.env', command: 'sh scripts/supabase.sh functions serve --env-file supabase/.env' },
    { name: 'worker', required: false, ready: engine, needs: 'Supabase running (its --setup creates the worker credentials)', command: 'tsx scripts/run-local-event-groups.ts --setup --watch' },
  ]
}

export function helpText(list) {
  return ['Usage: pnpm dev [--check [--json] | --remote | --help]', '',
    'pnpm dev starts the local stack for this worktree on its own Supabase and free ports.',
    '--check runs read-only diagnostics; --remote runs web + API against the hosted project in .env.', '',
    `${'part'.padEnd(10)}${'required'.padEnd(10)}requires`,
    ...list.map(part => `${part.name.padEnd(10)}${(part.required ? 'yes' : 'no').padEnd(10)}${part.needs}`)].join('\n')
}

async function appPorts(taken) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const [web, api, mobile] = await freePorts(3, attempt ? [] : [3000, 3001, 3002])
    if (![web, api, mobile].some(port => taken.includes(port))) return { web, api, mobile }
  }
  throw new Error('Could not find free ports for the app servers.')
}

async function launch(context, stack, keys, { log, interrupt, signal }) {
  const ports = await appPorts(Object.values(stack.ports))
  if (signal.aborted) return null
  const runId = randomUUID()
  const list = parts({ ...context, ports })
  const env = {
    ...childEnv(stack, keys),
    PATH: `${join(root, 'node_modules/.bin')}${delimiter}${process.env.PATH}`,
    API_PORT: String(ports.api), PEBBLE_RUN_ID: runId,
  }
  const active = list.filter(part => part.command && part.ready)
  const { commands, result } = concurrently(active.map(part => ({ name: part.name, command: part.command, env: { ...env, ...part.env } })),
    { cwd: root, prefix: 'name', prefixColors: 'auto' })
  const required = new Set(list.filter(part => part.required).map(part => part.name))
  const died = new Promise((_, reject) => {
    for (const command of commands) if (required.has(command.name)) command.close.subscribe(event => reject(new Error(`${command.name} exited (${event.exitCode}).`)))
  })
  died.catch(() => {})
  const stop = () => { for (const command of commands) command.kill() }
  interrupt.stop = stop
  const base = port => `http://127.0.0.1:${port}`
  try {
    await Promise.race([died, Promise.all([
      waitForRun(`${base(ports.web)}/__pebble/run`, runId, { signal }), waitForRun(`${base(ports.mobile)}/__pebble/run`, runId, { signal }), waitForRun(`${base(ports.api)}/api/health`, runId, { signal }),
    ])])
  } catch (error) {
    stop()
    await result.catch(() => {})
    throw error
  }
  log(`\nweb     ${base(ports.web)}\nmobile  ${base(ports.mobile)}\napi     ${base(ports.api)}`)
  log(`supabase  ${keys.apiUrl}  (studio ${base(stack.ports.studio)})`)
  for (const part of list) if (!part.required && !part.ready) log(`skipped ${part.name}: needs ${part.needs}`)
  const failed = await Promise.race([result.then(() => null, () => null), died.then(() => null, error => error)])
  stop()
  await result.catch(() => {})
  return failed
}

async function remote() {
  const [api, web] = await freePorts(2)
  process.on('SIGINT', () => {})
  return new Promise(done => spawn(process.execPath, ['scripts/run-remote-messaging.mjs'], {
    cwd: root, stdio: 'inherit', env: { ...process.env, PORT: String(api), API_PORT: String(api), VITE_PORT: String(web) },
  }).once('error', () => done(1)).once('exit', code => done(code ?? 1)))
}

export async function main(args = process.argv.slice(2), { engineReachable = reachable, log = console.log, error = console.error } = {}) {
  if (args.includes('--help')) { log(helpText(parts({ root }))); return 0 }
  if (args.includes('--check')) return doctor(args.filter(arg => arg !== '--check'), { stack: currentStack(root, {}) })
  if (args.includes('--remote')) return remote()
  if (args.length) { error(helpText(parts({ root }))); return 1 }
  if (!(await engineReachable())) { error('Start Docker, or rootless Podman: systemctl --user start podman.socket'); return 1 }
  const context = { root, engine: true }
  const blocked = parts(context).find(part => part.required && !part.ready)
  if (blocked) { error(`${blocked.name} needs ${blocked.needs}`); return 1 }
  const interrupt = {}
  const controller = new AbortController()
  const { signal } = controller
  const onSignal = () => {
    if (signal.aborted) process.exit(130)
    controller.abort(); interrupt.stop?.()
  }
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)
  try {
    log('Starting Supabase for this worktree (reused when already running)...')
    let started
    try { started = await startDevStack(root, { signal }) } catch (cause) {
      if (cause !== signal.reason) throw cause
      log('\nInterrupted during Supabase start.')
      return 130
    }
    const { stack, keys } = started
    keys.publishableKey ??= keys.anonKey
    ensureLocalEnv(keys, join(root, '.env.local'))
    let failure
    for (let attempt = 1; attempt <= attempts && !signal.aborted; attempt++) {
      try { failure = await launch(context, stack, keys, { log, interrupt, signal }); break } catch (cause) {
        failure = cause
        if (attempt < attempts) log(`App start failed (${cause.message}); retrying with new ports (${attempt}/${attempts - 1}).`)
      }
    }
    if (failure && !signal.aborted) error(failure.message)
    log('\nApp processes stopped. The Supabase dev stack is still running; stop it with: pnpm supabase stop')
    return failure && !signal.aborted ? 1 : 0
  } finally {
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main()
