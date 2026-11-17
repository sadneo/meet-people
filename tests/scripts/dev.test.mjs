import assert from 'node:assert/strict'
import { test } from 'node:test'
import { helpText, main, parts } from '../../scripts/dev.mjs'

const context = { root: '/repo', ports: { web: 3000, mobile: 3002, api: 3001 } }
const find = (list, name) => list.find(part => part.name === name)

test('functions need supabase/.env; the worker only needs the running stack', () => {
  const missing = parts({ ...context, engine: true, exists: () => false })
  assert.equal(find(missing, 'functions').ready, false)
  assert.match(find(missing, 'functions').needs, /supabase\/\.env/)
  assert.equal(find(missing, 'worker').ready, true)
  assert.equal(find(parts({ ...context, exists: () => true }), 'worker').ready, false)
})

test('web, mobile and API each get their own port', () => {
  const list = parts({ ...context, exists: () => true })
  assert.equal(find(list, 'web').env.VITE_PORT, '3000')
  assert.equal(find(list, 'mobile').env.VITE_PORT, '3002')
  assert.equal(find(list, 'api').env.PORT, '3001')
  assert.deepEqual(list.filter(part => part.required).map(part => part.name), ['supabase', 'env', 'web', 'mobile', 'api'])
})

test('help lists every part', () => {
  const text = helpText(parts({ root: '/repo' }))
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
