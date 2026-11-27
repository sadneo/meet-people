import { useCallback, useEffect, useRef, useState } from 'react'
import type { LiveEvent } from '../../shared/events'
import type { EventPick, EventPickReason } from '../../shared/event-picks'
import type { Message } from '../../shared/messaging'
import { useCachedLoad } from '../data/useCachedLoad'
import { eventDate, eventImagePlaceholder, safeImage } from '../features/events/client'
import { eventMessageText, pickReasonText } from '../features/events/picks'
import { ErrorMessage, Icon, Modal } from './common'
import { eventPicksView, picksDismissed, setPicksDismissed } from './event-picks-state'
import { MediaImage } from './loading/MediaImage'
import { eventCanBeSuggested, loadChatEvent, sharedEvents, type EventPickSender } from './useEventPicks'


function SendButton({ event, peerName, sender, shared, canSend, large = false }: { event: LiveEvent; peerName: string; sender: EventPickSender; shared: 'me' | 'peer' | undefined; canSend: boolean; large?: boolean }) {
  if (shared === 'me') return <p className={large ? 'event-pick-sent' : 'event-pick-send is-sent'}><Icon name="Check" />{large ? `Sent to ${peerName}` : 'Sent'}</p>
  if (shared === 'peer') return <p className={large ? 'event-pick-sent' : 'event-pick-send is-sent'}><Icon name="Check" />{large ? `${peerName} sent this` : 'In chat'}</p>
  const pending = sender.pendingId === event.id, failed = sender.failedId === event.id
  const label = pending ? 'Sending…' : failed ? 'Retry' : large ? `Send to ${peerName}` : 'Send'
  return <button type="button" className={large ? 'btn event-pick-send-large' : 'event-pick-send'} disabled={!canSend} aria-disabled={pending || !!sender.pendingId}
    aria-label={large ? undefined : `${failed ? 'Retry sending' : 'Send'} ${event.title} to ${peerName}`}
    onClick={() => { if (!sender.pendingId) void sender.send(event) }}>{large && !pending && <Icon name="Send" />}{label}</button>
}

