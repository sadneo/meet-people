import type { ZodType } from 'zod'
import { supabase } from '../supabase'

// A JSON request to this app's API, signed with the current Supabase session.
export async function authorizedRequest<T>(url: string, schema: ZodType<T>, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const session = supabase ? (await supabase.auth.getSession()).data.session : null
  const response = await fetch(url, {
    method: options.method ?? (options.body ? 'POST' : 'GET'), signal: options.signal,
    headers: { ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}), ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  // A proxy error page or an empty 204 is not JSON.
  const data: unknown = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : null
    throw new Error(message ?? 'This service is unavailable. Try again.')
  }
  const parsed = schema.safeParse(data)
  if (!parsed.success) throw new Error('Received an unexpected response. Try again.')
  return parsed.data
}
