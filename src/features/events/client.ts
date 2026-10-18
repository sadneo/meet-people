import { supabase } from '../../supabase'
import type { ZodType } from 'zod'

export async function eventRequest<T>(path: string, schema: ZodType<T>, options: { body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const session = supabase ? (await supabase.auth.getSession()).data.session : null
  const response = await fetch(`/api/events${path}`, {
    method: options.body ? 'POST' : 'GET', signal: options.signal,
    headers: { ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}), ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const data: unknown = await response.json().catch(() => { throw new Error('Events are unavailable. Try again.') })
  if (!response.ok) throw new Error(data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : 'Events are unavailable. Try again.')
  return schema.parse(data)
}

export const eventImagePlaceholder = '/images/event-placeholder.svg'
export function safeImage(url: string | null) {
  if (url && /^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return url
    } catch { /* Missing/invalid source artwork uses the local neutral placeholder. */ }
  }
  return eventImagePlaceholder
}
export function sourceLink(url: string | null) {
  return url?.startsWith('https://') || url?.startsWith('http://') ? url : null
}
export function eventDate(start: string | null, end: string | null) {
  if (!start) return 'Date to be announced'
  const date = new Date(start)
  if (Number.isNaN(date.getTime())) return 'Date to be announced'
  const when = date.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
  return end ? `${when} – ${new Date(end).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}` : when
}
