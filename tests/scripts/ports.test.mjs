import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import test from 'node:test'
import { freePorts } from '../../scripts/lib/ports.mjs'

test('returns distinct ports', async () => {
  const ports = await freePorts(8)
  assert.equal(new Set(ports).size, 8)
  for (const port of ports) assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535)
})

test('uses preferred ports when free', async () => {
  const [port] = await freePorts(1)
  assert.equal((await freePorts(2, [port]))[0], port)
})

test('skips busy preferred ports', async () => {
  const [port] = await freePorts(1)
  const server = createServer()
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve))
  try { assert.notEqual((await freePorts(1, [port]))[0], port) }
  finally { await new Promise(resolve => server.close(resolve)) }
})
