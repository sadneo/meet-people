// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { createDiningIngestionHandler, type DiningStorage } from '../../supabase/functions/_shared/dining-ingestion.ts'
import { emptyMenuItem, type DiningMenu, type ScrapeResult } from '../../supabase/functions/_shared/dining-menus.ts'

const now = new Date('2026-11-03T15:00:00Z')
const row: DiningMenu = {
  source: 'sbu_hospital', external_id: 'market-place-cafe:daily:2026-11-03',
  location_slug: 'market-place-cafe', location_name: 'The Market Place Café', menu_slug: 'daily', menu_name: 'Daily Menu',
  menu_date: '2026-11-03', source_url: 'https://docs.google.com/document/d/menu/edit',
  items: [emptyMenuItem('Soup')], notices: [], last_synced_at: now.toISOString(),
}

function setup(result: Partial<ScrapeResult> = {}) {
  const store = {
    startRun: vi.fn().mockResolvedValue('run-1'), finishRun: vi.fn().mockResolvedValue(undefined),
    upsert: vi.fn().mockImplementation(async (rows: DiningMenu[]) => ({ count: rows.length })),
    deleteExpired: vi.fn().mockResolvedValue(2),
  } satisfies DiningStorage
  const storage = vi.fn(() => store)
  const scrape = vi.fn().mockResolvedValue({ rows: [row], requestCount: 2, fetchedCount: 5, skippedCount: 4, issues: [], ...result })
  const options = { source: 'sbu_hospital' as const, token: () => 'secret', storage, scrape, now: () => now }
  return { store, storage, scrape, options, handle: createDiningIngestionHandler(options) }
}

function request(body: unknown = {}, token = 'secret') {
  return new Request('https://example.test/ingest-sbu-hospital', { method: 'POST',
    headers: { 'x-ingest-token': token }, body: JSON.stringify(body) })
}

describe('dining ingestion endpoints', () => {
  it('authenticates before making upstream requests or creating a run', async () => {
    const { handle, scrape, storage, options } = setup()
    expect((await handle(new Request('https://example.test'))).status).toBe(405)
    expect((await handle(request({}, 'wrong'))).status).toBe(401)
    expect((await createDiningIngestionHandler({ ...options, token: () => undefined })(request())).status).toBe(500)
    expect(scrape).not.toHaveBeenCalled()
    expect(storage).not.toHaveBeenCalled()
  })
  it('rejects invalid JSON and non-object bodies', async () => {
    const { handle, scrape } = setup()
    for (const value of [null, [], 42, { dryRun: 'false' }]) expect((await handle(request(value))).status).toBe(400)
    const invalid = new Request('https://example.test', { method: 'POST', headers: { 'x-ingest-token': 'secret' }, body: '{' })
    expect((await handle(invalid)).status).toBe(400)
    expect((await handle(request({ extra: 'a'.repeat(8193) }))).status).toBe(413)
    expect(scrape).not.toHaveBeenCalled()
  })
  it('defaults to dry-run and returns normalized menus without accessing storage', async () => {
    const { handle, storage } = setup()
    const response = await handle(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'ok', dryRun: true, mode: 'smoke',
      normalized: { accepted: 1, sample: [row] }, storage: { upserted: 0 }, ingestionRun: null })
    expect(storage).not.toHaveBeenCalled()
  })
  it('writes dated snapshots, cleans only the same source, and records final counters', async () => {
    const { handle, store } = setup()
    const response = await handle(request({ mode: 'full', dryRun: false }))
    expect(response.status).toBe(200)
    expect(store.upsert).toHaveBeenCalledWith([row])
    expect(store.deleteExpired).toHaveBeenCalledWith('sbu_hospital', '2026-10-27')
    expect(store.finishRun).toHaveBeenCalledWith('run-1', expect.objectContaining({ status: 'completed', requestCount: 2,
      fetchedCount: 5, acceptedCount: 1, skippedCount: 4, upsertedCount: 1, deletedCount: 2 }))
  })
  it('keeps successful menus on partial upstream failure without deleting prior snapshots', async () => {
    const { handle, store } = setup({ issues: [{ code: 'upstream_http_503' }] })
    const response = await handle(request({ mode: 'full', dryRun: false }))
    expect(await response.json()).toMatchObject({ status: 'partial', ingestionRun: { status: 'partial' } })
    expect(store.upsert).toHaveBeenCalledWith([row])
    expect(store.deleteExpired).not.toHaveBeenCalled()
    expect(store.finishRun).toHaveBeenCalledWith('run-1', expect.objectContaining({ status: 'partial' }))
  })
  it('reports complete upstream failure as 502 with no menu writes or cleanup', async () => {
    const { handle, store } = setup({ rows: [], issues: [{ code: 'hospital_invalid_menu_document' }] })
    const response = await handle(request({ mode: 'full', dryRun: false }))
    expect(response.status).toBe(502)
    expect(store.upsert).not.toHaveBeenCalled()
    expect(store.deleteExpired).not.toHaveBeenCalled()
    expect(store.finishRun).toHaveBeenCalledWith('run-1', expect.objectContaining({ status: 'failed' }))
  })
  it('accepts a successfully read week with no published menu in the requested dates', async () => {
    const { handle, store } = setup({ rows: [], issues: [] })
    expect((await handle(request({ dryRun: false }))).status).toBe(200)
    expect(store.upsert).not.toHaveBeenCalled()
    expect(store.deleteExpired).not.toHaveBeenCalled()
  })
  it('requires configured storage only for real imports', async () => {
    const { options, scrape } = setup()
    const handle = createDiningIngestionHandler({ ...options, storage: () => null })
    expect((await handle(request({ dryRun: false }))).status).toBe(500)
    expect(scrape).not.toHaveBeenCalled()
  })
  it('reports partial write counts when a later batch fails', async () => {
    const { handle, store } = setup()
    store.upsert.mockResolvedValue({ count: 100, error: 'dining_menus_upsert_failed' })
    const response = await handle(request({ dryRun: false, mode: 'full' }))
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ error: 'dining_menus_upsert_failed', storage: { upserted: 100 } })
    expect(store.finishRun).toHaveBeenCalledWith('run-1', expect.objectContaining({ status: 'failed', upsertedCount: 100 }))
    expect(store.deleteExpired).not.toHaveBeenCalled()
  })
  it('does not claim success if final run reporting fails', async () => {
    const { handle, store } = setup()
    store.finishRun.mockRejectedValue(new Error('database unavailable'))
    const response = await handle(request({ dryRun: false }))
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ error: 'ingestion_run_finish_failed', storage: { upserted: 1 } })
  })
})
