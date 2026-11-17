import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import test from 'node:test'
import { assertLocalStack, credentialsDir, currentStack, devProjectId, devStack, reapTestStacks, removeStack, requireStack, startDevStack, startStack, startTestStack, stackEnv } from '../../scripts/lib/stack.mjs'

const stack = { projectId: 'meet-people-x', ports: { api: 1, db: 2, shadow: 3, studio: 4, mail: 5 }, apiUrl: 'http://127.0.0.1:1', dbContainer: 'supabase_db_meet-people-x' }
const tmp = () => mkdtempSync(join(tmpdir(), 'stack-test-'))

const checkout = () => {
  const root = tmp()
  mkdirSync(join(root, '.git'))
  return root
}

test('the first full checkout claims meet-people and keeps it', () => {
  const home = tmp(), first = checkout(), second = checkout()
  assert.equal(devProjectId(first, home), 'meet-people')
  assert.equal(readFileSync(join(home, '.local/share/pebble/main-checkout'), 'utf8'), first)
  assert.equal(statSync(join(home, '.local/share/pebble/main-checkout')).mode & 0o777, 0o600)
  assert.equal(devProjectId(first, home), 'meet-people')
  assert.match(devProjectId(second, home), /^meet-people-co-[a-z0-9-]+-[0-9a-f]{6}$/)
  assert.notEqual(devProjectId(second, home), devProjectId(first, home))
})

test('a full checkout claims meet-people when the recorded one is gone', () => {
  const home = tmp(), gone = checkout(), next = checkout()
  assert.equal(devProjectId(gone, home), 'meet-people')
  rmSync(gone, { recursive: true })
  assert.equal(devProjectId(next, home), 'meet-people')
  assert.equal(readFileSync(join(home, '.local/share/pebble/main-checkout'), 'utf8'), next)
})

test('worktrees get a slugged id with a path hash', () => {
  const home = tmp()
  assert.match(devProjectId('/x/Pebble Friend_UI', home), /^meet-people-wt-pebble-friend-ui-[0-9a-f]{6}$/)
  assert.match(devProjectId(`/x/${'a'.repeat(60)}`, home), new RegExp(`^meet-people-wt-${'a'.repeat(40)}-[0-9a-f]{6}$`))
  assert.notEqual(devProjectId('/x/app', home), devProjectId('/y/app', home))
  assert.equal(devProjectId('/x/app', home), devProjectId('/x/app', home))
})

test('credentialsDir for main and worktree', () => {
  assert.equal(credentialsDir('meet-people', '/h'), '/h/.local/share/pebble')
  assert.equal(credentialsDir('meet-people-foo', '/h'), '/h/.local/share/pebble/meet-people-foo')
})

test('stackEnv exposes ports and identity', () => {
  assert.deepEqual(stackEnv(stack), {
    SUPABASE_PROJECT_ID: 'meet-people-x',
    SUPABASE_API_PORT: '1',
    SUPABASE_DB_PORT: '2',
    SUPABASE_DB_SHADOW_PORT: '3',
    SUPABASE_STUDIO_PORT: '4',
    SUPABASE_LOCAL_SMTP_PORT: '5',
    PEBBLE_SUPABASE_PROJECT_ID: 'meet-people-x',
    PEBBLE_SUPABASE_URL: 'http://127.0.0.1:1',
  })
})

test('reallocates remembered ports that are busy', async () => {
  const root = tmp()
  const busy = createServer()
  await new Promise(resolve => busy.listen(0, '127.0.0.1', resolve))
  const port = busy.address().port
  mkdirSync(join(root, '.pebble'))
  const projectId = devProjectId(root)
  writeFileSync(join(root, '.pebble/dev.json'), JSON.stringify({ projectId, ports: { api: port, db: 1, shadow: 2, studio: 3, mail: 4 } }))
  try {
    const next = await devStack(root, { container: async () => '' })
    assert.equal(next.projectId, projectId)
    assert.equal(new Set(Object.values(next.ports)).size, 5)
    assert.ok(!Object.values(next.ports).includes(port))
    assert.deepEqual(JSON.parse(readFileSync(join(root, '.pebble/dev.json'), 'utf8')), { projectId, ports: next.ports })
    assert.equal(statSync(join(root, '.pebble/dev.json')).mode & 0o777, 0o600)
  } finally { busy.close() }
})

