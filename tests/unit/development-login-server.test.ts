// @vitest-environment node
import { Readable } from 'node:stream'
import { constants } from 'node:fs'
import { accountFixture } from './complete-profile-fixture'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { beforeEach, expect, it, vi } from 'vitest'
import { developmentLoginEnabled, developmentLoginPlugin, developmentLoginHandler, authenticateDevelopmentAccount, parseDevelopmentCredentials, readDevelopmentCredentials } from '../../dev/development-login'

const files = vi.hoisted(() => ({ open: vi.fn() }))
vi.mock('node:fs/promises', () => files)
beforeEach(() => { files.open.mockReset().mockRejectedValue(new Error('Synthetic missing file')) })

const credentials = { accountId: 'a0000000-0000-4000-8000-000000000001', email: 'fixture@example.test', password: 'Synthetic-only-password-1!', url: 'http://127.0.0.1:54321', publicKey: 'sb_publishable_fixture' }
const session = { access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', expires_in: 3600, token_type: 'bearer', user: { id: credentials.accountId } }
async function request(overrides: { method?: string; origin?: string; host?: string; remote?: string; body?: string; type?: string } = {}) {
  const req = Readable.from([overrides.body ?? '{"intent":"development-sign-in"}']) as IncomingMessage
  Object.assign(req, { url: '/__dev/login', method: overrides.method ?? 'POST', headers: { host: overrides.host ?? '127.0.0.1:3000', origin: overrides.origin ?? 'http://127.0.0.1:3000', 'content-type': overrides.type ?? 'application/json' }, socket: { remoteAddress: overrides.remote ?? '127.0.0.1', localAddress: '127.0.0.1' } })
  const headers: Record<string, string> = {}
  let body = '', status = 0
  const res = { setHeader: (key: string, value: string) => { headers[key] = value }, end: (value: string) => { body = value }, set statusCode(value: number) { status = value } } as ServerResponse
  const authenticate = vi.fn(async () => session)
  await developmentLoginHandler('http://127.0.0.1:3000', authenticate)(req, res, vi.fn())
  return { status, body, headers, authenticate }
}
it('one explicit same-origin loopback POST returns only verified session with no-store, no CORS', async () => {
  const result = await request()
  expect(result.status).toBe(200); expect(JSON.parse(result.body)).toEqual({ session })
  expect(result.headers['Cache-Control']).toBe('no-store')
  expect(result.headers['Access-Control-Allow-Origin']).toBeUndefined()
})
it.each([{ method: 'GET' }, { origin: '' }, { origin: 'http://evil.test' }, { origin: 'null' }, { origin: 'http://127.0.0.1:3001' }, { host: 'evil.test:3000' }, { remote: '192.168.1.2' }, { body: '{}' }, { body: '{"intent":"development-sign-in","email":"attacker"}' }, { type: 'text/plain' }, { body: 'x'.repeat(1025) }])('rejects CSRF/method/remote/intent before credential access: %j', async overrides => {
  const result = await request(overrides)
  expect(result.status).not.toBe(200); expect(result.authenticate).not.toHaveBeenCalled()
})
it('plugin never registers a production, preview or nonloopback handler', () => {
  expect(developmentLoginEnabled('serve', 'production')).toBe(false)
  expect(developmentLoginEnabled('build', 'development')).toBe(false)
  expect(developmentLoginEnabled('serve', 'development')).toBe(true)
})
it.each([{ mode: 'production', isProduction: true, host: '127.0.0.1' }, { mode: 'development', isProduction: true, host: '127.0.0.1' }, { mode: 'development', isProduction: false, host: '0.0.0.0' }])('configureServer cannot register on unsafe resolved config %j', config => {
  const use = vi.fn()
  const plugin = developmentLoginPlugin()
  const hook = plugin.configureServer as (server: unknown) => void
  hook({ config: { ...config, server: { host: config.host, strictPort: true, port: 3000 } }, middlewares: { use } })
  expect(use).not.toHaveBeenCalled(); expect(files.open).not.toHaveBeenCalled()
})
it('fake credential file enforces owner-only permissions, fixed path, bounded read and close', async () => {
  const text = JSON.stringify(credentials)
  const close = vi.fn()
  const read = vi.fn(async (buffer: Buffer) => { buffer.write(text); return { bytesRead: Buffer.byteLength(text) } })
  files.open.mockResolvedValue({ stat: async () => ({ isFile: () => true, uid: process.getuid!(), mode: 0o100600, size: text.length }), read, close })
  expect(await readDevelopmentCredentials()).toEqual(credentials)
  expect(files.open.mock.calls[0][0]).toMatch(/\/\.local\/share\/pebble\/development-account\.json$/)
  expect(files.open.mock.calls[0][1] & constants.O_NOFOLLOW).toBe(constants.O_NOFOLLOW)
  expect(read.mock.calls[0][0]).toHaveLength(8193)
  expect(close).toHaveBeenCalledTimes(1)
})
it.each(['missing', 'permissions', 'owner', 'directory', 'oversized', 'malformed', 'growing', 'symlink'])('fails closed on fake credential file: %s', async failure => {
  const close = vi.fn(), read = vi.fn(async (buffer: Buffer) => { buffer.write('{broken'); return { bytesRead: failure === 'growing' ? 8193 : 7 } })
  if (!['missing', 'symlink'].includes(failure)) files.open.mockResolvedValue({
    stat: async () => ({ isFile: () => failure !== 'directory', uid: process.getuid!() + (failure === 'owner' ? 1 : 0), mode: failure === 'permissions' ? 0o644 : 0o600, size: failure === 'oversized' ? 8193 : 10 }), read, close,
  })
  await expect(readDevelopmentCredentials()).rejects.toThrow()
  if (!['missing', 'symlink'].includes(failure)) expect(close).toHaveBeenCalledTimes(1)
  if (['permissions', 'owner', 'directory', 'oversized'].includes(failure)) expect(read).not.toHaveBeenCalled()
})
it('default missing-file route returns only useful redacted 503 and never authenticates', async () => {
  const req = Readable.from(['{"intent":"development-sign-in"}']) as IncomingMessage
  Object.assign(req, { url: '/__dev/login', method: 'POST', headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000', 'content-type': 'application/json' }, socket: { remoteAddress: '127.0.0.1', localAddress: '127.0.0.1' } })
  let status = 0, body = ''
  const res = { setHeader: vi.fn(), end: (value: string) => { body = value }, set statusCode(value: number) { status = value } } as ServerResponse
  await developmentLoginHandler('http://127.0.0.1:3000')(req, res, vi.fn())
  expect(status).toBe(503); expect(body).toContain('provisioning is unavailable'); expect(body).not.toContain('Synthetic missing file')
})
it.each(['https://remote.example', 'http://localhost.example:54321', 'http://127.0.0.1:54321/path', 'http://user@127.0.0.1:54321', 'http://192.168.1.2:54321'])('credential URL cannot escape local Supabase: %s', url => {
  expect(() => parseDevelopmentCredentials({ ...credentials, url })).toThrow()
})
it('rejects admin/secret keys and malformed identity', () => {
  for (const patch of [{ publicKey: 'sb_secret_fixture' }, { accountId: 'not-an-id' }, { password: '' }, { extra: 'untrusted' }]) expect(() => parseDevelopmentCredentials({ ...credentials, ...patch })).toThrow()
})
it('fake local Auth and read-only RPCs verify exact configured user and readiness, without proxy/provisioning', async () => {
  const identity = { username: 'fixture', display_name: 'Fixture', bio: null, avatar_url: null }
  const profile = { ...identity, interests: ['Coffee', 'Music', 'Art'], birthdate: '2001-02-03', location_city: 'Fixture', availability: [{ dow: 1, start_time: '08:00:00', end_time: '12:00:00' }] }
  const network = vi.fn(async (input: string, init?: RequestInit) => {
    expect(init?.redirect).toBe('error'); expect(init?.signal).toBeInstanceOf(AbortSignal)
    if (input.includes('/rest/')) expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${session.access_token}`)
    return Response.json(input.includes('/token') ? session : input.includes('/user') ? { id: credentials.accountId, email: credentials.email, is_anonymous: false } : accountFixture(profile))
  })
  const result = await authenticateDevelopmentAccount(credentials, network)
  expect(result.access_token).toBe(session.access_token)
  expect(network.mock.calls.map(([url]) => new URL(url).pathname)).toEqual(['/auth/v1/token', '/auth/v1/user', '/rest/v1/rpc/get_account'])
})
it.each(['missing', 'wrong-owner', 'wrong-email', 'anonymous', 'partial', 'network', 'oversized'])('fails closed for %s without writes or revocation', async failure => {
  const network = vi.fn(async (input: string) => {
    if (failure === 'network') throw new Error('Private secret failure detail')
    if (failure === 'oversized') return new Response('x'.repeat(65537))
    if (input.includes('/token')) return Response.json(session)
    if (input.includes('/user')) return Response.json({ id: failure === 'wrong-owner' ? 'other' : credentials.accountId, email: failure === 'wrong-email' ? 'other@example.test' : credentials.email, is_anonymous: failure === 'anonymous' })
    return Response.json(failure === 'partial' ? {} : null)
  })
  await expect(authenticateDevelopmentAccount(credentials, network)).rejects.toThrow()
  expect(network.mock.calls.every(([url]) => !/save|queue|logout/.test(url))).toBe(true)
})
