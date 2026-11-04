// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createAccountRouter } from '../../api/account'

function fakeClient(options: { user?: { id: string } | null; deleteError?: { status: number; code: string } | null } = {}) {
  const getUser = vi.fn(async () => (options.user === null ? { data: { user: null }, error: { message: 'bad jwt' } } : { data: { user: options.user ?? { id: 'user-1' } }, error: null }))
  const deleteUser = vi.fn(async () => ({ data: {}, error: options.deleteError ?? null }))
  return { client: { auth: { getUser, admin: { deleteUser } } } as never, getUser, deleteUser }
}

let server: Server | undefined
async function start(client: Parameters<typeof createAccountRouter>[0]) {
  const app = express()
  app.use(express.json())
  app.use('/api/account', createAccountRouter(client))
  server = await new Promise<Server>(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
  const { port } = server.address() as AddressInfo
  return (init: { token?: string; body?: unknown } = {}) => fetch(`http://127.0.0.1:${port}/api/account`, {
    method: 'DELETE',
    headers: { ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}), 'Content-Type': 'application/json' },
    body: JSON.stringify(init.body ?? { confirm: 'DELETE' }),
  })
}
afterEach(async () => { await new Promise(resolve => server?.close(resolve)); server = undefined })

describe('DELETE /api/account', () => {
  it('deletes only the verified caller and returns 204', async () => {
    const { client, getUser, deleteUser } = fakeClient({ user: { id: 'abc' } })
    const call = await start(client)
    const response = await call({ token: 'jwt' })
    expect(response.status).toBe(204)
    expect(getUser).toHaveBeenCalledWith('jwt')
    expect(deleteUser).toHaveBeenCalledExactlyOnceWith('abc')
  })
  it('rejects a missing token without touching the database', async () => {
    const { client, getUser, deleteUser } = fakeClient()
    const response = await (await start(client))()
    expect(response.status).toBe(401)
    expect(getUser).not.toHaveBeenCalled(); expect(deleteUser).not.toHaveBeenCalled()
  })
  it('requires the typed confirmation and rejects extra fields', async () => {
    const { client, deleteUser } = fakeClient()
    const call = await start(client)
    expect((await call({ token: 'jwt', body: { confirm: 'delete' } })).status).toBe(400)
    expect((await call({ token: 'jwt', body: {} })).status).toBe(400)
    expect((await call({ token: 'jwt', body: { confirm: 'DELETE', userId: 'someone-else' } })).status).toBe(400)
    expect(deleteUser).not.toHaveBeenCalled()
  })
  it('rejects an invalid token', async () => {
    const { client, deleteUser } = fakeClient({ user: null })
    const response = await (await start(client))({ token: 'forged' })
    expect(response.status).toBe(401); expect(deleteUser).not.toHaveBeenCalled()
  })
  it('reports a failed deletion without leaking details', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { client } = fakeClient({ deleteError: { status: 500, code: 'unexpected_failure' } })
    const response = await (await start(client))({ token: 'jwt' })
    expect(response.status).toBe(502)
    expect(JSON.stringify(await response.json())).not.toMatch(/unexpected_failure|user-1/)
    spy.mockRestore()
  })
  it('is unavailable when the server has no service-role client', async () => {
    expect((await (await start(null))({ token: 'jwt' })).status).toBe(503)
  })
})
