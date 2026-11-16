// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { createSbEngagedIngestionHandler, type SbEngagedStore } from '../../supabase/functions/_shared/sbengaged-ingestion.ts'
import { fetchSbEngagedPhoto, retryAfterSeconds, runSbEngagedPhotoCycle, type PhotoStore, type PhotoResult } from '../../supabase/functions/_shared/sbengaged-photo-worker.ts'
import { parseSharedSbEngagedSnapshot } from '../../supabase/functions/_shared/sbengaged-shared-snapshot.ts'

const now = new Date('2026-11-16T12:00:00Z')
const request = (body: unknown = { mode: 'full', dryRun: false }, token = 'secret') => new Request('https://example.test', { method: 'POST', headers: { 'x-ingest-token': token }, body: JSON.stringify(body) })
function setup(mode = 'producer') {
  const store = { begin: vi.fn().mockResolvedValue({ state: 'claimed', token: 'lease' }), start: vi.fn().mockResolvedValue('run'),
    upsert: vi.fn().mockImplementation(async (_token, rows) => rows.length),
    finish: vi.fn().mockResolvedValue({ deleted: 2, photosPending: 10, lifecycle: {} }), report: vi.fn(), release: vi.fn(), cooldown: vi.fn(),
  } satisfies SbEngagedStore
  const network = vi.fn<typeof fetch>()
  const factory = vi.fn(() => store)
  const handle = createSbEngagedIngestionHandler({ token: () => 'secret', mode: () => mode, store: factory,
    sharedUrl: () => 'https://wacgxhsdhrqigrmqaonc.supabase.co/functions/v1/export-sbengaged', sharedToken: () => 'export-secret', now: () => now, network })
  return { store, network, factory, handle }
}
const event = (n: number) => `BEGIN:VEVENT\nSUMMARY:Event ${n}\nDTSTART:20261201T120000Z\nDTEND:20261201T140000Z\nURL:https://sbengaged.stonybrook.edu/rsvp?id=${n}\nEND:VEVENT`

it('imports a month from one feed request, chunks writes and makes no poster requests', async () => {
  const { handle, network, store } = setup()
  network.mockResolvedValue(new Response(`BEGIN:VCALENDAR\n${Array.from({ length: 205 }, (_, n) => event(n + 1)).join('\n')}\nEND:VCALENDAR`))
  const response = await handle(request())
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ status: 'ok', window: { endsAt: '2026-12-16T12:00:00.000Z' },
    storage: { upserted: 205 }, enrichment: { state: 'queued', upstreamPhotoRequests: 0 } })
  expect(network).toHaveBeenCalledTimes(1)
  expect(store.upsert.mock.calls.map(call => call[1].length)).toEqual([100, 100, 5])
  expect(store.finish.mock.calls[0][3]).toHaveLength(205)
})

it('rejects invalid requests and disabled source mode before storage or upstream access', async () => {
  const { handle, network, factory } = setup()
  for (const body of [null, [], { dryRun: 'false' }, { refreshDetails: true }, { batch: 1000 }]) expect((await handle(request(body))).status).toBe(400)
  expect((await handle(request({}, 'wrong'))).status).toBe(401)
  expect((await setup('disabled').handle(request())).status).toBe(503)
  expect(factory).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled()
})

it('does not reconcile or prune after a truncated feed or failed batch write', async () => {
  for (const truncate of [true, false]) {
    const { handle, network, store } = setup()
    network.mockResolvedValue(new Response(`BEGIN:VCALENDAR\n${event(1)}\n${truncate ? '' : 'END:VCALENDAR'}`))
    if (!truncate) store.upsert.mockRejectedValue(new Error('database private detail'))
    const response = await handle(request())
    expect(response.status).toBe(502)
    expect(JSON.stringify(await response.json())).not.toContain('private detail')
    expect(store.finish).not.toHaveBeenCalled()
    expect(store.release).toHaveBeenCalledWith('lease')
  }
})

it('honors a source-wide cooldown without contacting the provider', async () => {
  const { handle, network, store } = setup()
  store.begin.mockResolvedValue({ state: 'cooldown', token: '' })
  expect(await (await handle(request())).json()).toMatchObject({ status: 'cooldown' })
  expect(network).not.toHaveBeenCalled()
})

it('follows the calendar CDN redirect and rejects redirects to unrelated hosts', async () => {
  for (const location of ['https://static-prod-us-east-1.campusgroups.com:443/ical/stonybrook/ical_stonybrook.ics', 'https://other.test/calendar']) {
    const { handle, network } = setup()
    network.mockResolvedValueOnce(new Response('', { status: 302, headers: { location } }))
      .mockResolvedValueOnce(new Response(`BEGIN:VCALENDAR\n${event(1)}\nEND:VCALENDAR`))
    expect((await handle(request())).status).toBe(location.includes('campusgroups') ? 200 : 502)
    expect(network).toHaveBeenCalledTimes(location.includes('campusgroups') ? 2 : 1)
  }
})

