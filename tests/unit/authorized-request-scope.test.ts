import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { authorizedRequest } from '../../src/auth/authorizedRequest'

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), fetch: vi.fn() }))
vi.mock('../../src/supabase', () => ({ supabase: { auth: { getSession: mocks.getSession } } }))
beforeEach(() => {
  mocks.getSession.mockReset().mockResolvedValue({ data: { session: { access_token: 'fixture-b', user: { id: 'account-b' } } } })
  // Native mutation dispatch deliberately ignores AbortSignal once fetch is invoked.
  mocks.fetch.mockReset().mockResolvedValue(new Response('null', { headers: { 'Content-Type': 'application/json' } }))
  vi.stubGlobal('fetch', mocks.fetch)
})
afterEach(() => vi.unstubAllGlobals())

it('does not dispatch an aborted mutation after asynchronous session lookup', async () => {
  let release!: (value: unknown) => void
  mocks.getSession.mockReturnValue(new Promise(resolve => { release = resolve }))
  const controller = new AbortController()
  const request = authorizedRequest('/api/push/devices', z.null(), { method: 'POST', body: { token: 'fixture-token' }, signal: controller.signal })
  controller.abort()
  release({ data: { session: { access_token: 'fixture-a', user: { id: 'account-a' } } } })
  await expect(request).rejects.toMatchObject({ name: 'AbortError' })
  expect(mocks.fetch).not.toHaveBeenCalled()
})

it.each(['account-b', null])('does not attach an old account operation to current session %s', async owner => {
  mocks.getSession.mockResolvedValue({ data: { session: owner ? { access_token: 'fixture-b', user: { id: owner } } : null } })
  const options = { method: 'POST', body: { token: 'fixture-token' }, expectedUserId: 'account-a' }
  await expect(authorizedRequest('/api/push/devices', z.null(), options)).rejects.toThrow(/session|account/i)
  expect(mocks.fetch).not.toHaveBeenCalled()
})

it('allows the explicitly expected account with its bearer token', async () => {
  const options = { method: 'POST', body: { token: 'fixture-token' }, expectedUserId: 'account-b' }
  await expect(authorizedRequest('/api/push/devices', z.null(), options)).resolves.toBeNull()
  expect(mocks.fetch).toHaveBeenCalledWith('/api/push/devices', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer fixture-b' }) }))
})

it('rejects an already-aborted mutation before even looking up a session', async () => {
  const controller = new AbortController()
  controller.abort()
  await expect(authorizedRequest('/api/push/devices', z.null(), { method: 'DELETE', signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
  expect(mocks.getSession).not.toHaveBeenCalled()
  expect(mocks.fetch).not.toHaveBeenCalled()
})

it('checks cancellation again immediately before dispatch, after preparing the request body', async () => {
  const controller = new AbortController()
  const body = { toJSON() { controller.abort(); return { token: 'fixture-token' } } }
  await expect(authorizedRequest('/api/push/devices', z.null(), { method: 'POST', body, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
  expect(mocks.fetch).not.toHaveBeenCalled()
})

it('preserves the current-session default when no expected owner is provided', async () => {
  await expect(authorizedRequest('/api/example', z.null(), { body: { value: 'fixture' } })).resolves.toBeNull()
  expect(mocks.fetch).toHaveBeenCalledWith('/api/example', expect.objectContaining({
    method: 'POST', body: '{"value":"fixture"}', headers: { Authorization: 'Bearer fixture-b', 'Content-Type': 'application/json' },
  }))
})

it('preserves anonymous default reads when no expected owner is provided', async () => {
  mocks.getSession.mockResolvedValue({ data: { session: null } })
  await expect(authorizedRequest('/api/example', z.null())).resolves.toBeNull()
  expect(mocks.fetch).toHaveBeenCalledWith('/api/example', expect.objectContaining({ method: 'GET', headers: {}, body: undefined }))
})
