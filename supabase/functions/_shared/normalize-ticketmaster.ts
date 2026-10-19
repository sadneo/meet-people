export type ListingStatus = 'active' | 'offsale' | 'cancelled' | 'postponed' | 'rescheduled'

export type NormalizedTicketmasterListing = {
  listing_type: 'event'
  title: string
  description: string | null
  category: string | null
  starts_at: string | null
  ends_at: string | null
  location_name: string | null
  address: string | null
  city: string | null
  region: string | null
  postal_code: string | null
  latitude: number | null
  longitude: number | null
  image_url: string | null
  status: ListingStatus
  source: 'ticketmaster'
  external_id: string
  source_url: string | null
  last_synced_at: string
}

export type TicketmasterNormalizationResult =
  | { success: true; listing: NormalizedTicketmasterListing }
  | { success: false; reason: 'missing_event_id' | 'missing_event_name' }

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readPath(value: unknown, path: string[]): unknown {
  let current: unknown = value

  for (const key of path) {
    const record = asRecord(current)

    if (!record) {
      return undefined
    }

    current = record[key]
  }

  return current
}

function parseTimestamp(value: unknown): string | null {
  const raw = asString(value)

  if (!raw) {
    return null
  }

  const timestamp = Date.parse(raw)
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString()
}

function parseCoordinates(event: Record<string, unknown>) {
  const venues = asArray(readPath(event, ['_embedded', 'venues']))
  const firstVenue = asRecord(venues[0])
  const location = firstVenue ? asRecord(firstVenue.location) : null
  const latitude = Number(location?.latitude)
  const longitude = Number(location?.longitude)

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
    || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return { latitude: null, longitude: null }
  }

  return { latitude, longitude }
}

function firstVenue(event: Record<string, unknown>) {
  return asRecord(asArray(readPath(event, ['_embedded', 'venues']))[0])
}

function chooseImage(value: unknown): string | null {
  const images = asArray(value)
    .map(asRecord)
    .filter((image): image is Record<string, unknown> => image !== null)
    .map((image) => ({
      fallback: image.fallback === true,
      height: typeof image.height === 'number' ? image.height : 0,
      ratio: image.ratio,
      url: asString(image.url),
      width: typeof image.width === 'number' ? image.width : 0,
    }))
    .filter((image): image is { fallback: boolean; height: number; ratio: unknown; url: string; width: number } => image.url !== null)

  const preferred = images.filter((image) => !image.fallback && image.ratio === '16_9')
  const candidates = preferred.length > 0 ? preferred : images.filter((image) => !image.fallback)
  const ranked = candidates.length > 0 ? candidates : images

  return ranked.sort((left, right) => (right.width * right.height) - (left.width * left.height))[0]?.url ?? null
}

function ticketmasterStatus(value: unknown): ListingStatus {
  switch (asString(value)?.toLowerCase()) {
    case 'canceled':
    case 'cancelled':
      return 'cancelled'
    case 'postponed':
      return 'postponed'
    case 'rescheduled':
      return 'rescheduled'
    case 'offsale':
      return 'offsale'
    default:
      return 'active'
  }
}

function primaryCategory(event: Record<string, unknown>): string | null {
  const classifications = asArray(event.classifications).map(asRecord)
  const primary = classifications.find((classification) => classification?.primary === true) ?? classifications[0]

  return asString(primary ? readPath(primary, ['segment', 'name']) : undefined)
}

export function normalizeTicketmasterEvent(
  input: unknown,
  syncedAt = new Date(),
): TicketmasterNormalizationResult {
  const event = asRecord(input)

  if (!event) {
    return { success: false, reason: 'missing_event_id' }
  }

  const externalId = asString(event.id)

  if (!externalId) {
    return { success: false, reason: 'missing_event_id' }
  }

  const title = asString(event.name)

  if (!title) {
    return { success: false, reason: 'missing_event_name' }
  }

  const venue = firstVenue(event)
  const start = parseTimestamp(readPath(event, ['dates', 'start', 'dateTime']))
  const rawEnd = parseTimestamp(readPath(event, ['dates', 'end', 'dateTime']))
  const endsAt = start && rawEnd && rawEnd < start ? null : rawEnd
  const coordinates = parseCoordinates(event)

  return {
    success: true,
    listing: {
      listing_type: 'event',
      title,
      description: asString(event.description) ?? asString(event.info),
      category: primaryCategory(event),
      starts_at: start,
      ends_at: endsAt,
      location_name: asString(venue?.name),
      address: asString(readPath(venue, ['address', 'line1'])),
      city: asString(readPath(venue, ['city', 'name'])),
      region: asString(readPath(venue, ['state', 'stateCode'])) ?? asString(readPath(venue, ['state', 'name'])),
      postal_code: asString(venue?.postalCode),
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      image_url: chooseImage(event.images),
      status: ticketmasterStatus(readPath(event, ['dates', 'status', 'code'])),
      source: 'ticketmaster',
      external_id: externalId,
      source_url: asString(event.url),
      last_synced_at: syncedAt.toISOString(),
    },
  }
}