test('reuses recorded ports when the db container is running', async () => {
  const root = tmp()
  const busy = createServer()
  await new Promise(resolve => busy.listen(0, '127.0.0.1', resolve))
  const port = busy.address().port
  mkdirSync(join(root, '.pebble'))
  const ports = { api: port, db: 1, shadow: 2, studio: 3, mail: 4 }
  writeFileSync(join(root, '.pebble/dev.json'), JSON.stringify({ projectId: devProjectId(root), ports }))
  try {
    assert.deepEqual((await devStack(root, { container: async () => 'abc123' })).ports, ports)
  } finally { busy.close() }
})

test('adopts the published ports of a running stack that has no dev.json', async () => {
  const root = tmp()
  const projectId = devProjectId(root)
  const published = { kong: 55001, db: 55002, studio: 55003, inbucket: 55004 }
  const container = async args => {
    if (args[0] === 'ps') return 'abc123'
    const service = /^supabase_(\w+)_/.exec(args[1])[1]
    if (service === 'studio') throw new Error('no such container')
    return `0.0.0.0:${published[service]}\n[::]:${published[service]}`
  }
  const next = await devStack(root, { container })
  assert.equal(next.projectId, projectId)
  assert.deepEqual({ ...next.ports, shadow: 0, studio: 0 }, { api: 55001, db: 55002, shadow: 0, studio: 0, mail: 55004 })
  assert.ok(next.ports.shadow > 0 && next.ports.studio > 0)
  assert.deepEqual(JSON.parse(readFileSync(join(root, '.pebble/dev.json'), 'utf8')).ports, next.ports)
  assert.equal(next.apiUrl, 'http://127.0.0.1:55001')
})

test('published ports win over stale recorded ones', async () => {
  const root = tmp()
  mkdirSync(join(root, '.pebble'))
  writeFileSync(join(root, '.pebble/dev.json'), JSON.stringify({ projectId: devProjectId(root), ports: { api: 1, db: 2, shadow: 3, studio: 4, mail: 5 } }))
  const next = await devStack(root, { container: async args => args[0] === 'ps' ? 'abc' : `0.0.0.0:${{ 8000: 61, 5432: 62, 3000: 64, 8025: 65 }[args[2]]}` })
  assert.deepEqual(next.ports, { api: 61, db: 62, shadow: 3, studio: 64, mail: 65 })
})

const owner = (pid, host = 'here', started = new Date(Date.now() - 1000).toISOString()) => ({ pid, host, started })
const created = ago => JSON.stringify(new Date(Date.now() - ago).toISOString())
const hours = n => n * 3_600_000
// One container per project, labelled and created `ago` ms ago.
const reap = async (projects, owners, extra = {}) => {
  const ids = Object.keys(projects)
  const container = async args => {
    if (args[0] === 'ps') return ids.join('\n')
    if (args[0] === 'inspect') return `${args.at(-1)}\t${created(projects[args.at(-1)])}`
    return ''
  }
  const removed = []
  const result = await reapTestStacks({ container, owner: id => owners[id], remove: async id => { removed.push(id) }, host: 'here', isAlive: pid => pid === 1, ...extra })
  assert.deepEqual(result, removed)
  return removed
}

test('same-host owner: reaped only when its pid is dead', async () => {
  assert.deepEqual(await reap({ 'meet-people-test-a': hours(9), 'meet-people-test-b': 0 }, { 'meet-people-test-a': owner(1), 'meet-people-test-b': owner(999999) }), ['meet-people-test-b'])
})

