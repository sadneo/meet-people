import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'
import { waitForRun } from '../../scripts/lib/wait.mjs'

async function serve(handler) {
  const server = createServer(handler)
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise(done => { server.close(done); server.closeAllConnections() }) }
}

test('resolves when a JSON run field matches', async () => {
  const server = await serve((_request, response) => response.end(JSON.stringify({ status: 'ok', run: 'mine' })))
  try { await waitForRun(server.url, 'mine', { timeoutMs: 2000 }) } finally { await server.close() }
})

test('resolves when a plain text body matches', async () => {
  const server = await serve((_request, response) => response.end('mine'))
  try { await waitForRun(server.url, 'mine', { timeoutMs: 2000 }) } finally { await server.close() }
})

test('accepts a plain text run id that parses as JSON', async () => {
  for (const id of ['12345678', '12e45678', 'null', 'true']) {
    const server = await serve((_request, response) => response.end(id))
    try { await waitForRun(server.url, id, { timeoutMs: 2000 }) } finally { await server.close() }
  }
})

test('rejects immediately on a different run id', async () => {
  const server = await serve((_request, response) => response.end('other'))
  try {
    const started = Date.now()
    await assert.rejects(waitForRun(server.url, 'mine', { timeoutMs: 5000 }), /Another server/)
    assert.ok(Date.now() - started < 2000)
  } finally { await server.close() }
})

test('keeps polling while the id is empty, then times out', async () => {
  let hits = 0
  const server = await serve((_request, response) => { hits++; response.end('') })
  try {
    await assert.rejects(waitForRun(server.url, 'mine', { timeoutMs: 800 }), /Timed out/)
    assert.ok(hits > 1)
  } finally { await server.close() }
})

test('keeps polling through a refused connection until the server appears', async () => {
  const probe = await serve((_request, response) => response.end(''))
  const port = new URL(probe.url).port
  await probe.close()
  const wait = waitForRun(`http://127.0.0.1:${port}/`, 'mine', { timeoutMs: 5000 })
  await new Promise(done => setTimeout(done, 600))
  const server = createServer((_request, response) => response.end('mine'))
  await new Promise(done => server.listen(Number(port), '127.0.0.1', done))
  try { await wait } finally { await new Promise(done => { server.close(done); server.closeAllConnections() }) }
})
