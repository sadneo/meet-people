export type SbEngagedListing = {
  listing_type: 'event'
  title: string
  description: string | null
  category: string | null
  starts_at: string
  ends_at: string | null
  location_name: string | null
  address: null
  city: null
  region: null
  postal_code: null
  latitude: null
  longitude: null
  image_url: string | null
  status: 'active'
  source: 'sbengaged'
  external_id: string
  source_url: string
  last_synced_at: string
}

export type SbEngagedNormalizationResult =
  | { success: true; listing: SbEngagedListing }
  | { success: false; reason: 'missing_event_id' | 'missing_event_name' | 'missing_start_time' }

export type SbEngagedFeedEvent = {
  summary?: string
  description?: string
  startsAt?: string
  endsAt?: string
  location?: string
  eventType?: string
  url?: string
}

function cleanText(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function privateLocation(value: string) {
  return /sign in to (download|display) the location|private location|register to receive location details/i.test(value)
}

function canonicalEventUrl(value: string | undefined) {
  const raw = cleanText(value)
  if (!raw) return null

  try {
    const url = new URL(raw, 'https://sbengaged.stonybrook.edu')
    const id = url.searchParams.get('id')
    return id && /^\d+$/.test(id)
      ? { externalId: id, sourceUrl: `https://sbengaged.stonybrook.edu/rsvp?id=${id}` }
      : null
  } catch {
    return null
  }
}

export function normalizeSbEngagedEvent(
  event: SbEngagedFeedEvent,
  syncedAt = new Date(),
  imageUrl: string | null = null,
): SbEngagedNormalizationResult {
  const identity = canonicalEventUrl(event.url)
  if (!identity) return { success: false, reason: 'missing_event_id' }

  const title = cleanText(event.summary)
  if (!title) return { success: false, reason: 'missing_event_name' }

  const startsAt = cleanText(event.startsAt)
  if (!startsAt || Number.isNaN(Date.parse(startsAt))) return { success: false, reason: 'missing_start_time' }

  const rawEndsAt = cleanText(event.endsAt)
  const endsAt = rawEndsAt && !Number.isNaN(Date.parse(rawEndsAt)) && rawEndsAt >= startsAt ? rawEndsAt : null
  const location = cleanText(event.location)

  return {
    success: true,
    listing: {
      listing_type: 'event',
      title,
      description: cleanText(event.description),
      category: cleanText(event.eventType),
      starts_at: new Date(startsAt).toISOString(),
      ends_at: endsAt ? new Date(endsAt).toISOString() : null,
      location_name: location && !privateLocation(location) ? location : null,
      address: null,
      city: null,
      region: null,
      postal_code: null,
      latitude: null,
      longitude: null,
      image_url: imageUrl,
      status: 'active',
      source: 'sbengaged',
      external_id: identity.externalId,
      source_url: identity.sourceUrl,
      last_synced_at: syncedAt.toISOString(),
    },
  }
}
