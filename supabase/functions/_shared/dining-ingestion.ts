import { addMenuDays, localMenuDate, menuWindow, parseDiningInput,
  type DiningInput, type DiningMenu, type DiningSource, type ScrapeIssue, type ScrapeResult } from './dining-menus.ts'

export type DiningRunSummary = {
  status: 'completed' | 'partial' | 'failed'
  requestCount: number
  fetchedCount: number
  acceptedCount: number
  skippedCount: number
  upsertedCount: number
  deletedCount: number
  issues: ScrapeIssue[]
}
export interface DiningStorage {
  startRun(source: DiningSource, input: DiningInput): Promise<string>
  finishRun(id: string, summary: DiningRunSummary): Promise<void>
  upsert(rows: DiningMenu[]): Promise<{ count: number; error?: string }>
  deleteExpired(source: DiningSource, cutoffDate: string): Promise<number>
}

export function createDiningIngestionHandler(options: {
  source: DiningSource
  token: () => string | undefined
  storage: () => DiningStorage | null
  scrape: (input: DiningInput, now: Date) => Promise<ScrapeResult>
  now?: () => Date
}) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return Response.json({ error: 'method_not_allowed' }, { status: 405, headers: { Allow: 'POST' } })
    const token = options.token()
    if (!token) return Response.json({ error: 'ingest_token_not_configured' }, { status: 500 })
    if (request.headers.get('x-ingest-token') !== token) return Response.json({ error: 'unauthorized' }, { status: 401 })
    if (Number(request.headers.get('content-length')) > 8192) return Response.json({ error: 'request_too_large' }, { status: 413 })
    let body: string
    try { body = await request.text() } catch { return Response.json({ error: 'invalid_request' }, { status: 400 }) }
    if (body.length > 8192) return Response.json({ error: 'request_too_large' }, { status: 413 })
    let value: unknown = {}
    if (body) {
      try { value = JSON.parse(body) } catch { return Response.json({ error: 'invalid_json' }, { status: 400 }) }
    }
    const now = options.now?.() ?? new Date(), input = parseDiningInput(value, now)
    if (!input) return Response.json({ error: 'invalid_request' }, { status: 400 })
    const storage = input.dryRun ? null : options.storage()
    if (!input.dryRun && !storage) return Response.json({ error: 'supabase_not_configured' }, { status: 500 })
    let runId: string | null = null
    const summary: DiningRunSummary = {
      status: 'failed', requestCount: 0, fetchedCount: 0, acceptedCount: 0, skippedCount: 0,
      upsertedCount: 0, deletedCount: 0, issues: [],
    }
    let stage = 'ingestion_run_start_failed'
    try {
      if (storage) runId = await storage.startRun(options.source, input)
      stage = 'menu_scrape_failed'
      const result = await options.scrape(input, now)
      Object.assign(summary, { requestCount: result.requestCount, fetchedCount: result.fetchedCount,
        acceptedCount: result.rows.length, skippedCount: result.skippedCount, issues: result.issues })
      summary.status = result.issues.length ? (result.rows.length ? 'partial' : 'failed') : 'completed'
      if (storage && result.rows.length) {
        stage = 'dining_menus_upsert_failed'
        const upsert = await storage.upsert(result.rows)
        summary.upsertedCount = upsert.count
        if (upsert.error) throw new Error(upsert.error)
      }
      if (storage && input.mode === 'full' && summary.status === 'completed') {
        stage = 'old_dining_menus_cleanup_failed'
        summary.deletedCount = await storage.deleteExpired(options.source, addMenuDays(localMenuDate(now), -7))
      }
      stage = 'ingestion_run_finish_failed'
      if (storage && runId) await storage.finishRun(runId, summary)
      return Response.json({
        status: summary.status === 'completed' ? 'ok' : summary.status,
        source: options.source, mode: input.mode, dryRun: input.dryRun, window: menuWindow(input),
        received: { requests: result.requestCount, menus: result.fetchedCount },
        normalized: { accepted: result.rows.length, skipped: result.skippedCount, sample: result.rows.slice(0, 3) },
        storage: { dryRun: input.dryRun, upserted: summary.upsertedCount },
        cleanup: { removed: summary.deletedCount, retentionDays: 7 }, errors: result.issues,
        ingestionRun: runId ? { id: runId, status: summary.status } : null,
      }, { status: summary.status === 'failed' ? 502 : 200 })
    } catch {
      summary.status = 'failed'
      summary.issues = [...summary.issues, { code: stage }]
      if (storage && runId && stage !== 'ingestion_run_finish_failed') {
        try { await storage.finishRun(runId, summary) } catch {
          return Response.json({ error: stage, reportingError: 'ingestion_run_finish_failed', runId }, { status: 502 })
        }
      }
      return Response.json({ error: stage, runId, storage: { upserted: summary.upsertedCount } }, { status: 502 })
    }
  }
}
