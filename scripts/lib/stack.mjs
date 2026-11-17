import { spawn, execFile, execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { container as engine } from './containers.mjs'
import { freePorts, isFree } from './ports.mjs'

const repoRoot = resolve(fileURLToPath(import.meta.url), '../../..')
const label = 'com.supabase.cli.project'
const testPrefix = 'meet-people-test-'
const names = ['api', 'db', 'shadow', 'studio', 'mail']
const preferred = [54321, 54322, 54320, 54323, 54324]
const lines = value => value ? value.split('\n').filter(Boolean) : []
const makeStack = (projectId, ports) => ({ projectId, ports, apiUrl: `http://127.0.0.1:${ports.api}`, dbContainer: `supabase_db_${projectId}` })
const toPorts = list => Object.fromEntries(names.map((name, index) => [name, list[index]]))
const devFile = root => join(root, '.pebble/dev.json')

export function devProjectId(root = repoRoot) {
  try { if (statSync(join(root, '.git')).isDirectory()) return 'meet-people' } catch { /* no .git: treat as a worktree */ }
  const slug = basename(root).toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 40).replace(/^-+|-+$/g, '')
  return `meet-people-wt-${slug || 'worktree'}`
}

export function credentialsDir(projectId, home = homedir()) {
  const base = join(home, '.local/share/pebble')
  return projectId === 'meet-people' ? base : join(base, projectId)
}

export function stackEnv({ projectId, ports, apiUrl }) {
  return {
    SUPABASE_PROJECT_ID: projectId,
    SUPABASE_API_PORT: String(ports.api),
    SUPABASE_DB_PORT: String(ports.db),
    SUPABASE_DB_SHADOW_PORT: String(ports.shadow),
    SUPABASE_STUDIO_PORT: String(ports.studio),
    SUPABASE_LOCAL_SMTP_PORT: String(ports.mail),
    PEBBLE_SUPABASE_PROJECT_ID: projectId,
    PEBBLE_SUPABASE_URL: apiUrl,
  }
}

function readDev(root) {
  try { return JSON.parse(readFileSync(devFile(root), 'utf8')) } catch { return null }
}

export async function devStack(root = repoRoot, { container = engine } = {}) {
  const projectId = devProjectId(root)
  const dev = readDev(root)
  const saved = dev?.projectId === projectId ? dev.ports : null
  let ports = saved
  if (!saved || !(await container(['ps', '-q', '--filter', `name=^supabase_db_${projectId}$`]))) {
    const free = saved && (await Promise.all(Object.values(saved).map(isFree))).every(Boolean)
    if (!free) ports = toPorts(await freePorts(5, preferred))
  }
  return saveDev(root, projectId, ports)
}

function saveDev(root, projectId, ports) {
  mkdirSync(join(root, '.pebble'), { recursive: true })
  writeFileSync(devFile(root), JSON.stringify({ projectId, ports }, null, 2), { mode: 0o600 })
  chmodSync(devFile(root), 0o600)
  return makeStack(projectId, ports)
}

export async function testStack(runId) {
  return makeStack(`${testPrefix}${runId}`, toPorts(await freePorts(5)))
}

export function currentStack(root = repoRoot, env = process.env) {
  if (env.PEBBLE_SUPABASE_PROJECT_ID && env.PEBBLE_SUPABASE_URL) {
    return makeStack(env.PEBBLE_SUPABASE_PROJECT_ID, { api: Number(new URL(env.PEBBLE_SUPABASE_URL).port) })
  }
  const saved = readDev(root)
  return saved ? makeStack(saved.projectId, saved.ports) : null
}

export function requireStack(root, env) {
  const stack = currentStack(root, env)
  if (!stack) throw new Error('No local stack for this worktree. Run pnpm dev first.')
  return stack
}

const portVars = { api: 'SUPABASE_API_PORT', db: 'SUPABASE_DB_PORT', shadow: 'SUPABASE_DB_SHADOW_PORT', studio: 'SUPABASE_STUDIO_PORT', mail: 'SUPABASE_LOCAL_SMTP_PORT' }

// status derives API_URL from config.toml unless the port env is set, so pass this stack's.
export function supabaseStatus(stack) {
  const env = { ...process.env, SUPABASE_PROJECT_ID: stack.projectId }
  for (const [name, variable] of Object.entries(portVars)) if (stack.ports[name]) env[variable] = String(stack.ports[name])
  return JSON.parse(execFileSync('sh', ['scripts/supabase.sh', 'status', '--output', 'json'], { cwd: repoRoot, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024 }))
}

export function assertLocalStack(url, stack) {
  if (new URL(url).href !== `${stack.apiUrl}/`) throw new Error(`Refusing ${url}: not the local stack ${stack.apiUrl}.`)
}

