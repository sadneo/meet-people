import { useCallback, useEffect, useRef, useState } from 'react'
import { EventSchema, type LiveEvent } from '../../shared/events'
import type { EventPicksResponse } from '../../shared/event-picks'
import { MessageSchema, type Message } from '../../shared/messaging'
import { useCachedLoad } from '../data/useCachedLoad'
import { eventLinkId, eventMessageBody, eventPicksRequest } from '../features/events/picks'
import { messagingRequest } from '../features/messaging/client'
import { EventRequestError, eventRequest } from '../features/events/client'

const emptyPicks: EventPicksResponse = { picks: [], algorithmVersion: '' }

/** Picks for a direct chat. Failures stay quiet: the chat works without them. */
export function useEventPicks(conversationId: string, enabled: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(timer)
  }, [])
  const load = useCallback((signal: AbortSignal) => enabled ? eventPicksRequest(conversationId, signal) : Promise.resolve(emptyPicks), [conversationId, enabled])
  const picks = useCachedLoad(load, ['event-picks', enabled ? 'direct' : 'off', conversationId], 60_000, { refetchOnWindowFocus: true, refetchInterval: enabled ? 60_000 : false })
  return picks.error ? [] : (picks.value?.picks ?? []).filter(pick => eventCanBeSuggested(pick.event, now))
}

export function eventCanBeSuggested(event: LiveEvent, now = Date.now()) {
  return event.status === 'active' && Date.parse(event.starts_at ?? '') > now
}

// A missing event is different from a failed lookup. Cache only confirmed data;
// transient errors remain retryable and never masquerade as a cancellation.
export async function loadChatEvent(eventId: string, signal?: AbortSignal) {
  try { return await eventRequest(`/${encodeURIComponent(eventId)}`, EventSchema, { signal }) }
  catch (error) {
    if (error instanceof EventRequestError && error.status === 404) return null
    throw error
  }
}

/** Event ids already shared in this chat, with who shared each one first. */
export function sharedEvents(messages: readonly Message[], me: string) {
  const shared = new Map<string, 'me' | 'peer'>()
  for (const message of messages) {
    const id = eventLinkId(message.body)
    if (id && !shared.has(id)) shared.set(id, message.sender_id === me ? 'me' : 'peer')
  }
  return shared
}

type SendState = { eventId: string; requestId: string; status: 'pending' | 'failed'; body?: string; error?: string }
/** Sends an event as one chat message. A retry of the same event reuses its request ID. */
export function useEventPickSend(conversationId: string, canSend: boolean, sent: () => void) {
  const [state, setState] = useState<SendState | null>(null)
  const live = useRef(true)
  const pending = useRef(false)
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])
  const send = useCallback(async (event: LiveEvent) => {
    if (!canSend || pending.current) return
    pending.current = true
    const requestId = state?.eventId === event.id ? state.requestId : crypto.randomUUID()
    let body = state?.eventId === event.id ? state.body : undefined
    setState({ eventId: event.id, requestId, body, status: 'pending' })
    try {
      const fresh = await loadChatEvent(event.id)
      if (!fresh || !eventCanBeSuggested(fresh)) {
        if (live.current) setState({ eventId: event.id, requestId, body, status: 'failed', error: 'This event is no longer available to send. Choose another idea.' })
        return
      }
      if (!live.current) return
      // An unconfirmed write must retain its exact payload as well as its ID,
      // even if the live event's title or time changes before an explicit retry.
      body ??= eventMessageBody(fresh)
      await messagingRequest(`/${encodeURIComponent(conversationId)}/messages`, MessageSchema, { body: { body, clientRequestId: requestId } })
      if (!live.current) return
      setState(null)
      sent()
    } catch {
      if (live.current) setState({ eventId: event.id, requestId, body, status: 'failed', error: 'That event wasn’t sent. Try again.' })
    } finally { pending.current = false }
  }, [canSend, conversationId, sent, state])
  return { send, pendingId: state?.status === 'pending' ? state.eventId : null, failedId: state?.status === 'failed' ? state.eventId : null, error: state?.error ?? '' }
}
export type EventPickSender = ReturnType<typeof useEventPickSend>
