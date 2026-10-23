// @vitest-environment node
import type { AddressInfo } from 'node:net'
import { afterEach, expect, it, vi } from 'vitest'

// Each test loads a fresh app so limiter counts and proxy settings start clean.
async function start(env: Record<string, string> = {}) {
  vi.resetModules()
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
  const { app } = await import('../api/index.js')
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const statuses = async (count: number, path: string, headers: (n: number) => Record<string, string> = () => ({})) => {
    const results: number[] = []
    for (let n = 0; n < count; n++) results.push((await fetch(`${url}${path}`, { headers: headers(n) })).status)
    return results
  }
  return { statuses, close: () => new Promise<void>(resolve => server.close(() => resolve())) }
}
let close: (() => Promise<void>) | undefined
afterEach(async () => { await close?.(); close = undefined; vi.unstubAllEnvs() })

it('caps every API route per address but never limits health checks', async () => {
  const app = await start(); close = app.close
  const hello = await app.statuses(601, '/api/hello')
  expect(hello.slice(0, 600).every(status => status === 200)).toBe(true)
  expect(hello[600]).toBe(429)
  expect(await app.statuses(3, '/api/health')).toEqual([200, 200, 200])
})

it('allows 300 event reads per address in 15 minutes', async () => {
  const app = await start(); close = app.close
  const events = await app.statuses(301, '/api/events')
  expect(events.slice(0, 300)).not.toContain(429)
  expect(events[300]).toBe(429)
})

it('ignores X-Forwarded-For when no proxy is trusted, so callers cannot pick a fresh address', async () => {
  const app = await start(); close = app.close
  await app.statuses(300, '/api/events')
  expect(await app.statuses(5, '/api/events', n => ({ 'X-Forwarded-For': `203.0.113.${n}` }))).toEqual([429, 429, 429, 429, 429])
})

it('keys on the client address the trusted proxies appended, not one the caller supplied', async () => {
  const app = await start({ TRUST_PROXY_HOPS: '2' }); close = app.close
  // Firebase appends the real client; Google's front end appends the edge address.
  const viaProxies = (client: string) => (n: number) => ({ 'X-Forwarded-For': `198.51.100.${n % 250}, ${client}, 35.191.0.1` })
  await app.statuses(300, '/api/events', viaProxies('192.0.2.10'))
  expect(await app.statuses(1, '/api/events', viaProxies('192.0.2.10'))).toEqual([429])
  expect(await app.statuses(1, '/api/events', viaProxies('192.0.2.11'))).not.toContain(429)
})
