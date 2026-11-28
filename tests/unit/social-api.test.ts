// @vitest-environment node
import { expect, it, vi } from 'vitest'
import type { Request, Response } from 'express'
import { createSocialRouter } from '../../api/social'
import { createUserContextTransport, type UserContextTransport } from '../../api/matchmaking'
import express from 'express'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
const a = 'da000000-0000-4000-8000-000000000001', b = 'da000000-0000-4000-8000-000000000002'
function request(kind: 'connections' | 'conversations', method: string, path: string, body: unknown, transport: UserContextTransport | null, token = 'synthetic') {
  return new Promise<{ status: number; data: unknown; cache: string }>((resolve, reject) => {
    let status = 200, cache = ''
    const req = { method, url: path, query: Object.fromEntries(new URL(path, 'http://test').searchParams), headers: token ? { authorization: `Bearer ${token}` } : {}, body } as unknown as Request
    const res = { locals: {}, set(name: string, value: string) { if (name === 'Cache-Control') cache = value; return this }, status(value: number) { status = value; return this }, json(data: unknown) { resolve({ status, data, cache }); return this } } as unknown as Response
    createSocialRouter(transport, kind)(req, res, error => error ? reject(error) : resolve({ status: 404, data: null, cache }))
  })
}
const configured = (actor: object = {}) => ({ verify: async () => ({ id: a }), actor: () => actor }) as unknown as UserContextTransport
it('reads only the authenticated actor’s rolling request allowance and validates its consistency', async () => {
  const value = { limit: 10, used: 10, remaining: 0, availableAt: '2026-10-31T15:00:00Z' }
  const call = vi.fn(async () => ({ data: value, error: null }))
  const transport = configured({ connectionRequestAllowance: call })
  expect(await request('connections', 'GET', '/request-allowance', undefined, transport)).toEqual({ status: 200, data: value, cache: 'no-store' })
  expect(call).toHaveBeenCalledExactlyOnceWith()
  expect((await request('connections', 'GET', `/request-allowance?actor=${b}`, undefined, transport)).status).toBe(400)
  expect((await request('connections', 'GET', '/request-allowance', { actorId: b }, transport)).status).toBe(400)
  expect(call).toHaveBeenCalledOnce()
  expect((await request('connections', 'GET', '/request-allowance', undefined, transport, '')).status).toBe(401)
  call.mockResolvedValueOnce({ data: { ...value, remaining: 1 }, error: null })
  expect((await request('connections', 'GET', '/request-allowance', undefined, transport)).status).toBe(502)
})
it('requires verified identity and real capabilities; event group operations remain unavailable', async () => {
  expect((await request('connections', 'GET', '/', undefined, null)).status).toBe(503)
  expect((await request('connections', 'GET', '/', undefined, configured(), '')).status).toBe(401)
  expect((await request('connections', 'GET', '/', undefined, configured())).status).toBe(503)
  expect((await request('conversations', 'POST', '/', { eventGroupId: a }, configured())).status).toBe(503)
})
it('rejects actor selectors, extra body fields, cursor ambiguity and unsafe read positions before SQL calls', async () => {
  const call = vi.fn()
  const transport = configured({ socialConnection: call, socialHistory: call, socialSend: call, socialRead: call })
  for (const [kind, method, path, body] of [
    ['connections', 'POST', `/${b}`, { actorId: a }], ['connections', 'GET', `/${b}?actor=${a}`, undefined],
    ['conversations', 'GET', `/${b}/messages?before=2&after=1`, undefined],
    ['conversations', 'POST', `/${b}/messages`, { body: 'hello', clientRequestId: a, sender_id: b }],
    ['conversations', 'POST', `/${b}/read`, { seq: Number.MAX_SAFE_INTEGER + 1 }],
  ] as const) expect((await request(kind, method, path, body, transport)).status).toBe(400)
  expect(call).not.toHaveBeenCalled()
})
it('maps admission denial, uncertainty and malformed responses without inventing success', async () => {
  for (const [error, status] of [[{ code: '42501' }, 403], [{ code: 'SC409' }, 409], [{ code: '40P01' }, 503], [{ code: 'PGRST202' }, 503]] as const) {
    expect((await request('connections', 'POST', `/${b}`, {}, configured({ socialConnection: async () => ({ data: null, error }) }))).status).toBe(status)
  }
  expect((await request('connections', 'POST', `/${b}`, {}, configured({ socialConnection: async () => ({ data: {}, error: null }) }))).status).toBe(502)
})
it.each([
  ['MSG01', 403], ['MSG03', 403], ['MSG05', 403], ['CON02', 403],
  ['MSG08', 400], ['MSG09', 400], ['MSG10', 409], ['MSG11', 429], ['CON04', 429],
])('maps native UUID messaging error %s to HTTP %i', async (code, status) => {
  const transport = configured({ socialHistory: async () => ({ data: null, error: { code } }) })
  expect((await request('conversations', 'GET', `/${b}/messages`, undefined, transport)).status).toBe(status)
})
it('uses the actual SDK with only fixed RPC names and the actor JWT/public key', async () => {
  const calls: { name: string; body: unknown }[] = []
  const fetch: typeof globalThis.fetch = vi.fn(async (input, init) => {
    const name = new URL(String(input)).pathname.split('/').pop()!
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer synthetic')
    expect(new Headers(init?.headers).get('apikey')).toBe('sb_publishable_test')
    calls.push({ name, body: init?.body ? JSON.parse(String(init.body)) : null })
    return Response.json(name === 'user' ? { id: a } : { status: 'sent', conversationId: null })
  })
  const transport = createUserContextTransport({ url: 'https://database.test', publicKey: 'sb_publishable_test', fetch })
  expect(await request('connections', 'POST', `/${b}`, {}, transport)).toMatchObject({ status: 200, cache: 'no-store', data: { status: 'sent' } })
  expect(calls).toEqual([{ name: 'user', body: null }, { name: 'social_connection', body: { target_in: b, action_in: 'request' } }])
})

