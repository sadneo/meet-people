import { validSbEngagedImageUrl } from './extract-sbengaged-detail.ts'

export type SharedEvent = {
  listing_type: 'event'; source: 'sbengaged'; external_id: string; title: string; description: string | null; category: string | null
  starts_at: string; ends_at: string | null; location_name: string | null; source_url: string; last_synced_at: string
  status: string; image_url?: string | null; details_synced_at?: string | null
}
export type SharedSnapshot = { version: 1; complete: true; generatedAt: string; window: { startsAt: string; endsAt: string }; events: SharedEvent[] }
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const date = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))
export function parseSharedSbEngagedSnapshot(raw: unknown, now: number): SharedSnapshot {
  const value = record(raw), window = record(value.window)
  if (value.version !== 1 || value.complete !== true || !date(value.generatedAt) || Date.parse(value.generatedAt) < now - 3 * 3600000
    || Date.parse(value.generatedAt) > now + 300000 || !date(window.startsAt) || !date(window.endsAt)
    || Date.parse(window.endsAt) - Date.parse(window.startsAt) > 31 * 86400000 || Date.parse(window.endsAt) <= now
    || Date.parse(window.endsAt) <= Date.parse(window.startsAt) || !Array.isArray(value.events) || value.events.length > 20000) throw new Error('invalid_shared_snapshot')
  const seen = new Set<string>()
  const events = value.events.map(raw => {
    const row = record(raw)
    if (row.source !== 'sbengaged' || row.listing_type !== 'event' || typeof row.external_id !== 'string' || !/^\d+$/.test(row.external_id)
      || seen.has(row.external_id) || typeof row.title !== 'string' || !row.title.trim() || row.title.length > 20000
      || !date(row.starts_at) || !(row.ends_at === null || date(row.ends_at)) || !date(row.last_synced_at)
      || (date(row.ends_at) && Date.parse(row.ends_at) < Date.parse(row.starts_at))
      || row.source_url !== `https://sbengaged.stonybrook.edu/rsvp?id=${row.external_id}`
      || !['active', 'rescheduled', 'inactive', 'cancelled', 'postponed', 'offsale'].includes(String(row.status))
      || !['description', 'category', 'location_name'].every(key => row[key] === null || typeof row[key] === 'string')
      || !(row.image_url === null || (typeof row.image_url === 'string' && validSbEngagedImageUrl(row.image_url)))
      || !(row.details_synced_at === null || date(row.details_synced_at))) throw new Error('invalid_shared_event')
    seen.add(row.external_id)
    // Copy a fixed public allowlist, never IDs, people, queue or account data.
    return { listing_type: 'event', source: 'sbengaged', external_id: row.external_id, title: row.title,
      description: row.description, category: row.category, starts_at: row.starts_at, ends_at: row.ends_at,
      location_name: row.location_name, source_url: row.source_url, last_synced_at: row.last_synced_at, status: row.status,
      image_url: row.image_url, details_synced_at: row.details_synced_at } as SharedEvent
  })
  return { version: 1, complete: true, generatedAt: value.generatedAt, window: { startsAt: window.startsAt, endsAt: window.endsAt }, events }
}
