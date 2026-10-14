import type { Request, Response } from 'express'
import { expect, it, vi } from 'vitest'
import { createMatchmakingRouter, type UserContextTransport } from '../api/matchmaking'

const identity = { username: 'sam', display_name: 'Sam', bio: null, avatar_url: null }
function request(method: string, body?: unknown, options: { missing?: boolean; invalid?: boolean; token?: string; malformed?: boolean } = {}) {
  const save = vi.fn(async (value: unknown) => ({ data: options.malformed ? { ...identity, interests: [] } : value, error: options.missing ? { code: 'PGRST202' } : null }))
  const accountProfile = vi.fn(async () => ({ data: options.malformed ? {} : identity, error: options.missing ? { code: 'PGRST202' } : null }))
  // Only these new actor methods may be called by the account routes.
  const transport = { verify: vi.fn(async () => options.invalid ? null : { id: 'a0000000-0000-4000-8000-000000000001' }), actor: () => ({ accountProfile, saveAccountProfile: save }) } as unknown as UserContextTransport
  const result = new Promise<{ status: number; data: unknown }>((resolve, reject) => {
    let status = 200
    const req = { method, url: '/account-profile', headers: { authorization: `Bearer ${options.token ?? 'test-jwt'}` }, body } as Request
    const res = { locals: {}, set: vi.fn(), status(code: number) { status = code; return this }, json(data: unknown) { resolve({ status, data }); return this } } as unknown as Response
    createMatchmakingRouter(transport)(req, res, reject)
  })
  return { result, save, accountProfile }
}
it('account API reads and atomically saves only validated account identity', async () => {
  expect(await request('GET').result).toEqual({ status: 200, data: { profile: identity } })
  const write = request('PUT', identity)
  expect(await write.result).toEqual({ status: 200, data: { profile: identity } })
  expect(write.save).toHaveBeenCalledWith(identity)
})
it('account API rejects identity spoofing, blank names, matching fields and invalid avatars before writes', async () => {
  for (const payload of [{ ...identity, user_id: 'other' }, { ...identity, display_name: '' }, { ...identity, interests: [] }, { ...identity, avatar_url: 'http://unsafe.test/image' }]) {
    const write = request('PUT', payload)
    expect((await write.result).status).toBe(400)
    expect(write.save).not.toHaveBeenCalled()
  }
})
it('account API requires verified authentication and reports missing RPC and malformed data honestly', async () => {
  expect((await request('GET', undefined, { invalid: true }).result).status).toBe(401)
  expect((await request('GET', undefined, { missing: true }).result).status).toBe(503)
  expect((await request('PUT', identity, { missing: true }).result).status).toBe(503)
  expect((await request('GET', undefined, { malformed: true }).result).status).toBe(502)
  expect((await request('PUT', identity, { malformed: true }).result).status).toBe(502)
})
