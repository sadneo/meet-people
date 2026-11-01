import { extractSbEngagedDetailImage } from './extract-sbengaged-detail.ts'

export type ExistingSbEngagedDetail = { external_id: string; image_url: string | null; details_synced_at: string | null }
export type SbEngagedDetail = { externalId: string; success: true; imageUrl: string | null; attempts: number } | { externalId: string; success: false; attempts: number }
const refreshMs = 6 * 60 * 60 * 1000

export function selectSbEngagedDetails<T extends { external_id: string }>(listings: T[], existing: Map<string, ExistingSbEngagedDetail>, now: Date, limit: number): T[] {
  const age = (id: string) => Date.parse(existing.get(id)?.details_synced_at ?? '')
  const priority = (id: string) => !Number.isFinite(age(id)) ? 0 : !existing.get(id)?.image_url ? 1 : 2
  return listings.filter(row => !Number.isFinite(age(row.external_id)) || now.getTime() - age(row.external_id) >= refreshMs)
    .sort((a, b) => priority(a.external_id) - priority(b.external_id) || (age(a.external_id) || 0) - (age(b.external_id) || 0))
    .slice(0, limit)
}

export function enrichedSbEngagedImage(prior: ExistingSbEngagedDetail | undefined, detail: SbEngagedDetail | undefined, now: Date) {
  return {
    image_url: detail?.success && detail.imageUrl ? detail.imageUrl : prior?.image_url ?? null,
    details_synced_at: detail?.success ? now.toISOString() : prior?.details_synced_at ?? null,
  }
}

export async function fetchSbEngagedDetails(ids: string[], budgetMs = 45_000, load: (id: string) => Promise<SbEngagedDetail> = fetchSbEngagedDetail, clock = Date.now) {
  const started = clock(), results: SbEngagedDetail[] = []
  for (let start = 0; start < ids.length && clock() - started < budgetMs; start += 4) {
    results.push(...await Promise.all(ids.slice(start, start + 4).map(id => load(id))))
  }
  return results
}

export async function fetchSbEngagedDetail(externalId: string, network: typeof fetch = fetch, pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))): Promise<SbEngagedDetail> {
  if (!/^\d+$/.test(externalId)) return { externalId, success: false, attempts: 0 }
  let requests = 0
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      let url = `https://sbengaged.stonybrook.edu/rsvp_boot?id=${externalId}`
      const signal = AbortSignal.timeout(10_000)
      let response: Response | undefined
      for (let redirects = 0; redirects <= 3; redirects++) {
        requests++
        response = await network(url, { signal, redirect: 'manual' })
        if (![301, 302, 303, 307, 308].includes(response.status)) break
        const location = response.headers.get('location')
        await response.body?.cancel()
        const next = location ? new URL(location, url) : null
        if (redirects === 3 || !next || next.origin !== 'https://sbengaged.stonybrook.edu' || next.username || next.password) return { externalId, success: false, attempts: requests }
        url = next.href
      }
      if (!response) return { externalId, success: false, attempts: requests }
      if (response.ok) {
        const html = await response.text()
        if (html.length <= 2 * 1024 * 1024) return { externalId, success: true, imageUrl: extractSbEngagedDetailImage(html), attempts: requests }
      } else if (attempt === 1 && (response.status === 429 || response.status >= 500)) {
        const retryAfter = response.headers.get('retry-after'), seconds = retryAfter === null ? NaN : Number(retryAfter)
        await response.body?.cancel()
        await pause(Number.isFinite(seconds) && seconds >= 0 ? Math.min(seconds * 1000, 5000) : 500)
        continue
      }
    } catch {
      if (attempt === 1) continue
    }
    return { externalId, success: false, attempts: requests }
  }
  return { externalId, success: false, attempts: requests }
}
