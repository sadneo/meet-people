import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { authorizedRequest } from '../../src/auth/authorizedRequest'

const auth = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('../../src/supabase', () => ({ supabase: { auth } }))
vi.mock('../../src/platform/native', () => ({ apiUrl: (path: string) => path }))
const schema = z.object({ status: z.literal('connected') }).strict()
const fetchMock = vi.fn()
beforeEach(() => {
  auth.getSession.mockReset().mockResolvedValue({ data: { session: { access_token: 'test-session' } } })
  fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllGlobals() })
it('signs the existing API request with the current session and validates its response', async () => {
  fetchMock.mockResolvedValue(Response.json({ status: 'connected' }))
  const controller = new AbortController()
  await expect(authorizedRequest('/api/connections/person', schema, { body: {}, signal: controller.signal })).resolves.toEqual({ status: 'connected' })
  expect(fetchMock).toHaveBeenCalledWith('/api/connections/person', {
    method: 'POST', signal: controller.signal,
    headers: { Authorization: 'Bearer test-session', 'Content-Type': 'application/json' }, body: '{}',
  })
})
it('gets a fresh session for each call and preserves explicit DELETE methods', async () => {
  fetchMock.mockImplementation(async () => Response.json({ status: 'connected' }))
  await authorizedRequest('/api/connections/person', schema)
  auth.getSession.mockResolvedValue({ data: { session: { access_token: 'next-test-session' } } })
  await authorizedRequest('/api/connections/person', schema, { method: 'DELETE' })
  expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'DELETE', headers: { Authorization: 'Bearer next-test-session' } })
  expect(auth.getSession).toHaveBeenCalledTimes(2)
})
it('retains server authorization errors rather than presenting a completed action', async () => {
  auth.getSession.mockResolvedValue({ data: { session: null } })
  fetchMock.mockResolvedValue(Response.json({ error: 'Sign in required.' }, { status: 401 }))
  await expect(authorizedRequest('/api/connections/person', schema)).rejects.toThrow('Sign in required.')
  expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('Authorization')
})
it('rejects malformed success and non-JSON service errors', async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ status: 'invented' }))
    .mockResolvedValueOnce(new Response('Unavailable', { status: 503 }))
  await expect(authorizedRequest('/api/connections/person', schema)).rejects.toThrow('Received an unexpected response.')
  await expect(authorizedRequest('/api/connections/person', schema)).rejects.toThrow('This service is unavailable.')
})
it('accepts empty 204 only when the caller schema permits it and propagates aborts', async () => {
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
  await expect(authorizedRequest('/api/conversations/chat/leave', z.null(), { body: {} })).resolves.toBeNull()
  fetchMock.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'))
  await expect(authorizedRequest('/api/connections/person', schema)).rejects.toMatchObject({ name: 'AbortError' })
})