test('other-host owner: reaped only if the pid looks dead and it started over 6 h ago', async () => {
  const old = owner(999999, 'elsewhere', new Date(Date.now() - hours(7)).toISOString())
  const recent = owner(999999, 'elsewhere', new Date(Date.now() - hours(5)).toISOString())
  const live = owner(1, 'elsewhere', new Date(Date.now() - hours(7)).toISOString())
  assert.deepEqual(await reap({ 'meet-people-test-old': 0, 'meet-people-test-recent': 0, 'meet-people-test-live': 0 }, { 'meet-people-test-old': old, 'meet-people-test-recent': recent, 'meet-people-test-live': live }), ['meet-people-test-old'])
})

test('no owner file: reaped only when the newest container is over 30 minutes old', async () => {
  assert.deepEqual(await reap({ 'meet-people-test-old': 31 * 60_000, 'meet-people-test-new': 5 * 60_000 }, {}), ['meet-people-test-old'])
})

test('unparseable timestamps and owners are never reaped on a guess', async () => {
  const container = async args => args[0] === 'ps' ? 'c1' : args[0] === 'inspect' ? 'meet-people-test-z\t"not a date"' : ''
  assert.deepEqual(await reapTestStacks({ container, owner: () => undefined, remove: async () => assert.fail('reaped') }), [])
  assert.deepEqual(await reap({ 'meet-people-test-q': 0 }, { 'meet-people-test-q': { pid: 999999, host: 'elsewhere' } }), [])
})

test('only test stacks are ever reaped', async () => {
  assert.deepEqual(await reap({ 'meet-people': hours(99), 'comfy-room': hours(99), 'meet-people-wt-test-auth-abc123': hours(99), 'meet-people-test-z': hours(99) }, {}), ['meet-people-test-z'])
})

test('reap tolerates objects removed between listing and inspect', async () => {
  const container = async args => {
    if (args[0] === 'ps') return 'c1\nc2\nc3'
    if (args[0] !== 'inspect') return ''
    const id = args.at(-1)
    if (id === 'c2') throw new Error('no such object')
    return `meet-people-test-${id}\t${created(hours(1))}`
  }
  const removed = []
  assert.deepEqual(await reapTestStacks({ container, owner: () => undefined, remove: async id => { removed.push(id) } }), ['meet-people-test-c1', 'meet-people-test-c3'])
})

const fakeEngine = ({ rmFails = {}, stuck = [] } = {}) => {
  const present = { ps: ['c1'], volume: ['v1'], network: ['n1'] }
  const calls = []
  const container = async args => {
    calls.push(args)
    const kind = ['volume', 'network'].includes(args[0]) ? args[0] : 'ps'
    const action = args.includes('ls') || args[0] === 'ps' ? 'ls' : 'rm'
    if (action === 'ls') return present[kind].join('\n')
    const id = args.at(-1)
    if (rmFails[kind]) { if (!stuck.includes(kind)) present[kind] = present[kind].filter(item => item !== id); throw new Error(rmFails[kind]) }
    present[kind] = present[kind].filter(item => item !== id)
    return id
  }
  return { container, calls }
}

test('removeStack deletes volumes only for test stacks', async () => {
  const test = fakeEngine()
  await removeStack('meet-people-test-a', { container: test.container, home: tmp() })
  assert.ok(test.calls.some(call => call[0] === 'volume' && call[1] === 'rm'))
  for (const id of ['meet-people', 'meet-people-wt-x-abc123', 'meet-people-co-y-abc123']) {
    const dev = fakeEngine()
    await removeStack(id, { container: dev.container, home: tmp() })
    assert.ok(!dev.calls.some(call => call[0] === 'volume'), id)
    assert.ok(dev.calls.some(call => call[0] === 'rm'), 'containers are still removed')
  }
})

test('removeStack refuses volumes: true on anything but a test stack', async () => {
  const { container, calls } = fakeEngine()
  await assert.rejects(removeStack('meet-people', { container, volumes: true }), /Refusing to delete volumes of meet-people/)
  assert.equal(calls.length, 0)
})

test('removing a test stack also deletes its credentials, never the shared directory', async () => {
  const home = tmp()
  const own = credentialsDir('meet-people-test-a', home), shared = credentialsDir('meet-people', home)
  mkdirSync(own, { recursive: true })
  writeFileSync(join(own, 'x'), '1')
  await removeStack('meet-people-test-a', { container: fakeEngine().container, home })
  assert.ok(!existsSync(own))
  assert.ok(existsSync(shared))
})

