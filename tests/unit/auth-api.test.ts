// @vitest-environment node
import express from 'express'
import { createClient } from '@supabase/supabase-js'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { createAuthRouter } from '../../api/auth.js'

const databaseFetch = vi.fn(async () => new Response('true', { headers: { 'Content-Type': 'application/json' } }))
const client = createClient('http://database.test', 'server-only-key', { global: { fetch: databaseFetch }, auth: { persistSession: false, autoRefreshToken: false } })
const app = express()
app.use(express.json())
app.use('/api/auth', createAuthRouter(client))
app.use('/limited', createAuthRouter(client))
app.use('/unconfigured', createAuthRouter(null))
const server = app.listen(0, '127.0.0.1')
let url: string
beforeAll(async () => {
  if (!server.listening) await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject) })
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())))
function post(path = '/api/auth/email', body: unknown = { email: 'Student@Example.test' }, headers = {}) {
  return fetch(`${url}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })
}
it('uses an exact email RPC, returns only a boolean, and prevents caching', async () => {
  const response = await post()
  expect(await response.json()).toEqual({ exists: true })
  expect(response.headers.get('cache-control')).toBe('no-store')
  const [input, init] = databaseFetch.mock.calls[0] as unknown as [string, RequestInit]
  expect(String(input)).toBe('http://database.test/rest/v1/rpc/auth_email_exists')
  expect(JSON.parse(String(init.body))).toEqual({ email_in: 'student@example.test' })
  databaseFetch.mockResolvedValueOnce(new Response('false'))
  expect(await (await post()).json()).toEqual({ exists: false })
})
it('rejects invalid/oversized input, extra fields, and cross-site requests before lookup', async () => {
  const count = databaseFetch.mock.calls.length
  for (const body of [{ email: 'bad' }, { email: `${'x'.repeat(255)}@example.test` }, { email: 'a@example.test', admin: true }]) {
    expect((await post('/api/auth/email', body)).status).toBe(400)
  }
  expect((await post('/api/auth/email', undefined, { 'sec-fetch-site': 'cross-site' })).status).toBe(403)
  expect(databaseFetch.mock.calls.length).toBe(count)
})
it('fails closed on provider errors and missing configuration', async () => {
  databaseFetch.mockResolvedValueOnce(new Response(JSON.stringify({ code: 'secret', message: 'private database details' }), { status: 403 }))
  const response = await post()
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain('private database details')
  expect((await post('/unconfigured/email')).status).toBe(503)
})
it('limits automated enumeration and cannot be bypassed with forwarded addresses', async () => {
  for (let i = 0; i < 10; i++) expect((await post('/limited/email', undefined, { 'X-Forwarded-For': `192.0.2.${i}` })).status).toBe(200)
  const count = databaseFetch.mock.calls.length
  const response = await post('/limited/email', undefined, { 'X-Forwarded-For': '198.51.100.1' })
  expect(response.status).toBe(429)
  expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0)
  expect(databaseFetch.mock.calls.length).toBe(count)
})
