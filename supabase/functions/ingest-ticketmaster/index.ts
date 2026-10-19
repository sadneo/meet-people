import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0'
import { normalizeTicketmasterEvent, type NormalizedTicketmasterListing } from '../_shared/normalize-ticketmaster.ts'

const ticketmasterEventsUrl = 'https://app.ticketmaster.com/discovery/v2/events.json'
const newYorkTriStateMarketId = '35'
const smokeWindowDays = 7
const fullWindowDays = 14
const smokePageSize = 20
const fullPageSize = 200
const ticketmasterRequestDelayMs = 250
const eventRetentionDays = 7

type IngestionMode = 'smoke' | 'full'
type TicketmasterPage = { number: number; size: number; totalElements: number; totalPages: number }
type TicketmasterResponse = { _embedded?: { events?: unknown[] }; page: TicketmasterPage }
type LifecycleSummary = { reset_count: number; missed_count: number; inactivated_count: number }

function json(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status })
}

function hasTicketmasterPage(value: unknown): value is TicketmasterResponse {
  if (typeof value !== 'object' || value === null || !('page' in value)) return false
  const page = value.page
  return typeof page === 'object' && page !== null
    && 'number' in page && typeof page.number === 'number'
    && 'size' in page && typeof page.size === 'number'
    && 'totalElements' in page && typeof page.totalElements === 'number'
    && 'totalPages' in page && typeof page.totalPages === 'number'
}

