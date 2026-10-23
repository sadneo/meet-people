import { supabase } from '../../supabase'
import type { ZodType } from 'zod'
import { apiUrl } from '../../platform/native'

// Public reads omit the session so every viewer shares the same cached response.
export async function eventRequest<T>(path: string, schema: ZodType<T>, options: { body?: unknown; signal?: AbortSignal; anonymous?: boolean } = {}): Promise<T> {
  const unavailable = 'Events are unavailable. Try again.'
  let response: Response, data: unknown
  try {
    const session = supabase && !options.anonymous ? (await supabase.auth.getSession()).data.session : null
    response = await fetch(apiUrl(`/api/events${path}`), {
      method: options.body ? 'POST' : 'GET', signal: options.signal, cache: options.anonymous ? 'default' : 'no-store',
      headers: { ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}), ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
    data = await response.json()
  } catch (failure) {
    if (options.signal?.aborted) throw failure
    throw new Error(unavailable, { cause: failure })
  }
  if (!response.ok) throw new Error(data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : unavailable)
  const parsed = schema.safeParse(data)
  if (!parsed.success) throw new Error(unavailable)
  return parsed.data
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
  const finish = end ? new Date(end) : null
  const until = finish && !Number.isNaN(finish.getTime()) ? finish : null
  const day: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', year: until && until.getFullYear() !== date.getFullYear() ? 'numeric' : undefined }
  const time: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }
  const when = date.toLocaleString(undefined, { ...day, ...time })
  if (!until) return when
  // Same-day ranges stay compact; multi-day ranges name the ending date.
  return `${when} – ${until.toLocaleString(undefined, until.toDateString() === date.toDateString() ? time : { ...day, ...time })}`
}
