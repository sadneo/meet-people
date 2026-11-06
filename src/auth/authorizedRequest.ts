import type { ZodType } from 'zod'
import { supabase } from '../supabase'
import { apiUrl } from '../platform/native'

export class ApiRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

function checkAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError')
}

// A JSON request to this app's API, signed with the current Supabase session.
// The Android build sends it to the hosted API (see apiUrl).
export async function authorizedRequest<T>(url: string, schema: ZodType<T>, options: { method?: string; body?: unknown; signal?: AbortSignal; expectedUserId?: string } = {}): Promise<T> {
  checkAborted(options.signal)
  const session = supabase ? (await supabase.auth.getSession()).data.session : null
  checkAborted(options.signal)
  if (options.expectedUserId !== undefined && session?.user.id !== options.expectedUserId) throw new Error('The account session has changed. Please try again.')
  const endpoint = apiUrl(url)
  const request = {
    method: options.method ?? (options.body ? 'POST' : 'GET'), signal: options.signal,
    headers: { ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}), ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  }
  // CapacitorHttp's native mutation wrapper does not enforce fetch cancellation.
  checkAborted(options.signal)
  const response = await fetch(endpoint, request)
  // A proxy error page or an empty 204 is not JSON.
  const data: unknown = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : null
    throw new ApiRequestError(message ?? 'This service is unavailable. Try again.', response.status)
  }
  const parsed = schema.safeParse(data)
  if (!parsed.success) throw new Error('Received an unexpected response. Try again.')
  return parsed.data
}