const snapshot = () => ({ version: 1, complete: true, generatedAt: now.toISOString(), window: { startsAt: now.toISOString(), endsAt: '2026-12-16T12:00:00Z' }, events: [{
  source: 'sbengaged', listing_type: 'event', external_id: '123', title: 'Shared event', description: null, category: null,
  starts_at: '2026-12-01T12:00:00Z', ends_at: null, source_url: 'https://sbengaged.stonybrook.edu/rsvp?id=123',
  location_name: null, last_synced_at: now.toISOString(), image_url: 'https://example.test/poster.png', details_synced_at: now.toISOString(), status: 'active', email: 'never-copy@example.test', id: 'never-copy-id',
}] })

it('mirrors only public source fields and never falls back to scraping on export failures', async () => {
  const { handle, network, store } = setup('mirror')
  network.mockResolvedValueOnce(Response.json(snapshot())).mockResolvedValueOnce(new Response('', { status: 503 }))
  expect((await handle(request())).status).toBe(200)
  expect(store.upsert.mock.calls[0][1][0]).not.toHaveProperty('email')
  expect(store.upsert.mock.calls[0][1][0]).not.toHaveProperty('id')
  expect((await handle(request())).status).toBe(502)
  expect(network.mock.calls.every(call => String(call[0]).startsWith('https://wacgxhsdhrqigrmqaonc.supabase.co/'))).toBe(true)
})

it('rejects stale, incomplete, duplicate, forged-source and unsafe-photo snapshots', () => {
  for (const raw of [
    { ...snapshot(), generatedAt: '2026-11-15T12:00:00Z' }, { ...snapshot(), complete: false },
    { ...snapshot(), events: [...snapshot().events, ...snapshot().events] },
    { ...snapshot(), events: [{ ...snapshot().events[0], source: 'other' }] },
    { ...snapshot(), events: [{ ...snapshot().events[0], image_url: 'javascript:alert(1)' }] },
  ]) expect(() => parseSharedSbEngagedSnapshot(raw, now.getTime())).toThrow()
})

function photoStore(count = 3) {
  return { claim: vi.fn().mockResolvedValue({ state: 'claimed', token: 'lease', jobs: Array.from({ length: count }, (_, n) => ({ listingId: String(n), externalId: String(n), failures: 2 })) }),
    cooldown: vi.fn(), complete: vi.fn(), release: vi.fn() } satisfies PhotoStore
}
const photo: PhotoResult = { outcome: 'photo', image: 'https://example.test/photo.png', httpStatus: 200, retrySeconds: 300 }
it('paces lookups, persists each result, and leaves unfinished jobs recoverable', async () => {
  const store = photoStore(), load = vi.fn().mockResolvedValue(photo), pause = vi.fn()
  expect(await runSbEngagedPhotoCycle(store, load, pause)).toEqual({ state: 'idle', processed: 3 })
  expect(pause.mock.calls).toEqual([[1000], [1000]])
  expect(store.complete).toHaveBeenCalledTimes(3)
  expect(store.release).toHaveBeenCalledWith('lease')
  store.complete.mockRejectedValue(new Error('uncertain write'))
  load.mockClear()
  await expect(runSbEngagedPhotoCycle(store, load, pause)).rejects.toThrow()
  expect(load).toHaveBeenCalledTimes(1)
})

it('stops immediately on 429 and persists cooldown before releasing the batch', async () => {
  const store = photoStore(), load = vi.fn().mockResolvedValue({ ...photo, outcome: 'rate_limited', image: null, httpStatus: 429, retrySeconds: 7200 })
  expect(await runSbEngagedPhotoCycle(store, load, vi.fn())).toEqual({ state: 'cooldown', processed: 1 })
  expect(load).toHaveBeenCalledTimes(1)
  expect(store.cooldown).toHaveBeenCalledWith(7200)
  expect(store.cooldown.mock.invocationCallOrder[0]).toBeLessThan(store.complete.mock.invocationCallOrder[0])
})

it('uses one direct request per photo and distinguishes missing posters from source failures', async () => {
  const network = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ data: { event: { id: btoa('stonybrook:Event:123'), photo: null } } }))
    .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '7200' } }))
    .mockResolvedValueOnce(Response.json({ errors: [{ extensions: { code: 'EVENT_NOT_AVAILABLE' } }] }))
  expect(await fetchSbEngagedPhoto('123', network)).toMatchObject({ outcome: 'no_photo' })
  expect(await fetchSbEngagedPhoto('123', network)).toMatchObject({ outcome: 'rate_limited', retrySeconds: 7200 })
  expect(await fetchSbEngagedPhoto('123', network)).toMatchObject({ outcome: 'unavailable', retrySeconds: 86400 })
  expect(network).toHaveBeenCalledTimes(3)
  expect(network.mock.calls.every(call => String(call[0]).endsWith('/api/v2/graphql'))).toBe(true)
  expect(retryAfterSeconds('Mon, 16 Nov 2026 12:15:00 GMT', now.getTime())).toBe(900)
})
