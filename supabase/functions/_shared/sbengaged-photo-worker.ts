import { validSbEngagedImageUrl } from './extract-sbengaged-detail.ts'

export type PhotoResult = { outcome: 'photo' | 'no_photo' | 'unavailable' | 'failed' | 'rate_limited'; image: string | null; httpStatus: number; retrySeconds: number }
export function retryAfterSeconds(value: string | null, now = Date.now()) {
  const seconds = value && /^\d+$/.test(value.trim()) ? Number(value) : value ? (Date.parse(value) - now) / 1000 : NaN
  return Number.isFinite(seconds) ? Math.min(2147483647, Math.max(1, Math.ceil(seconds))) : 300
}

export async function fetchSbEngagedPhoto(externalId: string, network: typeof fetch = fetch): Promise<PhotoResult> {
  const failure: PhotoResult = { outcome: 'failed', image: null, httpStatus: 0, retrySeconds: 300 }
  if (!/^\d+$/.test(externalId)) return failure
  try {
    const id = btoa(`stonybrook:Event:${externalId}`)
    const response = await network('https://sbengaged.stonybrook.edu/api/v2/graphql', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'query EventPoster($id: ID!) { event(id: $id) { id photo { url } } }', variables: { id } }),
    })
    const httpStatus = response.status
    if (httpStatus === 429 || httpStatus === 403) {
      const retrySeconds = httpStatus === 403 ? Math.max(3600, retryAfterSeconds(response.headers.get('retry-after'))) : retryAfterSeconds(response.headers.get('retry-after'))
      await response.body?.cancel()
      return { outcome: 'rate_limited', image: null, httpStatus, retrySeconds }
    }
    if (!response.ok) { await response.body?.cancel(); return { ...failure, httpStatus } }
    const body = await readBoundedResponse(response, 2 * 1024 * 1024)
    const data = JSON.parse(body)
    if (data.errors?.some((error: { extensions?: { code?: string } }) => ['RATE_LIMITED', 'TOO_MANY_REQUESTS'].includes(error.extensions?.code ?? ''))) {
      return { outcome: 'rate_limited', image: null, httpStatus, retrySeconds: retryAfterSeconds(response.headers.get('retry-after')) }
    }
    if (data.errors?.some((error: { extensions?: { code?: string } }) => error.extensions?.code === 'EVENT_NOT_AVAILABLE')) {
      return { outcome: 'unavailable', image: null, httpStatus, retrySeconds: 86400 }
    }
    const event = data.data?.event
    if (data.errors?.length || !event || event.id !== id || event.photo === undefined) return { ...failure, httpStatus }
    if (event.photo === null) return { outcome: 'no_photo', image: null, httpStatus, retrySeconds: 86400 }
    const image = validSbEngagedImageUrl(event.photo.url)
    return image ? { outcome: 'photo', image, httpStatus, retrySeconds: 21600 } : { ...failure, httpStatus }
  } catch { return failure }
}

export async function readBoundedResponse(response: Response, limit: number) {
  if (Number(response.headers.get('content-length')) > limit || !response.body) { await response.body?.cancel(); throw new Error('source_response_too_large') }
  const reader = response.body.getReader(), decoder = new TextDecoder()
  let bytes = 0, text = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > limit) throw new Error('source_response_too_large')
      text += decoder.decode(value, { stream: true })
    }
    return text + decoder.decode()
  } catch (error) { await reader.cancel().catch(() => {}); throw error }
  finally { reader.releaseLock() }
}

export type PhotoJob = { listingId: string; externalId: string; failures: number }
export interface PhotoStore {
  claim(): Promise<{ state: string; token?: string; jobs?: PhotoJob[] }>
  cooldown(seconds: number): Promise<void>
  complete(job: PhotoJob, token: string, result: PhotoResult): Promise<void>
  release(token: string): Promise<void>
}
export async function runSbEngagedPhotoCycle(store: PhotoStore, load = fetchSbEngagedPhoto,
  pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)), clock = Date.now, random = Math.random) {
  const claimed = await store.claim()
  if (claimed.state !== 'claimed') return { state: claimed.state, processed: 0 }
  if (!claimed.token || !Array.isArray(claimed.jobs) || claimed.jobs.length > 10) throw new Error('invalid_photo_claim')
  const started = clock()
  let processed = 0, failed = 0
  try {
    for (const job of claimed.jobs) {
      if (clock() - started >= 50_000) break
      if (processed) await pause(1000)
      const result = await load(job.externalId)
      if (result.outcome === 'rate_limited') await store.cooldown(result.retrySeconds)
      if (result.outcome === 'failed') result.retrySeconds = Math.min(21600, 60 * 2 ** Math.min(job.failures, 8)) + Math.floor(random() * 30)
      await store.complete(job, claimed.token, result)
      processed++
      if (result.outcome === 'failed') failed++
      if (result.outcome === 'rate_limited') return { state: 'cooldown', processed }
      if (failed >= 3) break
    }
    return { state: failed ? 'partial' : 'idle', processed }
  } finally { await store.release(claimed.token) }
}
