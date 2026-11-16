export type DiningSource = 'nutrislice_sbu' | 'sbu_hospital'
export type DiningInput = { mode: 'smoke' | 'full'; dryRun: boolean; startDate: string; locations: string[] }
export type MenuItem = {
  external_id: string | null
  name: string
  station: string | null
  description: string | null
  ingredients: string | null
  image_url: string | null
  price: string | number | null
  nutrition: Record<string, number | null> | null
  serving_size: { amount: string | number | null; unit: string | null } | null
  labels: string[]
}
export type DiningMenu = {
  source: DiningSource
  external_id: string
  location_slug: string
  location_name: string
  menu_slug: string
  menu_name: string
  menu_date: string
  source_url: string
  items: MenuItem[]
  notices: string[]
  last_synced_at: string
}
export type ScrapeIssue = { code: string; resource?: string }
export type ScrapeResult = {
  rows: DiningMenu[]
  requestCount: number
  fetchedCount: number
  skippedCount: number
  issues: ScrapeIssue[]
}

export const hospitalLocationsUrl = 'https://www.stonybrookmedicine.edu/diningservices/locations'
export const nutrisliceApi = 'https://stonybrook.api.nutrislice.com'

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function textValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function isMenuDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
}

export function localMenuDate(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const part = (type: string) => parts.find(p => p.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function addMenuDays(date: string, days: number): string {
  return new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10)
}

export function parseDiningInput(value: unknown, now: Date): DiningInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const { mode = 'smoke', dryRun = true, startDate = localMenuDate(now), locations = [] } = record(value)
  if ((mode !== 'smoke' && mode !== 'full') || typeof dryRun !== 'boolean' || !isMenuDate(startDate)
    || !Array.isArray(locations) || locations.length > 30
    || !locations.every(v => typeof v === 'string' && /^[a-z0-9-]{1,100}$/.test(v))) return null
  return { mode, dryRun, startDate, locations: [...new Set(locations as string[])] }
}

export function menuWindow(input: DiningInput) {
  return { startsAt: input.startDate, endsAt: addMenuDays(input.startDate, input.mode === 'full' ? 7 : 1) }
}

/** Bound actual streamed bytes, including responses without Content-Length. */
export async function fetchMenuText(url: string, network: typeof fetch, signal: AbortSignal, maxBytes = 12 * 1024 * 1024) {
  const response = await network(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) })
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`upstream_http_${response.status}`)
  }
  if (Number(response.headers.get('content-length')) > maxBytes) {
    await response.body?.cancel()
    throw new Error('upstream_response_too_large')
  }
  if (!response.body) throw new Error('upstream_empty_response')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let size = 0, body = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) throw new Error('upstream_response_too_large')
      body += decoder.decode(value, { stream: true })
    }
    return body + decoder.decode()
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

export function emptyMenuItem(name: string): MenuItem {
  return { external_id: null, name, station: null, description: null, ingredients: null,
    image_url: null, price: null, nutrition: null, serving_size: null, labels: [] }
}

export function issueCode(error: unknown) {
  return error instanceof Error && /^(upstream_|nutrislice_|hospital_)/.test(error.message) ? error.message : 'menu_fetch_or_parse_failed'
}
