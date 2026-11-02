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
    if (process.env.HOSTED_PRODUCT) {
      assert.ok(['web', 'mobile'].includes(process.env.HOSTED_PRODUCT), 'Choose web or mobile')
      const infoResponse = await fetch(new URL('/build-info.json', origin), { signal: AbortSignal.timeout(60000) })
      assert.equal(infoResponse.status, 200, 'Release build identity missing')
      const info = await infoResponse.json()
      assert.equal(info.product, process.env.HOSTED_PRODUCT, 'Wrong product deployed to this domain')
      assert.equal(info.branch, process.env.VITE_BUILD_BRANCH, 'Wrong source branch')
      assert.equal(info.sha, process.env.RELEASE_SHA, 'Wrong release commit')
      assert.equal(info.supabaseUrl, process.env.VITE_SUPABASE_URL, 'Wrong backend configuration')
      const javascript = await script.text()
      assert.ok(javascript.includes(info.supabaseUrl), 'JavaScript must use the declared Supabase project')
      assert.equal(javascript.includes('Continue with email'), info.product === 'mobile', 'Wrong frontend entry point')
    }
  }
}
const health = await fetch(new URL('/api/health', origin), { signal: AbortSignal.timeout(60000) })
assert.equal(health.status, 200)
assert.deepEqual(await health.json(), { status: 'ok' })
assert.match(health.headers.get('cache-control') ?? '', /no-store/)
const lookup = await fetch(new URL('/api/auth/email', origin), {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'pebble-release-check@example.com' }),
  signal: AbortSignal.timeout(60000),
})
assert.equal(lookup.status, 200, 'Email lookup must reach the hosted authentication database.')
assert.equal(typeof (await lookup.json()).exists, 'boolean')
const events = await fetch(new URL('/api/events?limit=1', origin), { signal: AbortSignal.timeout(60000) })
assert.equal(events.status, 200, 'Events must reach the configured database, not just a live process.')
assert.ok(Array.isArray((await events.json()).events))
const account = await fetch(new URL('/api/matchmaking/account', origin), { signal: AbortSignal.timeout(60000) })
assert.equal(account.status, 401, 'Anonymous requests must not read private accounts.')
assert.match(account.headers.get('cache-control') ?? '', /no-store/)
console.info(`Hosted smoke passed: SPA deep links, immutable assets, email lookup, API/database access and anonymous account denial at ${origin.origin}`)
