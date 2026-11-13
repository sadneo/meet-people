// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createPushRouter } from '../../api/push'

const TOKEN = 'f'.repeat(40)

function fakeClient(user: { id: string } | null = { id: 'user-1' }, dbError: { code: string } | null = null) {
  const upsert = vi.fn(async () => ({ error: dbError }))
  const eqUser = vi.fn(async () => ({ error: dbError }))
  const eqToken = vi.fn(() => ({ eq: eqUser }))
  const del = vi.fn(() => ({ eq: eqToken }))
  const from = vi.fn(() => ({ upsert, delete: del }))
  const getUser = vi.fn(async () => (user ? { data: { user }, error: null } : { data: { user: null }, error: { message: 'bad jwt' } }))
  return { client: { auth: { getUser }, from } as never, upsert, eqToken, eqUser, getUser, from }
}

let server: Server | undefined
async function start(client: Parameters<typeof createPushRouter>[0]) {
  const app = express()
  app.use(express.json())
  app.use('/api/push', createPushRouter(client))
  server = await new Promise<Server>(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
  const { port } = server.address() as AddressInfo
  return (method: 'POST' | 'DELETE', init: { token?: string; body?: unknown } = {}) => fetch(`http://127.0.0.1:${port}/api/push/devices`, {
    method,
    headers: { ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}), 'Content-Type': 'application/json' },
    body: JSON.stringify(init.body ?? { token: TOKEN, platform: 'android' }),
  })
}
afterEach(async () => { await new Promise(resolve => server?.close(resolve)); server = undefined })

describe('POST /api/push/devices', () => {
  it('saves the token for the verified caller only', async () => {
    const { client, upsert, getUser } = fakeClient({ id: 'abc' })
    const response = await (await start(client))('POST', { token: 'jwt' })
    expect(response.status).toBe(204)
    expect(getUser).toHaveBeenCalledWith('jwt')
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ token: TOKEN, user_id: 'abc', platform: 'android' }), { onConflict: 'token' })
  })
  it('ignores any user id sent by the client', async () => {
    const { client, upsert } = fakeClient({ id: 'abc' })
    const response = await (await start(client))('POST', { token: 'jwt', body: { token: TOKEN, user_id: 'someone-else' } })
    expect(response.status).toBe(400)
    expect(upsert).not.toHaveBeenCalled()
  })
  it('rejects a missing or invalid session', async () => {
    const none = fakeClient()
    expect((await (await start(none.client))('POST')).status).toBe(401)
    expect(none.upsert).not.toHaveBeenCalled()
    await new Promise(resolve => server?.close(resolve))
    const bad = fakeClient(null)
    expect((await (await start(bad.client))('POST', { token: 'forged' })).status).toBe(401)
    expect(bad.upsert).not.toHaveBeenCalled()
  })
  it('rejects malformed tokens', async () => {
    const { client, upsert } = fakeClient()
    const call = await start(client)
    expect((await call('POST', { token: 'jwt', body: { token: 'short' } })).status).toBe(400)
    expect((await call('POST', { token: 'jwt', body: { token: TOKEN, platform: 'ios' } })).status).toBe(400)
    expect(upsert).not.toHaveBeenCalled()
  })
  it('hides database errors', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { client } = fakeClient({ id: 'abc' }, { code: '23505' })
    const response = await (await start(client))('POST', { token: 'jwt' })
    expect(response.status).toBe(502)
    expect(JSON.stringify(await response.json())).not.toMatch(/23505/)
    spy.mockRestore()
  })
  it('is unavailable without a service-role client', async () => {
    expect((await (await start(null))('POST', { token: 'jwt' })).status).toBe(503)
  })
})

describe('DELETE /api/push/devices', () => {
  it('removes only the caller’s own token', async () => {
    const { client, eqToken, eqUser } = fakeClient({ id: 'abc' })
    const response = await (await start(client))('DELETE', { token: 'jwt', body: { token: TOKEN } })
    expect(response.status).toBe(204)
    expect(eqToken).toHaveBeenCalledWith('token', TOKEN)
    expect(eqUser).toHaveBeenCalledWith('user_id', 'abc')
  })
  it('requires a session', async () => {
    const { client, from } = fakeClient()
    expect((await (await start(client))('DELETE', { body: { token: TOKEN } })).status).toBe(401)
    expect(from).not.toHaveBeenCalled()
  })
})
