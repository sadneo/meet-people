import { spawn, execFile, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir, hostname } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
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

const dataDir = home => join(home, '.local/share/pebble')

// Only the checkout recorded in main-checkout keeps the legacy `meet-people` id and its data; the first full checkout to run claims it.
export function devProjectId(root = repoRoot, home = homedir()) {
  const path = resolve(root)
  const slug = basename(path).toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 40).replace(/^-+|-+$/g, '') || 'checkout'
  const suffix = `${slug}-${createHash('sha1').update(path).digest('hex').slice(0, 6)}`
  let full = false
  try { full = statSync(join(path, '.git')).isDirectory() } catch { /* no .git directory: a linked worktree */ }
  if (!full) return `meet-people-wt-${suffix}`
  const file = join(dataDir(home), 'main-checkout')
  let claimed = ''
  try { claimed = readFileSync(file, 'utf8').trim() } catch { /* nobody has claimed it yet */ }
  if (claimed === path) return 'meet-people'
  if (claimed && existsSync(claimed)) return `meet-people-co-${suffix}`
  mkdirSync(dataDir(home), { recursive: true })
  if (claimed) {
    writeFileSync(`${file}.${process.pid}.tmp`, path, { mode: 0o600 })
    renameSync(`${file}.${process.pid}.tmp`, file)
  } else {
    try { writeFileSync(file, path, { flag: 'wx', mode: 0o600 }) } catch (error) {
      if (error.code !== 'EEXIST') throw error
      return readFileSync(file, 'utf8').trim() === path ? 'meet-people' : `meet-people-co-${suffix}`
    }
  }
  return 'meet-people'
}

