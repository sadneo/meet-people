import { normalizeSbEngagedEvent } from './normalize-sbengaged.ts'
import { parseSbEngagedICal, selectSbEngagedWindow } from './parse-sbengaged-ical.ts'
import { parseSharedSbEngagedSnapshot, type SharedEvent } from './sbengaged-shared-snapshot.ts'
import { readBoundedResponse, retryAfterSeconds } from './sbengaged-photo-worker.ts'

export interface SbEngagedStore {
  begin(mode: string): Promise<{ state: string; token?: string }>
  start(mode: string, starts: string, ends: string): Promise<string>
  upsert(token: string, rows: SharedEvent[]): Promise<number>
  finish(token: string, starts: string, ends: string, seen: string[], full: boolean): Promise<{ deleted: number; photosPending: number; lifecycle: Record<string, number> }>
  report(id: string, summary: Record<string, unknown>): Promise<void>
  release(token: string): Promise<void>
  cooldown(seconds: number): Promise<void>
}
export function createSbEngagedIngestionHandler(options: {
  token: () => string | undefined; mode?: () => string | undefined; store: () => SbEngagedStore
  sharedUrl?: () => string | undefined; sharedToken?: () => string | undefined
  config?: () => Promise<{ mode: string; exportToken: string; sharedUrl: string }>
  network?: typeof fetch; now?: () => Date
}) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return Response.json({ error: 'method_not_allowed' }, { status: 405, headers: { Allow: 'POST' } })
    const token = options.token()
    if (!token) return Response.json({ error: 'ingest_token_not_configured' }, { status: 503 })
    if (request.headers.get('x-ingest-token') !== token) return Response.json({ error: 'unauthorized' }, { status: 401 })
    let runtime: { mode: string; exportToken: string; sharedUrl: string } | undefined
    try { runtime = await options.config?.() }
    catch { return Response.json({ error: 'source_mode_not_configured' }, { status: 503 }) }
    const sourceMode = runtime?.mode ?? options.mode?.()
    if (sourceMode !== 'producer' && sourceMode !== 'mirror') return Response.json({ error: 'source_mode_not_configured' }, { status: 503 })
    let mode: 'full' | 'smoke', dryRun: boolean
    try {
      if (Number(request.headers.get('content-length')) > 8192) throw new Error()
      const body = await request.text()
      if (body.length > 8192) throw new Error()
      const input = body ? JSON.parse(body) : {}
      if (!input || Array.isArray(input) || typeof input !== 'object' || !['full', 'smoke'].includes(input.mode ?? 'smoke')
        || typeof (input.dryRun ?? true) !== 'boolean' || (input.refreshDetails !== undefined && input.refreshDetails !== false)
        || Object.keys(input).some(key => !['mode', 'dryRun', 'refreshDetails'].includes(key))) throw new Error()
      mode = input.mode ?? 'smoke'; dryRun = input.dryRun ?? true
    } catch { return Response.json({ error: 'invalid_request_use_paced_photo_queue' }, { status: 400 }) }
    const now = options.now?.() ?? new Date(), network = options.network ?? fetch
    let starts = now.toISOString(), ends = new Date(now.getTime() + 30 * 86400000).toISOString()
    let store: SbEngagedStore | undefined, lease: string | undefined, runId: string | undefined
    let requests = 0, fetched = 0, upserted = 0
    try {
      if (!dryRun) {
        store = options.store()
        const claimed = await store.begin(sourceMode)
        if (claimed.state !== 'claimed') return Response.json({ status: claimed.state, source: 'sbengaged', sourceMode })
        if (!claimed.token) throw new Error('sync_lease_unavailable')
        lease = claimed.token
        runId = await store.start(mode, starts, ends)
      }
      let rows: SharedEvent[]
      const signal = AbortSignal.timeout(30_000)
      if (sourceMode === 'mirror') {
        const url = runtime?.sharedUrl ?? options.sharedUrl?.(), exportToken = runtime?.exportToken ?? options.sharedToken?.()
        if (url !== 'https://wacgxhsdhrqigrmqaonc.supabase.co/functions/v1/export-sbengaged' || !exportToken) throw new Error('shared_source_not_configured')
        requests++
        const response = await network(url, { method: 'POST', redirect: 'error', signal,
          headers: { 'Content-Type': 'application/json', 'x-export-token': exportToken }, body: '{}' })
        if (!response.ok) { await response.body?.cancel(); throw new Error('shared_source_unavailable') }
        const snapshot = parseSharedSbEngagedSnapshot(JSON.parse(await readBoundedResponse(response, 16 * 1024 * 1024)), now.getTime())
        rows = snapshot.events; starts = snapshot.window.startsAt; ends = snapshot.window.endsAt; fetched = rows.length
      } else {
        let calendarUrl = 'https://sbengaged.stonybrook.edu/ical/stonybrook/ical_stonybrook.ics'
        let response: Response | undefined
        for (let redirects = 0; redirects <= 2; redirects++) {
          requests++
          response = await network(calendarUrl, { signal, redirect: 'manual' })
          if (![301, 302, 303, 307, 308].includes(response.status)) break
          const location = response.headers.get('location')
          await response.body?.cancel()
          const next = location ? new URL(location, calendarUrl) : null
          if (redirects === 2 || !next || !['https://sbengaged.stonybrook.edu', 'https://static-prod-us-east-1.campusgroups.com'].includes(next.origin)
            || next.pathname !== '/ical/stonybrook/ical_stonybrook.ics' || next.username || next.password || next.search) throw new Error('calendar_redirect_rejected')
          calendarUrl = next.href
        }
        if (!response) throw new Error('calendar_unavailable')
        if (response.status === 429 || response.status === 403) {
          if (store) await store.cooldown(Math.max(response.status === 403 ? 3600 : 300, retryAfterSeconds(response.headers.get('retry-after'), now.getTime())))
          await response.body?.cancel(); throw new Error('source_rate_limited')
        }
        if (!response.ok) { await response.body?.cancel(); throw new Error('calendar_unavailable') }
        const text = await readBoundedResponse(response, 16 * 1024 * 1024)
        if (!text.trimStart().startsWith('BEGIN:VCALENDAR') || !text.trimEnd().endsWith('END:VCALENDAR')
          || (text.match(/^BEGIN:VEVENT\r?$/gm)?.length ?? 0) !== (text.match(/^END:VEVENT\r?$/gm)?.length ?? 0)) throw new Error('incomplete_calendar')
        const events = selectSbEngagedWindow(parseSbEngagedICal(text), starts, ends)
        fetched = events.length
        rows = events.map(event => {
          const normalized = normalizeSbEngagedEvent(event, now)
          if (!normalized.success) throw new Error('calendar_event_invalid')
          return normalized.listing
        })
        if (!rows.length) throw new Error('empty_calendar_window')
      }
      if (new Set(rows.map(row => row.external_id)).size !== rows.length) throw new Error('duplicate_calendar_events')
      if (mode === 'smoke') rows = rows.slice(0, 20)
      if (store && lease && runId) {
        for (let offset = 0; offset < rows.length; offset += 100) upserted += await store.upsert(lease, rows.slice(offset, offset + 100))
        const result = await store.finish(lease, starts, ends, rows.map(row => row.external_id), mode === 'full')
        await store.report(runId, { status: 'completed', finished_at: new Date().toISOString(), request_count: requests,
          fetched_count: fetched, accepted_count: rows.length, skipped_count: 0, upserted_count: upserted, deleted_count: result.deleted,
          reset_count: result.lifecycle.reset_count ?? 0, missed_count: result.lifecycle.missed_count ?? 0,
          inactivated_count: result.lifecycle.inactivated_count ?? 0, error_summary: [] })
        return Response.json({ status: 'ok', source: 'sbengaged', sourceMode, mode, dryRun, window: { startsAt: starts, endsAt: ends },
          received: { requests, events: fetched }, storage: { upserted }, cleanup: { removed: result.deleted, retentionDays: 2 },
          enrichment: { state: sourceMode === 'producer' ? 'queued' : 'shared', pending: result.photosPending, upstreamPhotoRequests: 0 }, ingestionRun: { id: runId, status: 'completed' } })
      }
      return Response.json({ status: 'ok', sourceMode, dryRun, mode, window: { startsAt: starts, endsAt: ends }, received: { requests, events: fetched }, storage: { upserted: 0 }, enrichment: { state: 'not_requested', upstreamPhotoRequests: 0 } })
    } catch (error) {
      const allowed = ['sync_lease_unavailable', 'shared_source_not_configured', 'shared_source_unavailable', 'source_rate_limited',
        'calendar_unavailable', 'calendar_redirect_rejected', 'incomplete_calendar', 'calendar_event_invalid', 'empty_calendar_window', 'duplicate_calendar_events', 'source_response_too_large', 'invalid_shared_snapshot', 'invalid_shared_event']
      const code = error instanceof Error && allowed.includes(error.message) ? error.message : 'event_sync_failed'
      if (store && runId) {
        try { await store.report(runId, { status: 'failed', finished_at: new Date().toISOString(), request_count: requests, fetched_count: fetched,
          accepted_count: 0, skipped_count: 0, upserted_count: upserted, error_summary: [{ code }] }) } catch { /* HTTP failure still reports the uncertain run. */ }
      }
      return Response.json({ error: code, runId }, { status: 502 })
    } finally {
      if (store && lease) { try { await store.release(lease) } catch { /* Lease expiry fences future attempts. */ } }
    }
  }
}
