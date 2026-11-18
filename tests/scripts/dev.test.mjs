import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { androidApiPort, copySecrets, helpText, main, parts } from '../../scripts/dev.mjs'

test('a new worktree gets the main checkout .env without overwriting its own', () => {
  const main = mkdtempSync(join(tmpdir(), 'dev-main-')), worktree = mkdtempSync(join(tmpdir(), 'dev-wt-')), other = mkdtempSync(join(tmpdir(), 'dev-wt-'))
  writeFileSync(join(main, '.env'), 'GOOGLE_CLIENT_ID=main')
  writeFileSync(join(other, '.env'), 'GOOGLE_CLIENT_ID=mine')
  assert.deepEqual(copySecrets(worktree, main), ['.env'])
  assert.equal(readFileSync(join(worktree, '.env'), 'utf8'), 'GOOGLE_CLIENT_ID=main')
  assert.deepEqual(copySecrets(other, main), [])
  assert.equal(readFileSync(join(other, '.env'), 'utf8'), 'GOOGLE_CLIENT_ID=mine')
  assert.deepEqual(copySecrets(main, main), [])
})

const context = { root: '/repo', ports: { web: 3000, mobile: 3002, api: 3001 } }
const find = (list, name) => list.find(part => part.name === name)

test('functions need .env; the worker only needs the running stack', () => {
  const missing = parts({ ...context, engine: true, exists: () => false })
  assert.equal(find(missing, 'functions').ready, false)
  assert.match(find(missing, 'functions').needs, /^\.env/)
  assert.match(find(missing, 'functions').command, /--env-file \.env$/)
  assert.equal(find(missing, 'worker').ready, true)
  assert.equal(find(parts({ ...context, exists: () => true }), 'worker').ready, false)
})

test('web, mobile and API each get their own port', () => {
  const list = parts({ ...context, exists: () => true })
  assert.equal(find(list, 'web').env.VITE_PORT, '3000')
  assert.equal(find(list, 'mobile').env.VITE_PORT, '3002')
  assert.equal(find(list, 'api').env.PORT, '3001')
  assert.deepEqual(list.filter(part => part.required).map(part => part.name), ['supabase', 'web', 'mobile', 'api'])
})

test('the Android dev stack runs no web servers and serves the API on the fixed port', () => {
  const list = parts({ ...context, android: true, ports: { api: androidApiPort }, exists: () => true })
  assert.equal(androidApiPort, 3100)
  assert.deepEqual(list.map(part => part.name), ['supabase', 'api', 'functions', 'worker'])
  assert.equal(find(list, 'api').env.PORT, '3100')
})

test('help lists every part', () => {
  const text = helpText(parts({ root: '/repo' }))
  for (const name of ['supabase', 'web', 'mobile', 'api', 'functions', 'worker', 'dev:mobile']) assert.ok(text.includes(name), name)
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

test('pnpm dev:mobile stops before starting anything when the Android API port is taken', async () => {
  const output = []
  const code = await main(['--android'], { engineReachable: async () => true, portFree: async port => port !== 3100, error: line => output.push(line) })
  assert.equal(code, 1)
  assert.match(output.join('\n'), /3100/)
})
