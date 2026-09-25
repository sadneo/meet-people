import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0'
import { extractSbEngagedDetailImage } from '../_shared/extract-sbengaged-detail.ts'
import { normalizeSbEngagedEvent, type SbEngagedListing } from '../_shared/normalize-sbengaged.ts'
import { parseSbEngagedICal } from '../_shared/parse-sbengaged-ical.ts'

const feedUrl = 'https://sbengaged.stonybrook.edu/ical/stonybrook/ical_stonybrook.ics'
const source = 'sbengaged'
const smokeLimit = 20
const smokeDetailLimit = 5
const fullDetailLimit = 25
const detailConcurrency = 4
const detailsRefreshMs = 6 * 60 * 60 * 1000
const eventRetentionDays = 7
const maxFeedBytes = 10 * 1024 * 1024

type IngestionMode = 'smoke' | 'full'
type LifecycleSummary = { reset_count: number; missed_count: number; inactivated_count: number }
type ExistingListing = { external_id: string; image_url: string | null; details_synced_at: string | null }
type DetailResult = { externalId: string; success: true; imageUrl: string | null } | { externalId: string; success: false }

function json(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status })
}

function getSupabaseClient(): SupabaseClient | null {
  const url = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  return url && serviceRoleKey
    ? createClient(url, serviceRoleKey, { auth: { persistSession: false } })
    : null
}

function detailUrl(listing: SbEngagedListing) {
  return listing.source_url.replace('/rsvp?', '/rsvp_boot?')
}

function shouldRefreshDetails(existing: ExistingListing | undefined, now: Date) {
  if (!existing?.details_synced_at) return true
  const syncedAt = Date.parse(existing.details_synced_at)
  return Number.isNaN(syncedAt) || now.getTime() - syncedAt >= detailsRefreshMs
}

async function fetchDetail(externalId: string, url: string): Promise<DetailResult> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
      if (response.ok) return { externalId, success: true, imageUrl: extractSbEngagedDetailImage(await response.text()) }
      if (attempt === 0 && (response.status === 429 || response.status >= 500)) {
        const retryAfter = Number(response.headers.get('retry-after'))
        await new Promise((resolve) => setTimeout(resolve, Number.isFinite(retryAfter) ? retryAfter * 1000 : 500))
        continue
      }
    } catch {
      if (attempt === 0) continue
    }
    break
  }
  return { externalId, success: false }
}

async function fetchDetails(listings: SbEngagedListing[]) {
  const results: DetailResult[] = []
  for (let start = 0; start < listings.length; start += detailConcurrency) {
    results.push(...await Promise.all(listings.slice(start, start + detailConcurrency)
      .map((listing) => fetchDetail(listing.external_id, detailUrl(listing)))))
  }
  return results
}

async function existingListings(supabase: SupabaseClient, externalIds: string[]) {
  const rows = new Map<string, ExistingListing>()
  for (let start = 0; start < externalIds.length; start += 200) {
    const { data, error } = await supabase.from('listings')
      .select('external_id,image_url,details_synced_at')
      .eq('source', source)
      .in('external_id', externalIds.slice(start, start + 200))
    if (error) return { success: false as const, error: 'existing_listings_fetch_failed' }
    for (const row of data ?? []) rows.set(row.external_id, row as ExistingListing)
  }
  return { success: true as const, rows }
}

async function upsertListings(supabase: SupabaseClient, listings: Array<SbEngagedListing & { details_synced_at: string | null }>) {
  const { error } = await supabase.from('listings').upsert(listings, { onConflict: 'source,external_id' })
  return error ? { success: false as const, error: 'listings_upsert_failed' } : { success: true as const }
}

async function deleteExpiredListings(supabase: SupabaseClient) {
  const cutoff = new Date()
  cutoff.setUTCDate(cutoff.getUTCDate() - eventRetentionDays)
  const cutoffAt = cutoff.toISOString()
  const base = () => supabase.from('listings').delete().eq('source', source).eq('listing_type', 'event')
  const ended = await base().lt('ends_at', cutoffAt).select('id')
  if (ended.error) return { success: false as const, error: 'old_listings_cleanup_failed' }
  const started = await base().is('ends_at', null).lt('starts_at', cutoffAt).select('id')
  if (started.error) return { success: false as const, error: 'old_listings_cleanup_failed' }
  return { success: true as const, count: (ended.data?.length ?? 0) + (started.data?.length ?? 0) }
}