export function EventPicksBar({ conversationId, me, peerName, dating, picks, messages, canSend, sender, openSignal, openPick, focusOptions }: {
  conversationId: string; me: string; peerName: string; dating: boolean
  picks: readonly EventPick[]; messages: readonly Message[]; canSend: boolean; sender: EventPickSender
  openSignal: number; openPick: (pick: EventPick) => void; focusOptions: () => void
}) {
  const [dismissed, setDismissed] = useState(() => picksDismissed(me, conversationId))
  const [peek, setPeek] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null), chip = useRef<HTMLButtonElement>(null)
  const focusIntent = useRef<'tray' | 'return' | null>(null)
  const [now] = useState(() => Date.now())
  const shared = sharedEvents(messages, me)
  const remaining = picks.filter(pick => !shared.has(pick.event.id))
  // ••• → Event ideas reopens the tray, even after it was hidden.
  const seenSignal = useRef(openSignal)
  useEffect(() => {
    if (openSignal === seenSignal.current) return
    seenSignal.current = openSignal
    focusIntent.current = 'tray'
    setPeek(true); setDismissed(false); setPicksDismissed(me, conversationId, false)
  }, [openSignal, me, conversationId])
  // A message of your own tucks a reopened tray away again.
  const mineCount = messages.filter(message => message.sender_id === me).length
  const seenMine = useRef(mineCount)
  useEffect(() => { if (mineCount > seenMine.current) setPeek(false); seenMine.current = mineCount }, [mineCount])

  const state = { remaining: remaining.length, messages, me, sentPick: picks.some(pick => shared.has(pick.event.id)), dismissed, now }
  const view = eventPicksView({ ...state, peek })
  // Opened from the chip: tuck back into it. Otherwise × hides the picks.
  const tucks = peek && eventPicksView({ ...state, peek: false }) === 'chip'
  const hide = () => { focusIntent.current = 'return'; setPeek(false); setDismissed(true); setPicksDismissed(me, conversationId, true) }
  useEffect(() => {
    if (focusIntent.current === 'tray' && view === 'open') {
      heading.current?.focus(); focusIntent.current = null
    } else if (focusIntent.current === 'return' && view !== 'open') {
      if (chip.current) chip.current.focus()
      else focusOptions()
      focusIntent.current = null
    }
  })
  // A mouse wheel scrolls the row sideways; touch and trackpads already do.
  const rail = useRef<HTMLUListElement>(null)
  useEffect(() => {
    const element = rail.current
    if (!element) return
    const sideways = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
      const max = element.scrollWidth - element.clientWidth
      const next = Math.max(0, Math.min(max, element.scrollLeft + event.deltaY))
      if (next === element.scrollLeft) return
      event.preventDefault()
      element.scrollLeft = next
    }
    element.addEventListener('wheel', sideways, { passive: false })
    return () => element.removeEventListener('wheel', sideways)
  }, [view])
  if (view === 'hidden') return null
  const noun = dating ? (remaining.length === 1 ? 'date idea' : 'date ideas') : (remaining.length === 1 ? 'idea' : 'ideas')
  if (view === 'chip') return <div className="event-picks-chip-row">
    <button ref={chip} type="button" className="event-picks-chip" onClick={() => { focusIntent.current = 'tray'; setPeek(true) }} aria-expanded="false">
      <Icon name="Events" /><span>{remaining.length}{shared.size ? ' more ' : ' '}{noun}</span><Icon name="ChevronDown" />
    </button>
  </div>
  return <section className="event-picks" aria-labelledby={`event-picks-${conversationId}`}>
    <div className="event-picks-head">
      <span className="event-picks-icon" aria-hidden="true"><Icon name="Events" /></span>
      <div className="event-picks-copy">
        <h4 ref={heading} tabIndex={-1} id={`event-picks-${conversationId}`}>{dating ? 'Date ideas for you two' : 'Things to do together'}</h4>
        <p>Next two weeks</p>
      </div>
      {tucks
        ? <button type="button" className="round event-picks-close" aria-label="Tuck away event ideas" onClick={() => { focusIntent.current = 'return'; setPeek(false) }}><Icon name="ChevronUp" /></button>
        : <button type="button" className="round event-picks-close" aria-label="Hide event ideas" onClick={hide}><Icon name="Skip" /></button>}
    </div>
    <ul className="event-picks-rail" ref={rail}>
      {remaining.map(pick => <li key={pick.event.id} className="event-pick">
        <button type="button" className="event-pick-main" onClick={() => openPick(pick)}>
          <MediaImage src={safeImage(pick.event.image_url)} fallback={eventImagePlaceholder} alt="" referrerPolicy="no-referrer" loading="lazy" />
          <span className="event-pick-body">
            <span className="event-pick-when">{pickWhen(pick.event.starts_at)}</span>
            <b>{pick.event.title}</b>
            <span className="event-pick-why"><Icon name="Star" />{pickReasonText(pick.reason, peerName)}</span>
          </span>
        </button>
        <SendButton event={pick.event} peerName={peerName} sender={sender} shared={undefined} canSend={canSend} />
      </li>)}
    </ul>
    {sender.failedId && remaining.some(pick => pick.event.id === sender.failedId) && <ErrorMessage>{sender.error}</ErrorMessage>}
  </section>
}

