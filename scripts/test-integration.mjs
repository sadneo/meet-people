import { spawn, execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFileSync, rmSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { container } from './lib/containers.mjs'
import { reapTestStacks, removeStack, startStack, stackEnv, testStack } from './lib/stack.mjs'
import { runBuilt } from './test-built.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const node = process.execPath
const bin = path => join(root, 'node_modules', path)
const matching = process.argv.includes('--matching')
const sqlContracts = ['seed-messaging', 'hosted-services', 'dining-menus', 'sbengaged-month-sync']

const abort = new AbortController()
let current
let interrupted = false
const onSignal = signal => {
  if (interrupted) process.exit(130)
  interrupted = true
  console.error(`\n${signal}: stopping and removing test stacks (signal again to quit now).`)
  abort.abort(new Error(`Interrupted by ${signal}`))
  current?.kill('SIGTERM')
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => onSignal(signal))

const run = (command, args, env) => new Promise(resolve => {
  if (abort.signal.aborted) return resolve(130)
  current = spawn(command, args, { cwd: root, env, stdio: 'inherit' })
  current.once('error', error => { console.error(error.message); resolve(1) })
  current.once('close', code => resolve(code ?? 1))
})

const childEnv = (stack, keys) => ({
  ...process.env,
  ...stackEnv(stack),
  SUPABASE_URL: keys.apiUrl,
  VITE_SUPABASE_URL: keys.apiUrl,
  SUPABASE_PUBLISHABLE_KEY: keys.publishableKey,
  VITE_SUPABASE_PUBLISHABLE_KEY: keys.publishableKey,
  SUPABASE_SERVICE_ROLE_KEY: keys.serviceRoleKey,
})

async function dbTypes(env) {
  const { stdout } = await promisify(execFile)('sh', ['scripts/supabase.sh', 'gen', 'types', 'typescript', '--local'], { cwd: root, env, maxBuffer: 32 * 1024 * 1024, encoding: 'buffer' })
  if (stdout.equals(readFileSync(join(root, 'src/types/database.ts')))) return 0
  const directory = mkdtempSync(join(tmpdir(), 'pebble-types-'))
  const generated = join(directory, 'database.ts')
  writeFileSync(generated, stdout)
  console.error('src/types/database.ts is out of date; run pnpm db:types')
  const diff = await promisify(execFile)('git', ['diff', '--no-index', '--', 'src/types/database.ts', generated], { cwd: root, maxBuffer: 32 * 1024 * 1024 }).catch(error => error)
  console.error(String(diff.stdout).split('\n').slice(0, 40).join('\n'))
  rmSync(directory, { recursive: true, force: true })
  return 1
}

async function sqlSection(stack) {
  for (const name of sqlContracts) {
    console.log(`  ${name}.sql`)
    await container(['exec', '-i', stack.dbContainer, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: readFileSync(join(root, 'tests/integration/sql', `${name}.sql`)) })
  }
  return 0
}

async function builtApp(env) {
  for (const args of [['typescript/bin/tsc', '--noEmit'], ['vite/bin/vite.js', 'build'], ['typescript/bin/tsc', '-p', 'tsconfig.api.json']]) {
    const [script, ...rest] = args
    const code = await run(node, [bin(script), ...rest], env)
    if (code) return code
  }
  return runBuilt([], env)
}

async function matchingSection(runId, stacks) {
  const stack = await testStack(`${runId}-m`)
  stacks.push(stack.projectId)
  const workdir = join(root, 'worktree', `local-matchmaking-${runId}`)
  try {
    const prepared = await run('python', ['scripts/start-matching-supabase.py', '--prepare-only'], { ...process.env, PEBBLE_MATCHING_WORKDIR: workdir })
    if (prepared) return prepared
    const keys = await startStack(stack, { minimal: true, workdir, signal: abort.signal })
    return await run(node, ['tests/integration/local/test-matching-http.mjs'], childEnv(stack, keys))
  } finally {
    rmSync(workdir, { recursive: true, force: true })
  }
}

const results = []
const stacks = []
let failed = 0
const finish = (name, code) => {
  results.push([name, code === 0])
  if (code !== 0) failed++
}

try {
  for (const projectId of await reapTestStacks()) console.log(`Removed leftover test stack ${projectId}`)
  const runId = randomBytes(4).toString('hex')
  const stack = await testStack(runId)
  stacks.push(stack.projectId)
  console.log(`== test stack ${stack.projectId} (api ${stack.apiUrl})`)
  let keys
  try { keys = await startStack(stack, { minimal: true, signal: abort.signal }) } catch (error) { console.error(error.message) }
  const env = keys && childEnv(stack, keys)
  const sections = [
    ['db types', () => dbTypes(env)],
    ['sql contracts', () => sqlSection(stack)],
    ['local auth', () => run(node, ['tests/integration/local/test-local-auth.mjs'], env)],
    ['schema replay', () => run(node, ['tests/integration/local/test-product-schema.mjs'], env)],
    ['built app', () => builtApp(env)],
    ...(matching ? [['matching', () => matchingSection(runId, stacks)]] : []),
  ]
  for (const [name, body] of sections) {
    if (abort.signal.aborted) break
    if (!keys) { finish(name, 1); continue }
    console.log(`\n== ${name}`)
    try { finish(name, await body()) } catch (error) { console.error(error.message); finish(name, 1) }
  }
} finally {
  for (const projectId of stacks) {
    try { await removeStack(projectId) } catch (error) { console.error(`Could not remove ${projectId}: ${error.message}`); failed++ }
  }
}

console.log('\n== results')
for (const [name, ok] of results) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)
process.exit(interrupted ? 130 : failed ? 1 : 0)
