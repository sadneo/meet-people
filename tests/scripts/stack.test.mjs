import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { assertLocalStack, credentialsDir, currentStack, devProjectId, devStack, reapTestStacks, stackEnv } from '../../scripts/lib/stack.mjs'

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
    SUPABASE_INBUCKET_PORT: '5',
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