it('validates typing flags and derives the sender from the verified actor, including group chats', async () => {
  const call = vi.fn(async () => ({ data: { ok: true }, error: null as { code: string } | null }))
  const app = express()
  app.use(express.json())
  app.use(createSocialRouter(configured({ socialTyping: call }), 'conversations'))
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/${b}/typing`
  const post = (body: unknown, token = 'synthetic') => fetch(url, { method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) })
  try {
    expect((await post({ isGroup: false, typing: true })).status).toBe(200)
    expect(call).toHaveBeenLastCalledWith(b, false, true)
    expect((await post({ isGroup: true, typing: false })).status).toBe(200)
    expect(call).toHaveBeenLastCalledWith(b, true, false)
    for (const body of [{ typing: true }, { isGroup: false, typing: 'yes' }, { isGroup: false, typing: true, userId: a }, { isGroup: false, typing: true, body: 'secret draft' }]) {
      expect((await post(body)).status).toBe(400)
    }
    expect((await post({ isGroup: false, typing: true }, '')).status).toBe(401)
    expect(call).toHaveBeenCalledTimes(2)
    call.mockResolvedValueOnce({ data: { ok: true }, error: { code: '42501' } })
    expect((await post({ isGroup: false, typing: true })).status).toBe(403)
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) }
})

it('sends typing through the fixed actor RPC without accepting a sender selector', async () => {
  const calls: unknown[] = []
  const transport = createUserContextTransport({ url: 'https://database.test', publicKey: 'sb_publishable_test', fetch: async (input, init) => {
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer synthetic')
    calls.push({ rpc: new URL(String(input)).pathname.split('/').pop(), body: JSON.parse(String(init?.body)) })
    return Response.json({ ok: true })
  } })
  await transport.actor('synthetic').socialTyping!(b, true, true)
  expect(calls).toEqual([{ rpc: 'messaging_typing', body: { conversation_in: b, group_in: true, typing_in: true } }])
})

it('cancels only the selected outgoing request and surfaces a stale cancellation', async () => {
  const requestedAt = '2026-11-19T00:00:00Z'
  const cancel = vi.fn().mockResolvedValueOnce({ data: true }).mockResolvedValueOnce({ data: false })
  const remove = vi.fn()
  const transport = configured({ cancelSentRequest: cancel, socialConnection: remove })
  expect((await request('connections', 'POST', `/${b}/cancel`, { requestedAt }, transport)).status).toBe(200)
  expect(cancel).toHaveBeenCalledWith(b, requestedAt)
  expect((await request('connections', 'POST', `/${b}/cancel`, { requestedAt }, transport)).status).toBe(409)
  expect(remove).not.toHaveBeenCalled()
})
