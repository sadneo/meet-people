import { afterEach, expect, it, vi } from 'vitest'
import { profileDetailsClient } from '../src/features/account/profile-details-client'

const facts = { education: ' School ', occupation: '', languages: ['\uFEFF Français\u00A0'], visibility: { education: true, occupation: false, languages: false } }
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
it('uses the supplied session token and separate strict revisioned contract without normalizing labels', async () => {
  const fetch = vi.fn(async () => Response.json({ revision: 3, facts }))
  vi.stubGlobal('fetch', fetch)
  const client = profileDetailsClient('actor-token')
  expect(await client.read()).toEqual({ revision: 3, facts })
  expect(await client.save({ expectedRevision: 2, facts })).toEqual({ revision: 3, facts })
  expect(fetch).toHaveBeenNthCalledWith(2, '/api/matchmaking/profile-details', expect.objectContaining({ method: 'PUT', cache: 'no-store', headers: expect.objectContaining({ Authorization: 'Bearer actor-token' }), body: JSON.stringify({ expectedRevision: 2, facts }) }))
})
it('preserves conflict/unavailable errors and rejects malformed or mismatched success without retrying', async () => {
  for (const [status, body, code] of [[409, { code: 'conflict', error: 'Reload.' }, 'conflict'], [503, { code: 'unavailable', error: 'Not installed.' }, 'unavailable'], [200, null, 'malformed'], [200, { revision: 2, facts }, 'malformed']] as const) {
    const fetch = vi.fn(async () => Response.json(body, { status }))
    vi.stubGlobal('fetch', fetch)
    await expect(profileDetailsClient('token').save({ expectedRevision: 2, facts })).rejects.toMatchObject({ code })
    expect(fetch).toHaveBeenCalledTimes(1)
  }
})
it('rejects invalid drafts before transport and never retries network failures', async () => {
  const fetch = vi.fn(async () => { throw new TypeError('Offline') })
  vi.stubGlobal('fetch', fetch)
  await expect(profileDetailsClient('token').save({ expectedRevision: 2, facts: { ...facts, education: '\uD800' } })).rejects.toMatchObject({ code: 'invalid' })
  expect(fetch).not.toHaveBeenCalled()
  await expect(profileDetailsClient('token').save({ expectedRevision: 2, facts })).rejects.toMatchObject({ code: 'provider' })
  expect(fetch).toHaveBeenCalledTimes(1)
})
it('keeps the deadline through response-body consumption without retrying a mutation', async () => {
  vi.useFakeTimers()
  const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => ({
    ok: true, status: 200,
    json: () => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('Aborted body')), { once: true })),
  }))
  vi.stubGlobal('fetch', fetch)
  const outcome = expect(profileDetailsClient('token').save({ expectedRevision: 2, facts })).rejects.toMatchObject({ code: 'provider' })
  await vi.advanceTimersByTimeAsync(15000)
  await outcome
  expect(fetch).toHaveBeenCalledTimes(1)
})
