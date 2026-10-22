import assert from 'node:assert/strict'
import process from 'node:process'
import console from 'node:console'
import { URL } from 'node:url'

const { fetch, AbortSignal } = globalThis

const origin = new URL(process.argv[2] ?? process.env.HOSTED_URL ?? '')
assert.equal(origin.protocol, 'https:', 'Hosted checks require HTTPS.')
for (const path of ['/', '/events', '/login', '/auth/callback', '/reset-password', '/matchmaking']) {
  const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(60000) })
  assert.equal(response.status, 200, `${path} should serve the SPA`)
  assert.match(response.headers.get('content-type') ?? '', /text\/html/)
  const html = await response.text()
  assert.match(html, /id="root"/)
  assert.doesNotMatch(html, /@vite\/client/)
  if (path === '/') {
    const asset = html.match(/src="(\/assets\/[^" ]+\.js)"/)?.[1]
    assert.ok(asset, 'Production JavaScript asset missing')
    const script = await fetch(new URL(asset, origin), { signal: AbortSignal.timeout(60000) })
    assert.equal(script.status, 200)
    assert.match(script.headers.get('cache-control') ?? '', /immutable/)
  }
}
const health = await fetch(new URL('/api/health', origin), { signal: AbortSignal.timeout(60000) })
assert.equal(health.status, 200)
assert.deepEqual(await health.json(), { status: 'ok' })
assert.match(health.headers.get('cache-control') ?? '', /no-store/)
const events = await fetch(new URL('/api/events?limit=1', origin), { signal: AbortSignal.timeout(60000) })
assert.equal(events.status, 200, 'Events must reach the configured database, not just a live process.')
assert.ok(Array.isArray((await events.json()).events))
const account = await fetch(new URL('/api/matchmaking/account', origin), { signal: AbortSignal.timeout(60000) })
assert.equal(account.status, 401, 'Anonymous requests must not read private accounts.')
assert.match(account.headers.get('cache-control') ?? '', /no-store/)
console.info(`Hosted smoke passed: SPA deep links, immutable assets, API/database access and anonymous account denial at ${origin.origin}`)