export function credentialsDir(projectId, home = homedir()) {
  const base = dataDir(home)
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

const published = { api: ['kong', 8000], db: ['db', 5432], studio: ['studio', 3000], mail: ['inbucket', 8025] }

async function publishedPorts(projectId, container) {
  const found = {}
  for (const [name, [service, inner]] of Object.entries(published)) {
    try {
      const port = /:(\d+)\s*$/m.exec(await container(['port', `supabase_${service}_${projectId}`, String(inner)]))
      if (port) found[name] = Number(port[1])
    } catch { /* not published, e.g. Studio in a minimal stack */ }
  }
  return found
}

async function withFreePorts(known) {
  const missing = names.filter(name => !known[name])
  if (!missing.length) return known
  const fresh = await freePorts(missing.length)
  return Object.fromEntries(names.map(name => [name, known[name] ?? fresh[missing.indexOf(name)]]))
}

export async function devStack(root = repoRoot, { container = engine, home } = {}) {
  const projectId = devProjectId(root, home)
  const dev = readDev(root)
  const saved = dev?.projectId === projectId ? dev.ports : null
  if (await container(['ps', '-q', '--filter', `name=^supabase_db_${projectId}$`])) {
    return saveDev(root, projectId, await withFreePorts({ ...saved, ...await publishedPorts(projectId, container) }))
  }
  const free = saved && (await Promise.all(Object.values(saved).map(isFree))).every(Boolean)
  return saveDev(root, projectId, free ? saved : toPorts(await freePorts(5, preferred)))
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

export function stackKeys(stack) {
  const status = supabaseStatus(stack)
  return { apiUrl: status.API_URL, publishableKey: status.PUBLISHABLE_KEY ?? status.ANON_KEY, serviceRoleKey: status.SERVICE_ROLE_KEY }
}

// Explicit values win over the shell's, which may still point at another checkout's stack.
export const childEnv = (stack, keys) => ({
  ...process.env,
  ...stackEnv(stack),
  SUPABASE_URL: keys.apiUrl,
  VITE_SUPABASE_URL: keys.apiUrl,
  SUPABASE_PUBLISHABLE_KEY: keys.publishableKey,
  VITE_SUPABASE_PUBLISHABLE_KEY: keys.publishableKey,
  SUPABASE_SERVICE_ROLE_KEY: keys.serviceRoleKey,
})

export function assertLocalStack(url, stack) {
  if (new URL(url).href !== `${stack.apiUrl}/`) throw new Error(`Refusing ${url}: not the local stack ${stack.apiUrl}.`)
}

// A fixed per-user location: every agent and shell sees the same owner files whatever its temp dir.
const ownerFile = projectId => join(process.env.XDG_STATE_HOME || join(homedir(), '.local/state'), 'pebble/stacks', `${projectId}.json`)

function readOwner(projectId) {
  try { return JSON.parse(readFileSync(ownerFile(projectId), 'utf8')) } catch { return undefined }
}

function alive(pid) {
  if (!pid) return false
  try { process.kill(pid, 0); return true } catch (error) { return error.code !== 'ESRCH' }
}

export async function startStack(stack, { minimal = false, workdir, siteUrl, signal, run = spawn } = {}) {
  signal?.throwIfAborted()
  if (minimal || stack.projectId.startsWith(testPrefix)) {
    mkdirSync(dirname(ownerFile(stack.projectId)), { recursive: true })
    const pending = `${ownerFile(stack.projectId)}.${process.pid}.tmp`
    writeFileSync(pending, JSON.stringify({ pid: process.pid, host: hostname(), started: new Date().toISOString() }))
    renameSync(pending, ownerFile(stack.projectId))
  }
  const env = { ...process.env, ...stackEnv(stack), ...(siteUrl && { SUPABASE_AUTH_SITE_URL: siteUrl }) }
  const base = ['scripts/supabase.sh', ...(workdir ? ['--workdir', workdir] : [])]
  // Analytics would need one more allocated port per stack and only serves Studio's logs UI.
  // Mailpit stays: Auth sends the sign-up confirmation mail and answers 500 without an SMTP server.
  const exclude = ['-x', minimal ? 'studio,logflare,vector,imgproxy,edge-runtime,supavisor,postgres-meta' : 'logflare,vector']
  await new Promise((done, fail) => {
    const child = run('sh', [...base, 'start', ...exclude], { cwd: repoRoot, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let tail = ''
    // The data listeners keep both pipes drained until the child exits, so it never dies of SIGPIPE mid-cleanup.
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { process.stderr.write(chunk); tail = (tail + chunk).slice(-4000) })
    const abort = () => child.kill('SIGTERM')
    signal?.addEventListener('abort', abort, { once: true })
    child.once('error', fail)
    child.once('close', code => {
      signal?.removeEventListener('abort', abort)
      if (code === 0) done()
      else fail(signal?.aborted ? signal.reason : new Error(`supabase start failed (exit ${code}). ${tail}`))
    })
  })
  const { stdout } = await promisify(execFile)('sh', [...base, 'status', '--output', 'json'], { cwd: repoRoot, env, maxBuffer: 8 * 1024 * 1024 })
  const status = JSON.parse(stdout)
  return { apiUrl: stack.apiUrl, publishableKey: status.PUBLISHABLE_KEY, anonKey: status.ANON_KEY, serviceRoleKey: status.SERVICE_ROLE_KEY }
}

const conflict = /address already in use|port is already allocated/i

// Two launchers can pick the same preferred ports before either binds them; on a bind conflict start over once with fresh ports.
export async function startDevStack(root = repoRoot, { container = engine, start = startStack, remove = id => removeStack(id, { container }), ports = freePorts, options, signal, home } = {}) {
  const wasRunning = await container(['ps', '-q', '--filter', `name=^supabase_db_${devProjectId(root, home)}$`])
  const stack = await devStack(root, { container, home })
  // An interrupted start can leave a half-started stack; only remove one this launch was creating.
  const attempt = async next => {
    try { return { stack: next, keys: await start(next, { ...options, signal }) } } catch (error) {
      if (!signal?.aborted) throw error
      if (!wasRunning) await remove(next.projectId)
      throw signal.reason
    }
  }
  try { return await attempt(stack) } catch (error) {
    if (signal?.aborted || !conflict.test(error.message)) throw error
    await remove(stack.projectId)
    return attempt(saveDev(root, stack.projectId, toPorts(await ports(5))))
  }
}

// Test stacks use fresh ports every run, so a bind conflict just means someone took one between allocation and bind.
export async function startTestStack(stack, { start = startStack, remove = id => removeStack(id), ports = freePorts, options, signal } = {}) {
  try { return { stack, keys: await start(stack, { ...options, signal }) } } catch (error) {
    if (signal?.aborted || !conflict.test(error.message)) throw error
    await remove(stack.projectId)
    const next = makeStack(stack.projectId, toPorts(await ports(5)))
    return { stack: next, keys: await start(next, { ...options, signal }) }
  }
}

const vanished = /no such|not found|no (container|volume|network) with/i

export async function removeStack(projectId, { container = engine, volumes = projectId.startsWith(testPrefix), home = homedir() } = {}) {
  if (volumes && !projectId.startsWith(testPrefix)) throw new Error(`Refusing to delete volumes of ${projectId}: only test stacks are disposable.`)
  const filter = ['--filter', `label=${label}=${projectId}`]
  const ids = async args => lines(await container([...args, '-q', ...filter]))
  const remove = async (args, id) => {
    try { await container([...args, id]) } catch (error) { if (!vanished.test(error.message)) throw error }
  }
  const kinds = [[['ps', '-a'], ['rm', '-f']], ...(volumes ? [[['volume', 'ls'], ['volume', 'rm', '-f']]] : []), [['network', 'ls'], ['network', 'rm']]]
  for (const [list, rm] of kinds) {
    for (const id of await ids(list)) await remove(rm, id)
    const left = await ids(list)
    if (left.length) throw new Error(`Could not remove ${left.join(', ')} for ${projectId}.`)
  }
  if (volumes) rmSync(credentialsDir(projectId, home), { recursive: true, force: true })
  rmSync(ownerFile(projectId), { force: true })
}

// Newest container/network creation time per project; unreadable timestamps count as now so nothing live is reaped on a guess.
async function projectsWithResources(container, now) {
  const created = '{{json .Created}}'
  const kinds = [[['ps', '-aq'], ['inspect'], 'Config.Labels', created], [['volume', 'ls', '-q'], ['volume', 'inspect'], 'Labels'], [['network', 'ls', '-q'], ['network', 'inspect'], 'Labels', created]]
  const found = new Map()
  for (const [list, inspect, path, time] of kinds) {
    for (const id of lines(await container([...list, '--filter', `label=${label}`]))) {
      try {
        const [project, stamp] = (await container([...inspect, '--format', `{{index .${path} "${label}"}}${time ? `\t${time}` : ''}`, id])).split('\t')
        const at = stamp ? Date.parse(JSON.parse(stamp)) : -Infinity
        found.set(project, Math.max(found.get(project) ?? -Infinity, Number.isNaN(at) ? now : at))
      } catch { /* removed since the listing */ }
    }
  }
  return found
}

const minutes = 60_000

// Owned on this host: the pid decides. Owned elsewhere: only a long-dead looking owner is reaped. Unowned: only once nothing has been created for a while.
// shortcut: an agent in its own pid namespace on the same host looks dead here; add a heartbeat if agents run that way.
function orphaned(owner, newest, { now, host, isAlive }) {
  if (!owner) return now - newest > 30 * minutes
  if (owner.host === host) return !isAlive(owner.pid)
  return !isAlive(owner.pid) && now - Date.parse(owner.started) > 360 * minutes
}

export async function reapTestStacks({ container = engine, owner = readOwner, remove = id => removeStack(id, { container }), now = Date.now(), host = hostname(), isAlive = alive } = {}) {
  const removed = []
  for (const [projectId, newest] of await projectsWithResources(container, now)) {
    if (!projectId.startsWith(testPrefix) || !orphaned(owner(projectId), newest, { now, host, isAlive })) continue
    await remove(projectId)
    removed.push(projectId)
  }
  return removed
}