function toTicketmasterDateTime(value: Date) {
  return value.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function getSupabaseClient(): SupabaseClient | null {
  const url = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  return url && serviceRoleKey
    ? createClient(url, serviceRoleKey, { auth: { persistSession: false } })
    : null
}

async function upsertListings(supabase: SupabaseClient, listings: NormalizedTicketmasterListing[]) {
  let count = 0
  for (let start = 0; start < listings.length; start += fullPageSize) {
    const batch = listings.slice(start, start + fullPageSize)
    const { error } = await supabase.from('listings').upsert(batch, { onConflict: 'source,external_id' })
    if (error) {
      console.error('Could not upsert Ticketmaster listings:', error.message)
      return { success: false as const, error: 'listings_upsert_failed', count }
    }
    count += batch.length
  }
  return { success: true as const, count }
}

async function deleteExpiredTicketmasterListings(supabase: SupabaseClient) {
  const cutoff = new Date()
  cutoff.setUTCDate(cutoff.getUTCDate() - eventRetentionDays)
  const cutoffAt = cutoff.toISOString()
  const baseDelete = () => supabase
    .from('listings')
    .delete()
    .eq('source', 'ticketmaster')
    .eq('listing_type', 'event')

  const ended = await baseDelete().lt('ends_at', cutoffAt).select('id')
  if (ended.error) {
    console.error('Could not remove expired Ticketmaster listings:', ended.error.message)
    return { success: false as const, error: 'old_listings_cleanup_failed', count: 0 }
  }

  const started = await baseDelete().is('ends_at', null).lt('starts_at', cutoffAt).select('id')
  if (started.error) {
    console.error('Could not remove expired Ticketmaster listings:', started.error.message)
    return { success: false as const, error: 'old_listings_cleanup_failed', count: ended.data?.length ?? 0 }
  }

  return { success: true as const, count: (ended.data?.length ?? 0) + (started.data?.length ?? 0) }
}

async function reconcileTicketmasterFullSync(
  supabase: SupabaseClient,
  windowStartsAt: string,
  windowEndsAt: string,
  seenExternalIds: string[],
) {
  const { data, error } = await supabase
    .rpc('reconcile_ticketmaster_full_sync', {
      p_window_starts_at: windowStartsAt,
      p_window_ends_at: windowEndsAt,
      p_seen_external_ids: seenExternalIds,
    })
    .single()

  if (error || !data) {
    console.error('Could not reconcile Ticketmaster listing lifecycle:', error?.message)
    return { success: false as const, error: 'ticketmaster_lifecycle_reconciliation_failed' }
  }

  return { success: true as const, summary: data as LifecycleSummary }
}

async function startIngestionRun(supabase: SupabaseClient, mode: IngestionMode, startsAt: string, endsAt: string) {
  const { data, error } = await supabase.from('ingestion_runs').insert({
    source: 'ticketmaster', mode, status: 'running', window_starts_at: startsAt, window_ends_at: endsAt, request_count: 0,
  }).select('id').single()
  if (error || !data) {
    console.error('Could not start Ticketmaster ingestion run:', error?.message)
    return null
  }
  return data.id as string
}

async function finishIngestionRun(supabase: SupabaseClient, runId: string, result: {
  status: 'completed' | 'failed'; requestCount?: number; fetchedCount?: number; acceptedCount?: number
  skippedCount?: number; upsertedCount?: number; resetCount?: number; missedCount?: number
  inactivatedCount?: number; deletedCount?: number; errorCode?: string
}) {
  const { error } = await supabase.from('ingestion_runs').update({
    status: result.status,
    finished_at: new Date().toISOString(),
    request_count: result.requestCount ?? 0,
    fetched_count: result.fetchedCount ?? 0,
    accepted_count: result.acceptedCount ?? 0,
    skipped_count: result.skippedCount ?? 0,
    upserted_count: result.upsertedCount ?? 0,
    reset_count: result.resetCount ?? 0,
    missed_count: result.missedCount ?? 0,
    inactivated_count: result.inactivatedCount ?? 0,
    deleted_count: result.deletedCount ?? 0,
    error_summary: result.errorCode ? [{ code: result.errorCode }] : [],
  }).eq('id', runId)
  if (error) {
    console.error('Could not finish Ticketmaster ingestion run:', error.message)
    return false
  }
  return true
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' })
  const ingestToken = Deno.env.get('INGEST_TOKEN')
  if (!ingestToken) return json(500, { error: 'ingest_token_not_configured' })
  if (request.headers.get('x-ingest-token') !== ingestToken) return json(401, { error: 'unauthorized' })
  const ticketmasterApiKey = Deno.env.get('TICKETMASTER_API_KEY')
  if (!ticketmasterApiKey) return json(500, { error: 'ticketmaster_api_key_not_configured' })

  let input: unknown = {}
  const body = await request.text()
  if (body.length > 0) {
    try { input = JSON.parse(body) } catch { return json(400, { error: 'invalid_json' }) }
  }
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return json(400, { error: 'invalid_request' })
  const { mode = 'smoke', dryRun = true } = input as Record<string, unknown>
  if ((mode !== 'smoke' && mode !== 'full') || typeof dryRun !== 'boolean') return json(400, { error: 'invalid_request' })

  const ingestionMode: IngestionMode = mode
  const now = new Date()
  const endsAt = new Date(now)
  endsAt.setUTCDate(endsAt.getUTCDate() + (ingestionMode === 'full' ? fullWindowDays : smokeWindowDays))
  const windowStartsAt = toTicketmasterDateTime(now)
  const windowEndsAt = toTicketmasterDateTime(endsAt)
  const pageSize = ingestionMode === 'full' ? fullPageSize : smokePageSize
  const supabase = dryRun ? null : getSupabaseClient()
  if (!dryRun && !supabase) return json(500, { error: 'supabase_not_configured' })
  const ingestionRunId = supabase ? await startIngestionRun(supabase, ingestionMode, windowStartsAt, windowEndsAt) : null
  if (supabase && !ingestionRunId) return json(502, { error: 'ingestion_run_start_failed' })

  const events: unknown[] = []
  const queryWindows = [{ startsAt: windowStartsAt, endsAt: windowEndsAt }]
  let totalEvents = 0
  let totalPages = 0
  let requestCount = 0
  const failRun = async (errorCode: string) => {
    if (supabase && ingestionRunId) await finishIngestionRun(supabase, ingestionRunId, {
      status: 'failed', requestCount, fetchedCount: events.length, errorCode,
    })
  }

  for (const queryWindow of queryWindows) {
    let page = 0
    let pagesInWindow = 1

    while (page < pagesInWindow) {
      const url = new URL(ticketmasterEventsUrl)
      url.searchParams.set('apikey', ticketmasterApiKey)
      url.searchParams.set('marketId', newYorkTriStateMarketId)
      url.searchParams.set('countryCode', 'US')
      url.searchParams.set('source', 'ticketmaster')
      url.searchParams.set('startDateTime', queryWindow.startsAt)
      url.searchParams.set('endDateTime', queryWindow.endsAt)
      url.searchParams.set('sort', 'date,asc')
      url.searchParams.set('size', String(pageSize))
      url.searchParams.set('page', String(page))
      requestCount += 1

      let response: Response
      try { response = await fetch(url) } catch {
        await failRun('ticketmaster_unreachable')
        return json(502, { error: 'ticketmaster_unreachable' })
      }
      if (!response.ok) {
        await failRun('ticketmaster_request_failed')
        return json(502, { error: 'ticketmaster_request_failed', upstreamStatus: response.status })
      }
      let payload: unknown
      try { payload = await response.json() } catch {
        await failRun('ticketmaster_invalid_json')
        return json(502, { error: 'ticketmaster_invalid_json' })
      }
      if (!hasTicketmasterPage(payload)) {
        await failRun('ticketmaster_unexpected_response')
        return json(502, { error: 'ticketmaster_unexpected_response' })
      }
      events.push(...(payload._embedded?.events ?? []))
      pagesInWindow = ingestionMode === 'full' ? payload.page.totalPages : 1
      if (page === 0) {
        totalEvents += payload.page.totalElements
        totalPages += pagesInWindow
      }
      page += 1
      if (ingestionMode === 'full') {
        await new Promise((resolve) => setTimeout(resolve, ticketmasterRequestDelayMs))
      }
    }
  }

  const normalized = events.map((event) => normalizeTicketmasterEvent(event, now))
  const accepted = normalized.filter((result) => result.success)
  const skipped = normalized.filter((result) => !result.success)
  const skippedByReason = skipped.reduce<Record<string, number>>((counts, result) => {
    const reason = result.reason
    counts[reason] = (counts[reason] ?? 0) + 1
    return counts
  }, {})

  let removedExpiredListings = 0
  let lifecycle: LifecycleSummary = { reset_count: 0, missed_count: 0, inactivated_count: 0 }
  if (supabase && ingestionRunId) {
    const upsert = await upsertListings(supabase, accepted.map((result) => result.listing))
    if (!upsert.success) {
      await finishIngestionRun(supabase, ingestionRunId, {
        status: 'failed', requestCount, fetchedCount: events.length, acceptedCount: accepted.length,
        skippedCount: skipped.length, upsertedCount: upsert.count, errorCode: upsert.error,
      })
      return json(502, { error: upsert.error })
    }
    const cleanup = await deleteExpiredTicketmasterListings(supabase)
    if (!cleanup.success) {
      await finishIngestionRun(supabase, ingestionRunId, {
        status: 'failed', requestCount, fetchedCount: events.length, acceptedCount: accepted.length,
        skippedCount: skipped.length, upsertedCount: upsert.count, errorCode: cleanup.error,
      })
      return json(502, { error: cleanup.error })
    }
    removedExpiredListings = cleanup.count
    if (ingestionMode === 'full') {
      const reconciliation = await reconcileTicketmasterFullSync(
        supabase,
        windowStartsAt,
        windowEndsAt,
        accepted.map((result) => result.listing.external_id),
      )
      if (!reconciliation.success) {
        await finishIngestionRun(supabase, ingestionRunId, {
          status: 'failed', requestCount, fetchedCount: events.length, acceptedCount: accepted.length,
          skippedCount: skipped.length, upsertedCount: upsert.count, deletedCount: removedExpiredListings,
          errorCode: reconciliation.error,
        })
        return json(502, { error: reconciliation.error })
      }
      lifecycle = reconciliation.summary
    }
    const finished = await finishIngestionRun(supabase, ingestionRunId, {
      status: 'completed', requestCount, fetchedCount: events.length, acceptedCount: accepted.length,
      skippedCount: skipped.length, upsertedCount: upsert.count,
      resetCount: lifecycle.reset_count,
      missedCount: lifecycle.missed_count,
      inactivatedCount: lifecycle.inactivated_count,
      deletedCount: removedExpiredListings,
    })
    if (!finished) return json(502, { error: 'ingestion_run_finish_failed' })
  }

  return json(200, {
    status: 'ok', mode: ingestionMode, dryRun,
    request: { marketId: newYorkTriStateMarketId, startDateTime: windowStartsAt, endDateTime: windowEndsAt, pageSize },
    received: { events: events.length, pages: requestCount, totalEvents, totalPages },
    normalized: { accepted: accepted.length, skipped: skipped.length, skippedByReason, sample: accepted[0]?.listing ?? null },
    storage: { dryRun, upserted: dryRun ? 0 : accepted.length },
    cleanup: { removed: removedExpiredListings, retentionDays: eventRetentionDays },
    lifecycle: {
      reset: lifecycle.reset_count,
      missed: lifecycle.missed_count,
      inactivated: lifecycle.inactivated_count,
    },
    ingestionRun: ingestionRunId ? { id: ingestionRunId, status: 'completed' } : null,
  })
})
