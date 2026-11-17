import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import test from 'node:test'
import { assertLocalStack, credentialsDir, currentStack, devProjectId, devStack, reapTestStacks, removeStack, requireStack, startDevStack, startStack, stackEnv } from '../../scripts/lib/stack.mjs'

const stack = { projectId: 'meet-people-x', ports: { api: 1, db: 2, shadow: 3, studio: 4, mail: 5 }, apiUrl: 'http://127.0.0.1:1', dbContainer: 'supabase_db_meet-people-x' }
const tmp = () => mkdtempSync(join(tmpdir(), 'stack-test-'))

test('main checkout keeps meet-people', () => {
  const root = tmp()
  mkdirSync(join(root, '.git'))
  assert.equal(devProjectId(root), 'meet-people')
})

test('worktree gets slugged id', () => {
  assert.equal(devProjectId('/x/Pebble Friend_UI'), 'meet-people-wt-pebble-friend-ui')
  assert.equal(devProjectId(`/x/${'a'.repeat(60)}`), `meet-people-wt-${'a'.repeat(40)}`)
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

test('reaps stacks whose owner pid is gone', async () => {
  const calls = []
  const labels = { c1: 'meet-people-test-a', c2: 'meet-people-test-b', c3: 'meet-people' }
  const owners = { 'meet-people-test-a': process.pid, 'meet-people-test-b': 999999 }
  const container = async args => {
    calls.push(args)
    if (args[0] === 'ps') return 'c1\nc2\nc3'
    if (args[0] === 'inspect') return labels[args.at(-1)]
    return ''
  }
  const removed = await reapTestStacks({ container, owner: id => owners[id], remove: async id => { calls.push(['remove', id]) } })
  assert.deepEqual(removed, ['meet-people-test-b'])
  assert.deepEqual(calls.filter(call => call[0] === 'remove'), [['remove', 'meet-people-test-b']])
})

test('reaps test stacks with no owner file but never other stacks', async () => {
  const container = async args => args[0] === 'ps' ? 'c1\nc2' : args[0] === 'inspect' ? { c1: 'meet-people-test-z', c2: 'comfy-room' }[args.at(-1)] : ''
  const gone = []
  assert.deepEqual(await reapTestStacks({ container, owner: () => undefined, remove: async id => { gone.push(id) } }), ['meet-people-test-z'])
  assert.deepEqual(gone, ['meet-people-test-z'])
})

test('a worktree named test-auth is a dev stack the reaper ignores', async () => {
  const projectId = devProjectId('/x/test-auth')
  assert.equal(projectId, 'meet-people-wt-test-auth')
  const container = async args => args[0] === 'ps' ? 'c1' : args[0] === 'inspect' ? projectId : ''
  assert.deepEqual(await reapTestStacks({ container, owner: () => undefined, remove: async () => { assert.fail('reaped a dev stack') } }), [])
})

test('reap tolerates objects removed between listing and inspect', async () => {
  const labels = { c1: 'meet-people-test-a', c3: 'meet-people-test-c' }
  const container = async args => {
    if (args[0] === 'ps') return 'c1\nc2\nc3'
    if (args[0] !== 'inspect') return ''
    const id = args.at(-1)
    if (!labels[id]) throw new Error('no such object')
    return labels[id]
  }
  const removed = []
  assert.deepEqual(await reapTestStacks({ container, owner: () => undefined, remove: async id => { removed.push(id) } }), ['meet-people-test-a', 'meet-people-test-c'])
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

test('removeStack tolerates objects another reaper already removed', async () => {
  const { container } = fakeEngine({ rmFails: { network: 'Error: no such network: n1' } })
  await removeStack('meet-people-test-a', { container })
})

test('removeStack still throws when something with the label remains', async () => {
  const { container } = fakeEngine({ rmFails: { network: 'Error: no such network: n1' }, stuck: ['network'] })
  await assert.rejects(removeStack('meet-people-test-a', { container }), /Could not remove n1/)
})

test('removeStack rethrows unrelated errors', async () => {
  const { container } = fakeEngine({ rmFails: { volume: 'volume is in use' } })
  await assert.rejects(removeStack('meet-people-test-a', { container }), /in use/)
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