test('removeStack tolerates objects another reaper already removed', async () => {
  const { container } = fakeEngine({ rmFails: { network: 'Error: no such network: n1' } })
  await removeStack('meet-people-test-a', { container, home: tmp() })
})

test('removeStack still throws when something with the label remains', async () => {
  const { container } = fakeEngine({ rmFails: { network: 'Error: no such network: n1' }, stuck: ['network'] })
  await assert.rejects(removeStack('meet-people-test-a', { container, home: tmp() }), /Could not remove n1/)
})

test('removeStack rethrows unrelated errors', async () => {
  const { container } = fakeEngine({ rmFails: { volume: 'volume is in use' } })
  await assert.rejects(removeStack('meet-people-test-a', { container, home: tmp() }), /in use/)
})

test('assertLocalStack accepts only the stack origin', () => {
  assertLocalStack('http://127.0.0.1:1', stack)
  assertLocalStack('http://127.0.0.1:1/', stack)
  for (const bad of ['http://127.0.0.1:54321', 'http://u:p@127.0.0.1:1', 'http://127.0.0.1:1/rest', 'http://127.0.0.1:1/?a=1', 'http://127.0.0.1:1/#', 'https://127.0.0.1:1', 'nope'])
    assert.throws(() => assertLocalStack(bad, stack), undefined, bad)
})

test('currentStack prefers env, then dev.json, then null', () => {
  const root = tmp()
  assert.equal(currentStack(root, {}), null)
  mkdirSync(join(root, '.pebble'))
  const saved = { projectId: 'meet-people-s', ports: stack.ports }
  writeFileSync(join(root, '.pebble/dev.json'), JSON.stringify(saved))
  assert.equal(currentStack(root, {}).apiUrl, 'http://127.0.0.1:1')
  const fromEnv = currentStack(root, { PEBBLE_SUPABASE_PROJECT_ID: 'meet-people-test-q', PEBBLE_SUPABASE_URL: 'http://127.0.0.1:9' })
  assert.equal(fromEnv.projectId, 'meet-people-test-q')
  assert.equal(fromEnv.apiUrl, 'http://127.0.0.1:9')
})

test('requireStack throws the standard message without a stack', () => {
  assert.throws(() => requireStack(tmp(), {}), /^Error: No local stack for this worktree\. Run pnpm dev first\.$/)
  assert.equal(requireStack(tmp(), { PEBBLE_SUPABASE_PROJECT_ID: 'meet-people-test-q', PEBBLE_SUPABASE_URL: 'http://127.0.0.1:9' }).apiUrl, 'http://127.0.0.1:9')
})

test('a port conflict removes the half-started stack and retries once with fresh ports', async () => {
  const root = tmp()
  const calls = []
  const start = async stack => {
    calls.push(['start', stack.ports.api])
    if (calls.length === 1) throw new Error('supabase start failed (exit 1). rootlessport listen tcp 0.0.0.0:54322: bind: address already in use')
    return { apiUrl: stack.apiUrl }
  }
  const { stack: next } = await startDevStack(root, {
    container: async () => '', start, remove: async id => { calls.push(['remove', id]) }, ports: async count => { calls.push(['ports', count]); return [11, 12, 13, 14, 15] },
  })
  assert.deepEqual(calls.map(call => call[0]), ['start', 'remove', 'ports', 'start'])
  assert.deepEqual(calls[2], ['ports', 5])
  assert.deepEqual(next.ports, { api: 11, db: 12, shadow: 13, studio: 14, mail: 15 })
  assert.deepEqual(JSON.parse(readFileSync(join(root, '.pebble/dev.json'), 'utf8')).ports, next.ports)
})

test('other start failures are not retried', async () => {
  let starts = 0
  await assert.rejects(startDevStack(tmp(), { container: async () => '', start: async () => { starts++; throw new Error('boom') }, remove: async () => assert.fail('removed') }), /boom/)
  assert.equal(starts, 1)
})