const ownerDir = () => join(existsSync('/tmp/opencode') ? '/tmp/opencode' : tmpdir(), 'pebble-stacks')
const ownerFile = projectId => join(ownerDir(), `${projectId}.json`)

function ownerPid(projectId) {
  try { return JSON.parse(readFileSync(ownerFile(projectId), 'utf8')).pid } catch { return undefined }
}

function alive(pid) {
  if (!pid) return false
  try { process.kill(pid, 0); return true } catch (error) { return error.code !== 'ESRCH' }
}

export async function startStack(stack, { minimal = false, workdir, siteUrl } = {}) {
  if (minimal || stack.projectId.startsWith(testPrefix)) {
    mkdirSync(ownerDir(), { recursive: true })
    const pending = `${ownerFile(stack.projectId)}.${process.pid}.tmp`
    writeFileSync(pending, JSON.stringify({ pid: process.pid }))
    renameSync(pending, ownerFile(stack.projectId))
  }
  const env = { ...process.env, ...stackEnv(stack), ...(siteUrl && { SUPABASE_AUTH_SITE_URL: siteUrl }) }
  const base = ['scripts/supabase.sh', ...(workdir ? ['--workdir', workdir] : [])]
  // Analytics would need one more allocated port per stack and only serves Studio's logs UI.
  const exclude = ['-x', minimal ? 'studio,mailpit,logflare,vector,imgproxy,edge-runtime,supavisor,postgres-meta' : 'logflare,vector']
  await new Promise((done, fail) => {
    const child = spawn('sh', [...base, 'start', ...exclude], { cwd: repoRoot, env, stdio: ['ignore', 2, 'pipe'] })
    let tail = ''
    child.stderr.on('data', chunk => { process.stderr.write(chunk); tail = (tail + chunk).slice(-4000) })
    child.once('error', fail)
    child.once('close', code => code === 0 ? done() : fail(new Error(`supabase start failed (exit ${code}). ${tail}`)))
  })
  const { stdout } = await promisify(execFile)('sh', [...base, 'status', '--output', 'json'], { cwd: repoRoot, env, maxBuffer: 8 * 1024 * 1024 })
  const status = JSON.parse(stdout)
  return { apiUrl: stack.apiUrl, publishableKey: status.PUBLISHABLE_KEY, anonKey: status.ANON_KEY, serviceRoleKey: status.SERVICE_ROLE_KEY }
}

const conflict = /address already in use|port is already allocated/i

// Two launchers can pick the same preferred ports before either binds them; on a bind conflict start over once with fresh ports.
export async function startDevStack(root = repoRoot, { container, start = startStack, remove = id => removeStack(id), ports = freePorts, options } = {}) {
  const stack = await devStack(root, { container })
  try { return { stack, keys: await start(stack, options) } } catch (error) {
    if (!conflict.test(error.message)) throw error
    await remove(stack.projectId)
    const next = saveDev(root, stack.projectId, toPorts(await ports(5)))
    return { stack: next, keys: await start(next, options) }
  }
}

const vanished = /no such|not found|no (container|volume|network) with/i

export async function removeStack(projectId, { container = engine } = {}) {
  const filter = ['--filter', `label=${label}=${projectId}`]
  const ids = async args => lines(await container([...args, '-q', ...filter]))
  const remove = async (args, id) => {
    try { await container([...args, id]) } catch (error) { if (!vanished.test(error.message)) throw error }
  }
  for (const [list, rm] of [[['ps', '-a'], ['rm', '-f']], [['volume', 'ls'], ['volume', 'rm', '-f']], [['network', 'ls'], ['network', 'rm']]]) {
    for (const id of await ids(list)) await remove(rm, id)
    const left = await ids(list)
    if (left.length) throw new Error(`Could not remove ${left.join(', ')} for ${projectId}.`)
  }
  rmSync(ownerFile(projectId), { force: true })
}

async function projectsWithResources(container) {
  const kinds = [[['ps', '-aq'], ['inspect'], 'Config.Labels'], [['volume', 'ls', '-q'], ['volume', 'inspect'], 'Labels'], [['network', 'ls', '-q'], ['network', 'inspect'], 'Labels']]
  const found = new Set()
  for (const [list, inspect, path] of kinds) {
    const ids = lines(await container([...list, '--filter', `label=${label}`]))
    for (const id of ids) {
      try { found.add(await container([...inspect, '--format', `{{index .${path} "${label}"}}`, id])) } catch { /* removed since the listing */ }
    }
  }
  return [...found]
}

export async function reapTestStacks({ container = engine, owner = ownerPid, remove = id => removeStack(id, { container }) } = {}) {
  const removed = []
  for (const projectId of await projectsWithResources(container)) {
    if (!projectId.startsWith(testPrefix) || alive(owner(projectId))) continue
    await remove(projectId)
    removed.push(projectId)
  }
  return removed
}
