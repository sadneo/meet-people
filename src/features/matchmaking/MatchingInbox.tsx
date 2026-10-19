import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useSession } from '../../auth/useSession'
import { type MatchingNotifications } from '../../../shared/matchmaking'
import { matchmakingClient } from './client'
import { matchingErrorText } from './useMatchmaking'
import { useVisiblePolling } from './useVisiblePolling'
import { eventDetailPath } from '../events/routes'

function Inbox({ token }: { token: string }) {
  const client = useMemo(() => matchmakingClient(token), [token])
  const navigate = useNavigate()
  const live = useRef(false), pending = useRef(false), version = useRef(0)
  const opener = useRef<HTMLButtonElement>(null), dialog = useRef<HTMLDialogElement>(null)
  const [feed, setFeed] = useState<MatchingNotifications | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState(false)
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])
  const refresh = useCallback(async () => {
    if (pending.current) return
    pending.current = true
    setReading(true)
    const current = ++version.current
    try {
      const next = await client.notifications()
      if (live.current && current === version.current) { setFeed(next); setError('') }
    } catch (failure) { if (live.current && current === version.current) setError(matchingErrorText(failure)) }
    finally { pending.current = false; if (live.current) setReading(false) }
  }, [client])
  useVisiblePolling(refresh)
  useEffect(() => {
    if (!open) return
    const element = dialog.current
    const button = opener.current
    element?.showModal()
    return () => { element?.close(); if (button?.isConnected) button.focus() }
  }, [open])
  function close() {
    ++version.current // Closing cancels navigation from a late explicit-view reply.
    setOpen(false)
  }
  async function view(id: string, eventId: string) {
    if (pending.current) return
    pending.current = true
    const current = ++version.current
    setBusy(true); setError('')
    try {
      const next = await client.notificationRead(id)
      if (live.current && current === version.current) { setFeed(next); setOpen(false); navigate(eventDetailPath(eventId)) }
    } catch (failure) { if (live.current && current === version.current) setError(matchingErrorText(failure)) }
    finally { pending.current = false; if (live.current) setBusy(false) }
  }
  return <div className="pt-inbox-controls">
    <button ref={opener} type="button" className="pt-icon-button" aria-label={`Matching notifications${feed ? `, ${feed.unreadCount} unread` : ', status unavailable'}`} aria-haspopup="dialog" onClick={() => setOpen(true)}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5ZM10 20h4" /></svg>{feed && feed.unreadCount > 0 && <span className="pt-inbox-badge" aria-hidden="true">{feed.unreadCount}</span>}</button>
    {open && <dialog ref={dialog} className="pt-dialog pt-inbox-dialog" aria-labelledby="matching-inbox-title" onCancel={event => { event.preventDefault(); close() }}><header><h2 id="matching-inbox-title">Matching notifications</h2><button type="button" className="pt-icon-button" aria-label="Close matching notifications" onClick={close}>×</button></header>
      <p>Persistent in-app proposals only. No email or push delivery. Viewing a proposal marks that notification read; opening this inbox does not.</p>
      {error && <p role="alert">{error} Last confirmed notifications are shown.</p>}
      {reading && <p role="status">Refreshing notifications…</p>}
      {!feed ? <p>Notification status unavailable or loading.</p> : !feed.notifications.length ? <p>No matching notifications yet.</p> : <ul>{feed.notifications.map(item => <li key={item.id}><strong>{item.title}</strong><p>{item.readAt ? 'Read' : 'Unread'} · <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time></p><a href={eventDetailPath(item.eventId)} aria-disabled={busy || reading} tabIndex={busy || reading ? -1 : undefined} onClick={event => { event.preventDefault(); if (!busy && !reading) void view(item.id, item.eventId) }}>View proposal</a></li>)}</ul>}
      <button type="button" className="pt-button" disabled={busy || reading} onClick={() => void refresh()}>Refresh notifications</button>
    </dialog>}
  </div>
}
export function MatchingInbox() {
  const { session, ready } = useSession()
  return ready && session ? <Inbox key={`${session.user.id}:${session.access_token}`} token={session.access_token} /> : null
}
