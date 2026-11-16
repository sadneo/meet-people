import type { DiningSource } from './dining-menus.ts'

/** Both sources finish independently, including when one source fails. */
export function createDiningBatchHandler(handlers: Record<DiningSource, (request: Request) => Promise<Response>>) {
  return async (request: Request): Promise<Response> => {
    const results = await Promise.all(Object.entries(handlers).map(async ([source, handler]) => {
      try {
        const response = await handler(request.clone())
        const { normalized, ...summary } = await response.json()
        return { source, httpStatus: response.status, ...summary,
          ...(normalized ? { normalized: { accepted: normalized.accepted, skipped: normalized.skipped } } : {}) }
      } catch {
        return { source, httpStatus: 502, status: 'failed', error: 'dining_source_unavailable' }
      }
    }))
    const failure = results.find(result => result.httpStatus >= 400)
    const status = results.every(result => result.status === 'ok') ? 'ok'
      : results.some(result => result.status === 'ok' || result.status === 'partial') ? 'partial' : 'failed'
    return Response.json({ status, results }, {
      status: failure?.httpStatus ?? 200,
      ...(request.method !== 'POST' ? { headers: { Allow: 'POST' } } : {}),
    })
  }
}
