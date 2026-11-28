import { execFileSync } from 'node:child_process'
import { readFileSync, readlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { styleText } from 'node:util'
import { container, engineCli } from './lib/containers.mjs'
import { alive, readOwner } from './lib/stack.mjs'

const testPrefix = 'meet-people-test-'
const launcherPattern = /^\S*node\s+(?:\S*\/)?scripts\/(dev|test-[a-z]+)\.mjs\b(.*)$/
const partNames = [[/functions serve/, 'functions'], [/supabase\.(sh|js)\b/, 'supabase cli'], [/vite\.mobile\.config/, 'mobile'],
  [/vite\.js build/, 'build'], [/vite\.js/, 'web'], [/api\/server\.ts/, 'api'], [/api\/server\.js/, 'built api'],
  [/run-local-event-groups/, 'worker'], [/run-remote-messaging/, 'remote'], [/playwright/, 'playwright'], [/typescript\/bin\/tsc|\btsc\b/, 'tsc']]
const appParts = new Set(['web', 'mobile', 'api', 'worker', 'functions'])

function launcherName(args) {
  const match = launcherPattern.exec(args)
  if (!match || /--(status|check|help)\b/.test(match[2])) return null
  if (match[1] !== 'dev') return `pnpm ${match[1].replace('-', ':')}`
  return match[2].includes('--android') ? 'pnpm dev:mobile' : match[2].includes('--remote') ? 'pnpm dev --remote' : 'pnpm dev'
}

const partName = args => partNames.find(([pattern]) => pattern.test(args))?.[1] ?? basename(args.split(/\s+/)[1] ?? args.split(/\s+/)[0])

export function group({ procs, containers, worktrees, owners = {}, isAlive = () => false, engine = 'podman' }) {
  const byPid = new Map(procs.map(proc => [proc.pid, proc]))
  const children = new Map()
  for (const proc of procs) children.set(proc.ppid, [...(children.get(proc.ppid) ?? []), proc])
  const subtree = proc => [proc, ...(children.get(proc.pid) ?? []).flatMap(subtree)]
  const worktreeOf = path => path && worktrees.filter(tree => path === tree.path || path.startsWith(`${tree.path}/`)).sort((a, b) => b.path.length - a.path.length)[0]
  const outermost = proc => {
    let found = null
    for (let at = proc, hops = 0; at && hops < 64; at = byPid.get(at.ppid), hops++) if (launcherName(at.args)) found = at
    return found
  }
  const launchers = procs.filter(proc => launcherName(proc.args) && outermost(proc) === proc).map(proc => ({
    pid: proc.pid, name: launcherName(proc.args), age: proc.age, worktree: worktreeOf(proc.cwd),
    parts: (children.get(proc.pid) ?? []).map(child => {
      const all = subtree(child)
      return { name: partName(child.args), pid: child.pid, port: child.env?.PORT ?? child.env?.VITE_PORT, rss: all.reduce((sum, each) => sum + each.rss, 0) }
    }),
  }))

  const leftovers = []
  const candidate = proc => !outermost(proc) && worktreeOf(proc.cwd) && appParts.has(partName(proc.args))
  for (const proc of procs) {
    if (candidate(proc) && !(byPid.get(proc.ppid) && candidate(byPid.get(proc.ppid)))) {
      leftovers.push({ label: `${partName(proc.args)} pid ${proc.pid}`, detail: `${proc.cwd}  its launcher is gone`, hint: `kill ${proc.pid}` })
    }
  }

  const tests = launchers.filter(launcher => launcher.name.startsWith('pnpm test')).map(launcher => ({ ...launcher, stacks: [] }))
  const trees = worktrees.map(tree => ({ ...tree, stack: null, launchers: launchers.filter(launcher => !launcher.name.startsWith('pnpm test') && launcher.worktree === tree) }))
  for (const stack of containers ?? []) {
    if (stack.project.startsWith(testPrefix)) {
      const owner = owners[stack.project]
      const run = owner && isAlive(owner.pid) && (tests.find(test => test.pid === owner.pid) ?? tests[tests.push({ pid: owner.pid, name: 'test run', parts: [], stacks: [] }) - 1])
      if (run) run.stacks.push(stack)
      else leftovers.push({ label: stack.project, detail: `${stack.count} containers, ${owner ? `owner pid ${owner.pid} is gone` : 'no owner recorded'}`, hint: 'the next pnpm test:integration removes it' })
      continue
    }
    const tree = trees.find(each => each.projectId === stack.project)
    if (tree) tree.stack = stack
    else leftovers.push({ label: stack.project, detail: `${stack.count} containers, no worktree uses it`, hint: `${engine} rm -f $(${engine} ps -aq --filter label=com.supabase.cli.project=${stack.project})` })
  }
  return { worktrees: trees.filter(tree => tree.stack || tree.launchers.length), tests, leftovers, containers: containers !== null }
}

const age = seconds => seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.floor(seconds / 60)}m`
  : seconds < 86400 ? `${Math.floor(seconds / 3600)}h${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}m` : `${Math.floor(seconds / 86400)}d${Math.floor(seconds / 3600) % 24}h`
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

export function render(model, { home = homedir(), paint = (_style, text) => text } = {}) {
  const out = ['Pebble processes on this machine (read-only)', '']
  const launcherLines = launcher => [
    `  ${launcher.name.padEnd(22)}pid ${String(launcher.pid).padEnd(9)}${launcher.age === undefined ? '' : `up ${age(launcher.age)}`}`.trimEnd(),
    ...launcher.parts.map(part => `    ${part.name.padEnd(12)}pid ${String(part.pid).padEnd(9)}${(part.port ? `:${part.port}` : '').padEnd(8)}${String(Math.round(part.rss / 1024)).padStart(6)} MB`),
  ]
  const stackLine = (stack, ports) => `  ${'supabase'.padEnd(22)}${plural(stack.count, 'container')}, up ${stack.since}` +
    (ports ? `   api :${ports.api}  db :${ports.db}  studio :${ports.studio}` : '')
  for (const tree of model.worktrees) {
    out.push(`${paint('green', '●')} ${paint('bold', tree.branch ?? basename(tree.path))}  ${paint('dim', tree.path)}  ${paint('dim', tree.projectId ?? '')}`)
    out.push(...tree.launchers.flatMap(launcherLines))
    if (!tree.launchers.length) out.push(paint('dim', '  app not running'))
    if (tree.stack) out.push(stackLine(tree.stack, tree.ports))
    out.push('')
  }
  for (const test of model.tests) {
    out.push(`${paint('cyan', '◆')} ${paint('bold', 'test run')}  ${test.worktree ? paint('dim', test.worktree.path) : ''}`)
    out.push(...launcherLines(test))
    for (const stack of test.stacks) out.push(`${stackLine(stack)}   ${paint('dim', stack.project)}`)
    out.push('')
  }
  if (model.leftovers.length) {
    out.push(`${paint('yellow', '!')} ${paint('bold', 'leftovers')}`)
    for (const left of model.leftovers) out.push(`  ${left.label}  ${left.detail}`, `    ${paint('dim', `→ ${left.hint}`)}`)
    out.push('')
  }
  if (!model.containers) out.push(paint('yellow', 'Container engine not reachable; stacks are not shown.'), '')
  const dev = model.worktrees.filter(tree => tree.stack)
  const devContainers = dev.reduce((sum, tree) => sum + tree.stack.count, 0)
  const apps = [...model.worktrees.flatMap(tree => tree.launchers), ...model.tests].reduce((sum, launcher) => sum + launcher.parts.length, 0)
  out.push(`${plural(dev.length, 'dev stack')} (${plural(devContainers, 'container')}) · ${apps} app process${apps === 1 ? '' : 'es'}` +
    ` · ${plural(model.tests.length, 'test run')} · ${plural(model.leftovers.length, 'leftover')}`)
  return out.join('\n').replaceAll(`${home}/`, '~/')
}

const read = (path, fallback) => { try { return readFileSync(path, 'utf8') } catch { return fallback } }

function worktreeList(root) {
  const trees = []
  for (const line of execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: root, encoding: 'utf8' }).split('\n')) {
    if (line.startsWith('worktree ')) trees.push({ path: line.slice(9) })
    else if (line.startsWith('branch ')) trees.at(-1).branch = line.slice(7).replace('refs/heads/', '')
  }
  for (const tree of trees) {
    const dev = JSON.parse(read(join(tree.path, '.pebble/dev.json'), 'null'))
    if (dev) Object.assign(tree, { projectId: dev.projectId, ports: dev.ports })
  }
  return trees
}

async function runningStacks() {
  let listing
  try {
    listing = await container(['ps', '--filter', 'label=com.supabase.cli.project', '--format', '{{.Label "com.supabase.cli.project"}}\t{{.State}}\t{{.RunningFor}}'])
  } catch { return null }
  const stacks = new Map()
  for (const [project, state, since] of listing.split('\n').filter(Boolean).map(line => line.split('\t'))) {
    if (!project.startsWith('meet-people') || state !== 'running') continue
    const stack = stacks.get(project) ?? { project, count: 0, since: since.replace(/ ago$/, '') }
    stack.count++
    stacks.set(project, stack)
  }
  return [...stacks.values()]
}

function processes() {
  return execFileSync('ps', ['-u', String(process.getuid()), '-o', 'pid=,ppid=,rss=,etimes=,args='], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
    .split('\n').filter(Boolean).map(line => {
      const [pid, ppid, rss, etimes, ...args] = line.trim().split(/\s+/)
      const proc = { pid: Number(pid), ppid: Number(ppid), rss: Number(rss), age: Number(etimes), args: args.join(' ') }
      if (!/node|supabase|playwright/.test(proc.args) || proc.pid === process.pid) return proc
      try { proc.cwd = readlinkSync(`/proc/${pid}/cwd`) } catch { /* exited since ps */ }
      proc.env = Object.fromEntries(read(`/proc/${pid}/environ`, '').split('\0').map(entry => entry.split('=')).filter(([key]) => key === 'PORT' || key === 'VITE_PORT'))
      return proc
    })
}

export async function main(root, { log = console.log } = {}) {
  const containers = await runningStacks()
  const owners = Object.fromEntries((containers ?? []).filter(stack => stack.project.startsWith(testPrefix)).map(stack => [stack.project, readOwner(stack.project)]))
  const model = group({ procs: processes(), containers, worktrees: worktreeList(root), owners, isAlive: alive, engine: await engineCli() })
  log(render(model, { paint: (style, text) => styleText(style, text, { stream: process.stdout }) }))
  return 0
}
