import assert from 'node:assert/strict'
import { test } from 'node:test'
import { helpText, main, parts } from '../../scripts/dev.mjs'

const context = { root: '/repo', projectId: 'meet-people-wt-x', home: '/home/me', ports: { web: 3000, mobile: 3002, api: 3001 } }
const find = (list, name) => list.find(part => part.name === name)

test('functions need supabase/.env and the worker needs this stack\'s credentials', () => {
  const missing = parts({ ...context, exists: () => false })
  assert.equal(find(missing, 'functions').ready, false)
  assert.match(find(missing, 'functions').needs, /supabase\/\.env/)
  assert.equal(find(missing, 'worker').ready, false)
  assert.match(find(missing, 'worker').needs, /meet-people-wt-x\/event-group-worker\.json/)
  const present = parts({ ...context, exists: path => path.endsWith('event-group-worker.json') })
  assert.equal(find(present, 'worker').ready, true)
  assert.equal(find(present, 'functions').ready, false)
})

test('web, mobile and API each get their own port', () => {
  const list = parts({ ...context, exists: () => true })
  assert.equal(find(list, 'web').env.VITE_PORT, '3000')
  assert.equal(find(list, 'mobile').env.VITE_PORT, '3002')
  assert.equal(find(list, 'api').env.PORT, '3001')
  assert.deepEqual(list.filter(part => part.required).map(part => part.name), ['supabase', 'env', 'web', 'mobile', 'api'])
})

test('help lists every part', () => {
  const text = helpText(parts({ root: '/repo', projectId: 'p' }))
  for (const name of ['supabase', 'env', 'web', 'mobile', 'api', 'functions', 'worker']) assert.ok(text.includes(name), name)
})

test('--help exits 0 without touching the engine', async () => {
  const output = []
  const code = await main(['--help'], { engineReachable: () => assert.fail('engine touched'), log: line => output.push(line) })
  assert.equal(code, 0)
  assert.match(output.join('\n'), /functions/)
})

test('no container engine stops with what to start', async () => {
  const output = []
  const code = await main([], { engineReachable: async () => false, error: line => output.push(line) })
  assert.equal(code, 1)
  assert.match(output.join('\n'), /podman\.socket/)
})