const interrupted = async ({ running }) => {
  const controller = new AbortController()
  const calls = []
  const start = (_stack, { signal }) => new Promise((_, fail) => {
    signal.addEventListener('abort', () => { calls.push('killed'); fail(new Error('supabase start failed (exit null)')) })
    setImmediate(() => controller.abort())
  })
  const pending = startDevStack(tmp(), { container: async () => running, start, remove: async id => { calls.push(['remove', id]) }, signal: controller.signal })
  await assert.rejects(pending, error => error === controller.signal.reason)
  return calls
}

test('an interrupt during start removes a stack that was not running before', async () => {
  const calls = await interrupted({ running: '' })
  assert.equal(calls[0], 'killed')
  assert.equal(calls[1][0], 'remove')
  assert.equal(calls.length, 2)
})

test('an interrupt during start leaves a stack that was already running', async () => {
  assert.deepEqual(await interrupted({ running: 'abc123' }), ['killed'])
})

test('startStack kills the CLI on abort and keeps draining its output until it exits', async () => {
  const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill: signal => { child.signal = signal; setImmediate(() => child.emit('close', null)) } })
  const controller = new AbortController()
  const started = startStack(stack, { signal: controller.signal, run: () => child })
  controller.abort()
  await assert.rejects(started, error => error === controller.signal.reason)
  assert.equal(child.signal, 'SIGTERM')
  assert.equal(child.stdout.listenerCount('data'), 1)
  await assert.rejects(startStack(stack, { signal: controller.signal, run: () => assert.fail('spawned') }), error => error === controller.signal.reason)
})

const recordingEngine = () => {
  const calls = []
  const container = async args => { calls.push(args); return '' }
  return { container, calls }
}
const noVolumeRemoval = calls => assert.ok(!calls.some(call => call[0] === 'volume' && call.includes('rm')), 'a volume was removed')

test('dev stack cleanup after a port conflict never touches volumes', async () => {
  const { container, calls } = recordingEngine()
  let starts = 0
  await startDevStack(tmp(), { container, ports: async () => [11, 12, 13, 14, 15], start: async stack => {
    if (!starts++) throw new Error('bind: address already in use')
    return { apiUrl: stack.apiUrl }
  } })
  assert.equal(starts, 2)
  noVolumeRemoval(calls)
})

test('dev stack cleanup after an interrupt never touches volumes', async () => {
  const controller = new AbortController()
  const { container, calls } = recordingEngine()
  const pending = startDevStack(tmp(), { container, signal: controller.signal, start: () => new Promise((_, fail) => { setImmediate(() => { controller.abort(); fail(new Error('killed')) }) }) })
  await assert.rejects(pending, error => error === controller.signal.reason)
  noVolumeRemoval(calls)
})

test('a test stack retries once with fresh ports after a bind conflict, removing it first', async () => {
  const calls = []
  const first = { ...stack, projectId: 'meet-people-test-r', dbContainer: 'supabase_db_meet-people-test-r' }
  const start = async next => {
    calls.push(['start', next.ports.api])
    if (calls.length === 1) throw new Error('supabase start failed. port is already allocated')
    return { apiUrl: next.apiUrl }
  }
  const { stack: next } = await startTestStack(first, { start, remove: async id => { calls.push(['remove', id]) }, ports: async () => [21, 22, 23, 24, 25] })
  assert.deepEqual(calls, [['start', 1], ['remove', 'meet-people-test-r'], ['start', 21]])
  assert.equal(next.projectId, 'meet-people-test-r')
  assert.equal(next.apiUrl, 'http://127.0.0.1:21')
})

test('a test stack does not retry other failures, twice-failing conflicts or interrupts', async () => {
  let starts = 0
  await assert.rejects(startTestStack(stack, { start: async () => { starts++; throw new Error('boom') }, remove: async () => assert.fail('removed') }), /boom/)
  await assert.rejects(startTestStack(stack, { start: async () => { starts++; throw new Error('address already in use') }, remove: async () => {}, ports: async () => [1, 2, 3, 4, 5] }), /already in use/)
  assert.equal(starts, 3)
})