export function EventPickDetail({ event: initialEvent, reason, peerName, shared, canSend, sender, close }: {
  event: LiveEvent; reason: EventPickReason | null; peerName: string; shared: 'me' | 'peer' | undefined
  canSend: boolean; sender: EventPickSender; close: () => void
}) {
  const load = useCallback((signal: AbortSignal) => loadChatEvent(initialEvent.id, signal), [initialEvent.id])
  const fresh = useCachedLoad(load, ['event', initialEvent.id], 0, { refetchOnWindowFocus: true })
  const available = !fresh.loading && !fresh.error && !!fresh.value && eventCanBeSuggested(fresh.value)
  const event = fresh.value ?? initialEvent
  const place = [event.location_name, event.city].filter(Boolean).join(', ')
  return <Modal title="Event" backLabel="Back to chat" className="event-pick-detail" close={close}>
    <MediaImage className="event-pick-cover" src={safeImage(event.image_url)} fallback={eventImagePlaceholder} alt="" referrerPolicy="no-referrer" />
    {event.category && <p className="event-pick-category">{event.category}</p>}
    <h3 className="event-pick-title">{event.title}</h3>
    <p className="event-pick-meta strong"><Icon name="Clock" />{eventDate(event.starts_at, event.ends_at)}</p>
    {place && <p className="event-pick-meta"><Icon name="Location" />{place}</p>}
    {event.description && <p className="event-pick-description">{event.description}</p>}
    {reason && <section className="event-pick-reasons" aria-label="Why it’s here">
      <h4>Why it’s here</h4>
      <p><Icon name="Star" />{pickReasonText(reason, peerName)}</p>
    </section>}
    <div className="event-pick-actions">
      {fresh.error ? <><ErrorMessage>Couldn’t load event details. Try again.</ErrorMessage><button type="button" className="btn light" onClick={() => void fresh.reload()}>Retry event details</button></>
        : fresh.loading ? <p role="status">Checking event details…</p>
        : !available && <p role="status">This event is no longer available to send.</p>}
      {sender.failedId === event.id && <ErrorMessage>{sender.error}</ErrorMessage>}
      <SendButton event={event} peerName={peerName} sender={sender} shared={shared} canSend={canSend && available} large />
    </div>
  </Modal>
}

/** A chat message that carries an event path, drawn from the live event record. */
export function EventMessageCard({ eventId, body, open }: { eventId: string; body: string; open: (event: LiveEvent) => void }) {
  const load = useCallback((signal: AbortSignal) => loadChatEvent(eventId, signal), [eventId])
  const event = useCachedLoad(load, ['event', eventId], 5 * 60_000, { refetchOnWindowFocus: true })
  const text = eventMessageText(body)
  const value = event.value
  return <>
    {text && <p>{text}</p>}
    {!value ? <div className="event-message-status">
      {event.error ? <><small>Couldn’t load event details. Try again.</small><button type="button" className="event-message-open" disabled={event.refreshing} onClick={() => void event.reload()}>Retry event details</button></>
        : event.loading ? <span role="status">Loading event details…</span>
        : <small>This event is no longer available.</small>}
    </div> : <article className="event-message-card" aria-label={`Event: ${value.title}`}>
    <MediaImage src={safeImage(value.image_url)} fallback={eventImagePlaceholder} alt="" referrerPolicy="no-referrer" loading="lazy" />
    <div className="event-message-body">
      {value.category && <span className="event-pick-category">{value.category}</span>}
      <b>{value.title}</b>
      <span>{[shortWhen(value.starts_at), value.location_name].filter(Boolean).join(' · ')}</span>
    </div>
    <button type="button" className="event-message-open" onClick={() => open(value)}>See event<Icon name="ArrowRight" /></button>
  </article>}
  </>
}

function shortWhen(startsAt: string | null) {
  const date = new Date(startsAt ?? '')
  if (Number.isNaN(date.getTime())) return 'Date to be announced'
  return date.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
// Compact for the tray: "Fri Oct 30 · 7 PM".
function pickWhen(startsAt: string | null) {
  const date = new Date(startsAt ?? '')
  if (Number.isNaN(date.getTime())) return 'Date to be announced'
  const day = date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }).replace(/,/g, '')
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: date.getMinutes() ? '2-digit' : undefined })
  return `${day} · ${time}`
}