async function reconcileFullSync(supabase: SupabaseClient, startsAt: string, endsAt: string, externalIds: string[]) {
  const { data, error } = await supabase.rpc('reconcile_sbengaged_full_sync', {
    p_window_starts_at: startsAt, p_window_ends_at: endsAt, p_seen_external_ids: externalIds,
  }).single()
  return error || !data
    ? { success: false as const, error: 'sbengaged_lifecycle_reconciliation_failed' }
    : { success: true as const, summary: data as LifecycleSummary }
}

async function startRun(supabase: SupabaseClient, mode: IngestionMode, startsAt: string, endsAt: string) {
  const { data, error } = await supabase.from('ingestion_runs').insert({
    source, mode, status: 'running', window_starts_at: startsAt, window_ends_at: endsAt,
  }).select('id').single()
  return error || !data ? null : data.id as string
}

async function finishRun(supabase: SupabaseClient, id: string, result: {
  status: 'completed' | 'partial' | 'failed'; requestCount: number; fetchedCount: number; acceptedCount: number
  skippedCount: number; upsertedCount: number; deletedCount?: number; lifecycle?: LifecycleSummary; errors?: string[]
}) {
  await supabase.from('ingestion_runs').update({
    status: result.status, finished_at: new Date().toISOString(), request_count: result.requestCount,
    fetched_count: result.fetchedCount, accepted_count: result.acceptedCount, skipped_count: result.skippedCount,
    upserted_count: result.upsertedCount, deleted_count: result.deletedCount ?? 0,
    reset_count: result.lifecycle?.reset_count ?? 0, missed_count: result.lifecycle?.missed_count ?? 0,
    inactivated_count: result.lifecycle?.inactivated_count ?? 0,
    error_summary: (result.errors ?? []).map((code) => ({ code })),
  }).eq('id', id)
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' })
  const token = Deno.env.get('INGEST_TOKEN')
  if (!token) return json(500, { error: 'ingest_token_not_configured' })
  if (request.headers.get('x-ingest-token') !== token) return json(401, { error: 'unauthorized' })

  let input: Record<string, unknown> = {}
  const body = await request.text()
  if (body) {
    try { input = JSON.parse(body) as Record<string, unknown> } catch { return json(400, { error: 'invalid_json' }) }
  }
  const mode = input.mode ?? 'smoke'
  const dryRun = input.dryRun ?? true
  if ((mode !== 'smoke' && mode !== 'full') || typeof dryRun !== 'boolean') return json(400, { error: 'invalid_request' })

  const now = new Date()
  const windowEnds = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const windowStartsAt = now.toISOString()
  const windowEndsAt = windowEnds.toISOString()
  const supabase = dryRun ? null : getSupabaseClient()
  if (!dryRun && !supabase) return json(500, { error: 'supabase_not_configured' })
  const runId = supabase ? await startRun(supabase, mode, windowStartsAt, windowEndsAt) : null
  if (supabase && !runId) return json(502, { error: 'ingestion_run_start_failed' })

  let response: Response
  try { response = await fetch(feedUrl, { signal: AbortSignal.timeout(30_000) }) } catch {
    if (supabase && runId) await finishRun(supabase, runId, { status: 'failed', requestCount: 1, fetchedCount: 0, acceptedCount: 0, skippedCount: 0, upsertedCount: 0, errors: ['sbengaged_feed_unreachable'] })
    return json(502, { error: 'sbengaged_feed_unreachable' })
  }
  if (!response.ok || Number(response.headers.get('content-length')) > maxFeedBytes) {
    if (supabase && runId) await finishRun(supabase, runId, { status: 'failed', requestCount: 1, fetchedCount: 0, acceptedCount: 0, skippedCount: 0, upsertedCount: 0, errors: ['sbengaged_feed_request_failed'] })
    return json(502, { error: 'sbengaged_feed_request_failed' })
  }
  const feed = await response.text()
  if (feed.length > maxFeedBytes || !feed.includes('BEGIN:VCALENDAR')) {
    if (supabase && runId) await finishRun(supabase, runId, { status: 'failed', requestCount: 1, fetchedCount: 0, acceptedCount: 0, skippedCount: 0, upsertedCount: 0, errors: ['sbengaged_invalid_feed'] })
    return json(502, { error: 'sbengaged_invalid_feed' })
  }

  const feedEvents = parseSbEngagedICal(feed)
  const inWindow = feedEvents.filter((event) => event.startsAt && event.startsAt >= windowStartsAt && event.startsAt < windowEndsAt)
    .sort((left, right) => (left.startsAt ?? '').localeCompare(right.startsAt ?? ''))
  const selected = mode === 'smoke' ? inWindow.slice(0, smokeLimit) : inWindow
  const baseResults = selected.map((event) => normalizeSbEngagedEvent(event, now))
  const accepted = baseResults.filter((result): result is Extract<typeof result, { success: true }> => result.success)
  const skipped = baseResults.filter((result): result is Extract<typeof result, { success: false }> => !result.success)

  let existing = new Map<string, ExistingListing>()
  if (supabase && accepted.length) {
    const found = await existingListings(supabase, accepted.map((result) => result.listing.external_id))
    if (!found.success) {
      if (runId) await finishRun(supabase, runId, { status: 'failed', requestCount: 1, fetchedCount: selected.length, acceptedCount: accepted.length, skippedCount: skipped.length, upsertedCount: 0, errors: [found.error] })
      return json(502, { error: found.error })
    }
    existing = found.rows
  }
  const detailLimit = mode === 'smoke' ? smokeDetailLimit : fullDetailLimit
  const detailCandidates = accepted.map((result) => result.listing)
    .filter((listing) => shouldRefreshDetails(existing.get(listing.external_id), now))
    .slice(0, detailLimit)
  const detailResults = await fetchDetails(detailCandidates)
  const details = new Map(detailResults.filter((result): result is Extract<DetailResult, { success: true }> => result.success)
    .map((result) => [result.externalId, result]))
  const detailFailures = detailResults.filter((result) => !result.success).length
  const rows = accepted.map(({ listing }) => {
    const detail = details.get(listing.external_id)
    const prior = existing.get(listing.external_id)
    return {
      ...listing,
      image_url: detail ? detail.imageUrl : prior?.image_url ?? null,
      details_synced_at: detail ? now.toISOString() : prior?.details_synced_at ?? null,
    }
  })

  let deletedCount = 0
  let lifecycle: LifecycleSummary = { reset_count: 0, missed_count: 0, inactivated_count: 0 }
  const errors = detailFailures ? ['sbengaged_detail_enrichment_failed'] : []
  if (supabase && runId) {
    const upsert = await upsertListings(supabase, rows)
    if (!upsert.success) {
      await finishRun(supabase, runId, { status: 'failed', requestCount: 1 + detailResults.length, fetchedCount: selected.length, acceptedCount: accepted.length, skippedCount: skipped.length, upsertedCount: 0, errors: [upsert.error] })
      return json(502, { error: upsert.error })
    }
    const cleanup = await deleteExpiredListings(supabase)
    if (!cleanup.success) {
      await finishRun(supabase, runId, { status: 'failed', requestCount: 1 + detailResults.length, fetchedCount: selected.length, acceptedCount: accepted.length, skippedCount: skipped.length, upsertedCount: rows.length, errors: [cleanup.error] })
      return json(502, { error: cleanup.error })
    }
    deletedCount = cleanup.count
    if (mode === 'full') {
      const reconciliation = await reconcileFullSync(supabase, windowStartsAt, windowEndsAt, rows.map((row) => row.external_id))
      if (!reconciliation.success) {
        await finishRun(supabase, runId, { status: 'failed', requestCount: 1 + detailResults.length, fetchedCount: selected.length, acceptedCount: accepted.length, skippedCount: skipped.length, upsertedCount: rows.length, deletedCount, errors: [reconciliation.error] })
        return json(502, { error: reconciliation.error })
      }
      lifecycle = reconciliation.summary
    }
    await finishRun(supabase, runId, {
      status: detailFailures ? 'partial' : 'completed', requestCount: 1 + detailResults.length,
      fetchedCount: selected.length, acceptedCount: accepted.length, skippedCount: skipped.length,
      upsertedCount: rows.length, deletedCount, lifecycle, errors,
    })
  }

  return json(200, {
    status: detailFailures ? 'partial' : 'ok', mode, dryRun,
    window: { startsAt: windowStartsAt, endsAt: windowEndsAt },
    received: { feedEvents: feedEvents.length, inWindow: inWindow.length, selected: selected.length },
    normalized: { accepted: accepted.length, skipped: skipped.length },
    enrichment: { requested: detailResults.length, succeeded: details.size, failed: detailFailures },
    storage: { dryRun, upserted: dryRun ? 0 : rows.length }, cleanup: { removed: deletedCount, retentionDays: eventRetentionDays },
    lifecycle: { reset: lifecycle.reset_count, missed: lifecycle.missed_count, inactivated: lifecycle.inactivated_count },
    ingestionRun: runId ? { id: runId, status: detailFailures ? 'partial' : 'completed' } : null,
  })
})
