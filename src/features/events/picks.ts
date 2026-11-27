import { authorizedRequest } from '../../auth/authorizedRequest'
import { EventPicksResponseSchema, type EventPickReason } from '../../../shared/event-picks'
import { isProvidedInterest } from '../../../shared/interests'
import type { LiveEvent } from '../../../shared/events'
import { eventDate } from './client'

export function eventPicksRequest(conversationId: string, signal?: AbortSignal) {
  return authorizedRequest(`/api/event-picks/${encodeURIComponent(conversationId)}`, EventPicksResponseSchema, { signal })
}

// A shared event is a normal chat message: readable as text in notifications,
// with the in-app event path on its last line so the app can draw a card.
const eventPath = /^\/events\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i
export function eventLinkId(body: string) {
  const last = body.trimEnd().split('\n').at(-1)?.trim() ?? ''
  return eventPath.exec(last)?.[1].toLowerCase() ?? null
}
export function eventMessageText(body: string) {
  return eventLinkId(body) ? body.trimEnd().split('\n').slice(0, -1).join('\n').trim() : body
}
export function eventMessageBody(event: Pick<LiveEvent, 'id' | 'title' | 'starts_at' | 'location_name'>) {
  const title = event.title.length > 200 ? `${event.title.slice(0, 199)}…` : event.title
  const when = [event.starts_at ? eventDate(event.starts_at, null) : null, event.location_name?.slice(0, 200)].filter(Boolean).join(' · ')
  return [title, when, `/events/${event.id}`].filter(Boolean).join('\n')
}

function interestLabel(label: string) { return isProvidedInterest(label) ? label.toLowerCase() : label }
export function pickReasonText(reason: EventPickReason, peerName: string) {
  const mine = reason.viewerInterest ? interestLabel(reason.viewerInterest) : null
  const theirs = reason.peerInterest ? interestLabel(reason.peerInterest) : null
  if (reason.kind === 'shared' && mine) return `You both like ${mine}`
  if (reason.kind === 'both' && mine && theirs) return `You like ${mine} · ${peerName} likes ${theirs}`
  if (reason.kind === 'viewer' && mine) return `You like ${mine}`
  if (reason.kind === 'peer' && theirs) return `${peerName} likes ${theirs}`
  return 'Near you both'
}
