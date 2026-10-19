import { afterEach, expect, it, vi } from 'vitest'
import { detailedSettingsClient } from '../src/features/account/detailed-settings-client'
import { emptyDetailedSettings } from '../shared/detailed-settings'
import { detailedSettingsFixture } from './detailed-settings-fixture'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
it('reads strict server defaults and writes only choices/revision with the captured verified-session token', async () => {
  const fixture = detailedSettingsFixture(), client = detailedSettingsClient('owner-token')
  expect(await client.read()).toEqual(fixture.snapshot())
  const settings = { ...emptyDetailedSettings(), messages: true }
  expect(await client.save({ expectedRevision: 0, settings })).toEqual(fixture.snapshot())
  expect(fixture.fetch).toHaveBeenNthCalledWith(2, '/api/matchmaking/detailed-settings', expect.objectContaining({ method: 'PUT', cache: 'no-store', headers: expect.objectContaining({ Authorization: 'Bearer owner-token' }), body: JSON.stringify({ expectedRevision: 0, settings }) }))
})
it('rejects partial input before transport and distinguishes conflict/unavailable/malformed without retrying', async () => {
  const fixture = detailedSettingsFixture(), client = detailedSettingsClient('owner')
  await expect(client.save({ expectedRevision: -1, settings: emptyDetailedSettings() })).rejects.toMatchObject({ code: 'invalid' })
  expect(fixture.fetch).not.toHaveBeenCalled()
  for (const [status, data, code] of [[409, { code: 'conflict', error: 'Reload.' }, 'conflict'], [503, { code: 'unavailable', error: 'Missing.' }, 'unavailable'], [200, null, 'malformed'], [200, { revision: 2, settings: emptyDetailedSettings(), masters: null, effective: emptyDetailedSettings() }, 'malformed'], [200, { revision: 1, settings: { ...emptyDetailedSettings(), messages: true }, masters: null, effective: { ...emptyDetailedSettings(), messages: true } }, 'malformed']] as const) {
    fixture.state.onWrite = async () => Response.json(data, { status })
    const before = fixture.puts().length
    await expect(client.save({ expectedRevision: 0, settings: emptyDetailedSettings() })).rejects.toMatchObject({ code })
    expect(fixture.puts()).toHaveLength(before + 1)
  }
})
it('keeps a deadline through JSON consumption and never retries an uncertain PUT', async () => {
  vi.useFakeTimers()
  const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => ({ ok: true, status: 200, json: () => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('Aborted body')), { once: true })) }))
  vi.stubGlobal('fetch', fetch)
  const outcome = expect(detailedSettingsClient('owner').save({ expectedRevision: 0, settings: emptyDetailedSettings() })).rejects.toMatchObject({ code: 'provider' })
  await vi.advanceTimersByTimeAsync(15000); await outcome
  expect(fetch).toHaveBeenCalledTimes(1)
})
