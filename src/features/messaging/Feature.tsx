import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { z } from 'zod'
import type { ConnectionRequest } from '../../../shared/connections'
import { ConversationsSchema, HistorySchema, MESSAGE_MAX_LENGTH, MessageSchema, ReadStateSchema, type Conversation, type History, type Message, type Participant } from '../../../shared/messaging'
import { centralSignInPath } from '../../auth/returnTo'
import { useSession } from '../../auth/useSession'
import { connections } from '../connections/client'
import { useVisiblePolling } from '../matchmaking/useVisiblePolling'
import { Button, Header, Icon } from '../prototype/ui'
import { usePrototype } from '../prototype/context'
import { activities, planDate, planTime } from '../prototype/model'
import { conversationPath, messagingRequest } from './client'
import { announceMessagesActivity } from './useMessagesActivity'
import '../prototype/messages.css'
import './messaging.css'

// Polling stands in for realtime delivery; hidden tabs do not poll. While a request I
// sent is waiting, the inbox checks as often as an open chat, so an accepted request
// shows its new chat promptly.
const INBOX_POLL_MS = 30000
const CHAT_POLL_MS = 5000

function othersIn(participants: Participant[], userId: string) { return participants.filter(person => person.id !== userId) }
function nameOf(conversation: Conversation | undefined, userId: string) {
  return (conversation && othersIn(conversation.participants, userId).map(person => person.display_name).join(', ')) || 'Conversation'
}
function activity(conversation: Conversation) { return conversation.latest_message?.created_at ?? conversation.created_at }
function byActivity(items: Conversation[]) { return [...items].sort((a, b) => activity(b).localeCompare(activity(a))) }
function mergeMessages(current: Message[], incoming: Message[]) {
  return [...new Map([...current, ...incoming].map(item => [item.id, item])).values()].sort((a, b) => a.seq - b.seq)
}
// Avatars are https-only (checked in SQL) and load without a referrer.
function PersonMark({ name, avatar }: { name: string; avatar?: string | null }) {
  if (avatar) return <img className="pt-avatar pt-messaging-initials" src={avatar} alt="" referrerPolicy="no-referrer" />
  return <span className="pt-avatar pt-messaging-initials" aria-hidden="true">{name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('')}</span>
}
function dateLabel(timestamp: string) {
  return new Date(timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
function failureMessage(failure: unknown) { return failure instanceof Error ? failure.message : 'Could not load messages. Please try again.' }

export default function MessagesWorkspace() {
  const { session, ready } = useSession()
  const { pathname, search } = useLocation()
  if (!ready || !session) return <div className="pt-messaging-access"><Header title="Messages" />{ready
    ? <><p>Sign in to open your saved conversations.</p><Link className="pt-button" to={centralSignInPath(`${pathname}${search}`)}>Sign in</Link></>
    : <p role="status">Checking sign-in…</p>}</div>
  // A changed identity immediately discards the previous user's data and drafts.
  return <SignedInMessages key={session.user.id} userId={session.user.id} />
}

function SignedInMessages({ userId }: { userId: string }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const selectedId = params.get('conversation')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [reload, setReload] = useState(0)
  const [requests, setRequests] = useState<ConnectionRequest[]>([])
  const [waiting, setWaiting] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [answering, setAnswering] = useState(false)
  const loadingRef = useRef(true)
  const polling = useRef(false)
  useEffect(() => {
    const controller = new AbortController()
    loadingRef.current = true
    void messagingRequest(`?page=${page}`, ConversationsSchema, { signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return
      setConversations(previous => page === 1 ? data.conversations : [...new Map([...previous, ...data.conversations].map(item => [item.id, item])).values()])
      setHasMore(data.hasMore); setError('')
    }).catch(failure => { if (!controller.signal.aborted) setError(failureMessage(failure)) })
      .finally(() => { if (!controller.signal.aborted) { loadingRef.current = false; setLoading(false) } })
    return () => controller.abort()
  }, [page, reload])
  useEffect(() => {
    const controller = new AbortController()
    connections.list(controller.signal).then(data => { if (!controller.signal.aborted) { setRequests(data.incoming); setWaiting(data.sent.length > 0) } })
      .catch(() => { /* Requests stay as last loaded; the inbox shows its own errors. */ })
    return () => controller.abort()
  }, [reload])
  // Keeps previews and unread counts current without resetting loaded pages.
  const poll = useCallback(async () => {
    if (loadingRef.current || polling.current) return
    polling.current = true
    try {
      const [data, list] = await Promise.all([messagingRequest('?page=1', ConversationsSchema), connections.list().catch(() => null)])
      setConversations(current => byActivity([...new Map([...current, ...data.conversations].map(item => [item.id, item])).values()]))
      if (list) { setRequests(list.incoming); setWaiting(list.sent.length > 0) }
    } catch { /* The last loaded inbox stays; Refresh shows the error. */ }
    finally { polling.current = false }
  }, [])
  useVisiblePolling(poll, waiting ? CHAT_POLL_MS : INBOX_POLL_MS, false)
  const selected = conversations.find(item => item.id === selectedId)
  const visible = conversations.filter(item => `${nameOf(item, userId)} ${item.latest_message?.body ?? ''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  function refresh() { setLoading(true); setPage(1); setReload(value => value + 1) }
  const update = useCallback((id: string, change: (item: Conversation) => Conversation) => {
    setConversations(items => byActivity(items.map(item => item.id === id ? change(item) : item)))
  }, [])
  const saved = useCallback((message: Message) => update(message.conversation_id, item => ({ ...item, latest_message: message, unread_count: 0 })), [update])
  const read = useCallback((id: string) => { update(id, item => ({ ...item, unread_count: 0 })); announceMessagesActivity() }, [update])
  // Accepting opens the new direct chat.
  async function answer(person: ConnectionRequest, accept: boolean) {
    if (answering) return
    setAnswering(true); setRequestError('')
    try {
      const state = await (accept ? connections.accept(person.id) : connections.remove(person.id))
      setRequests(items => items.filter(item => item.id !== person.id))
      announceMessagesActivity()
      if (accept && state.conversationId) { refresh(); navigate(conversationPath(state.conversationId)) }
    } catch (failure) { setRequestError(failureMessage(failure)) }
    finally { setAnswering(false) }
  }
  const left = useCallback((id: string) => { setConversations(items => items.filter(item => item.id !== id)); navigate('/messages') }, [navigate])
  return <div className="pt-messages-workspace">
    <section className="pt-inbox-pane" aria-label="Conversation inbox">
      <Header title="Messages" action={<Button secondary disabled={loading} onClick={refresh}>Refresh</Button>} />
      <label className="pt-conversation-search"><Icon name="search" /><span className="pt-sr-only">Search conversations</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search conversations…" /></label>
      {loading && <p role="status">Loading conversations…</p>}
      {error && <div role="alert"><p>{error}</p><Button secondary disabled={loading} onClick={refresh}>Retry conversations</Button></div>}
      {!!requests.length && <section className="pt-messaging-requests" aria-label="Connection requests"><h2>Requests</h2>
        {requests.map(person => <div key={person.id} className="pt-messaging-request"><PersonMark name={person.display_name} avatar={person.avatar_url} /><span><strong>{person.display_name}</strong><small>Wants to connect</small></span>
          <div><Button disabled={answering} onClick={() => void answer(person, true)}>Accept</Button><Button secondary disabled={answering} onClick={() => void answer(person, false)}>Decline</Button></div></div>)}
        {requestError && <p role="alert">{requestError}</p>}
      </section>}
      <div className="pt-conversations">{visible.map(item => {
        const unread = item.id !== selectedId && item.unread_count > 0
        return <button key={item.id} className={`pt-conversation ${item.id === selectedId ? 'is-selected' : ''}`} aria-current={item.id === selectedId ? 'true' : undefined} onClick={() => navigate(conversationPath(item.id))}>
          <PersonMark name={nameOf(item, userId)} avatar={item.kind === 'direct' ? othersIn(item.participants, userId)[0]?.avatar_url : null} />
          <span><strong>{nameOf(item, userId)}</strong><span>{item.latest_message?.body ?? 'Say hello'}</span></span>
          <small>{dateLabel(activity(item))}{unread && <span className="pt-unread" role="img" aria-label={`${item.unread_count} unread`} />}</small>
        </button>
      })}</div>
      {!loading && !error && !conversations.length && !requests.length && <div className="pt-empty"><h2>Your conversations start here</h2><p>A conversation opens when you connect with someone.</p><Link className="pt-button" to="/matchmaking">Find people</Link></div>}
      {!loading && !!conversations.length && !visible.length && <p>No conversations match your search.</p>}
      {hasMore && <Button secondary disabled={loading} onClick={() => { setLoading(true); setPage(value => value + 1) }}>Load more conversations</Button>}
    </section>
    <section className="pt-conversation-pane" aria-label="Selected conversation">
      {selectedId ? <Chat key={selectedId} id={selectedId} userId={userId} conversation={selected} onSaved={saved} onRead={read} onLeft={left} /> : <div className="pt-chat-placeholder">{pathname.endsWith('/chat') && <Link to="/messages">Back to messages</Link>}<Icon name="messages" size={48} /><h2>Choose a conversation</h2><p>Open a conversation from your inbox.</p></div>}
    </section>
    <aside className="pt-chat-details" aria-label="Conversation details">
      {selected && <section className="pt-contact-card pt-messaging-details"><h2>Participants</h2>{selected.participants.map(person => <div key={person.id}><PersonMark name={person.display_name} avatar={person.avatar_url} /><p>{person.display_name}{person.id === userId ? ' (you)' : ''}</p></div>)}</section>}
      <DemoPlan />
    </aside>
  </div>
}

function Chat({ id, userId, conversation, onSaved, onRead, onLeft }: { id: string; userId: string; conversation?: Conversation; onSaved: (message: Message) => void; onRead: (id: string) => void; onLeft: (id: string) => void }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [members, setMembers] = useState<Participant[]>([])
  const [kind, setKind] = useState<History['kind'] | null>(null)
  const [canSend, setCanSend] = useState(false)
  const [cursor, setCursor] = useState<number | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [sendError, setSendError] = useState('')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [leaving, setLeaving] = useState<'confirm' | 'busy' | null>(null)
  const [leaveError, setLeaveError] = useState('')
  const [reload, setReload] = useState(0)
  const active = useRef(true)
  const fullLoad = useRef(true)
  const loadedRef = useRef(false)
  const polling = useRef(false)
  const pending = useRef(false)
  const retry = useRef<{ body: string; id: string } | null>(null)
  const newest = useRef(0)
  const stick = useRef(true)
  const bottom = useRef<HTMLDivElement>(null)
  const lastSeq = messages.at(-1)?.seq ?? 0
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  useEffect(() => { newest.current = lastSeq }, [lastSeq])
  useEffect(() => {
    const controller = new AbortController()
    fullLoad.current = true
    void messagingRequest(`/${id}/messages`, HistorySchema, { signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return
      setMessages(data.messages); setMembers(data.participants); setKind(data.kind); setCanSend(data.canSend)
      setCursor(data.nextCursor); setLoadError(''); setLoaded(true); loadedRef.current = true
    }).catch(failure => { if (!controller.signal.aborted) setLoadError(failureMessage(failure)) })
      .finally(() => { if (!controller.signal.aborted) { fullLoad.current = false; setLoading(false) } })
    return () => controller.abort()
  }, [id, reload])
  const poll = useCallback(async () => {
    if (!loadedRef.current || fullLoad.current || polling.current) return
    polling.current = true
    try {
      const data = await messagingRequest(`/${id}/messages?after=${newest.current}`, HistorySchema)
      if (!active.current) return
      // Far behind (for example after sleeping): reload instead of stitching pages.
      if (data.messages.length >= 50) { setLoading(true); setReload(value => value + 1); return }
      setMessages(current => mergeMessages(current, data.messages)); setMembers(data.participants); setCanSend(data.canSend)
    } catch { /* The next poll or Refresh messages tries again. */ }
    finally { polling.current = false }
  }, [id])
  useVisiblePolling(poll, CHAT_POLL_MS)
  const lastMessageId = messages.at(-1)?.id
  useEffect(() => {
    const pane = bottom.current?.parentElement
    if (pane && stick.current) pane.scrollTop = pane.scrollHeight
  }, [lastMessageId])
  const myRead = members.find(person => person.id === userId)?.last_read_seq ?? 0
  useEffect(() => {
    if (!loaded || lastSeq <= myRead) return
    void messagingRequest(`/${id}/read`, ReadStateSchema, { body: { seq: lastSeq } }).then(data => {
      if (!active.current) return
      setMembers(current => current.map(person => person.id === userId ? { ...person, last_read_seq: data.lastReadSeq } : person))
      onRead(id)
    }).catch(() => { /* Unread state catches up on the next read. */ })
  }, [id, loaded, lastSeq, myRead, userId, onRead])
  async function older() {
    if (loading || cursor === null) return
    setLoading(true)
    try {
      const data = await messagingRequest(`/${id}/messages?before=${cursor}`, HistorySchema)
      if (active.current) { setMessages(current => mergeMessages(current, data.messages)); setCursor(data.nextCursor); setLoadError('') }
    } catch (failure) { if (active.current) setLoadError(failureMessage(failure)) }
    finally { if (active.current) setLoading(false) }
  }
  async function send() {
    const body = draft.trim()
    if (pending.current || !loaded || loading || !canSend || !body) return
    pending.current = true; setSending(true); setSendError('')
    // Keep the same request ID after an ambiguous network failure. A retry cannot
    // insert a second copy when the original database write already succeeded.
    if (retry.current?.body !== body) retry.current = { body, id: crypto.randomUUID() }
    try {
      const saved = await messagingRequest(`/${id}/messages`, MessageSchema, { body: { body, clientRequestId: retry.current.id } })
      if (!active.current) return
      stick.current = true
      setMessages(current => mergeMessages(current, [saved]))
      setMembers(current => current.map(person => person.id === userId ? { ...person, last_read_seq: Math.max(person.last_read_seq, saved.seq) } : person))
      setDraft(''); retry.current = null; onSaved(saved)
    } catch (failure) { if (active.current) setSendError(`${failureMessage(failure)} Your draft is kept; retry Send.`) }
    finally { pending.current = false; if (active.current) setSending(false) }
  }
  async function leave() {
    setLeaving('busy'); setLeaveError('')
    try {
      await messagingRequest(`/${id}/leave`, z.null(), { body: {} })
      if (active.current) onLeft(id)
    } catch (failure) { if (active.current) { setLeaving('confirm'); setLeaveError(failureMessage(failure)) } }
  }
  const participants = new Map<string, Participant>(members.map(person => [person.id, person]))
  const others = othersIn(members, userId)
  const title = others.map(person => person.display_name).join(', ') || nameOf(conversation, userId)
  const lastMine = [...messages].reverse().find(message => message.sender_id === userId)
  const seenBy = lastMine ? others.filter(person => person.last_read_seq >= lastMine.seq) : []
  const seen = !seenBy.length ? '' : kind === 'direct' ? 'Seen' : `Seen by ${seenBy.map(person => person.display_name).join(', ')}`
  return <>
    <header className="pt-chat-header">
      <Link className="pt-icon-button pt-chat-back" to="/messages" aria-label="Back to messages"><Icon name="back" /></Link>
      <div className="pt-chat-identity"><PersonMark name={title} avatar={kind === 'direct' ? others[0]?.avatar_url : null} /><div><h1>{title}</h1><p>{kind === 'event_group' ? 'Event group' : 'Shared conversation'}</p></div></div>
      <div className="pt-chat-tools">
        <button type="button" className="pt-chat-tool" aria-label="Refresh messages" title="Refresh messages" disabled={loading || sending} onClick={() => { setLoading(true); setReload(value => value + 1) }}><Icon name="refresh" /></button>
        {kind === 'event_group' && <button type="button" className="pt-chat-tool" aria-label="Leave conversation" title="Leave conversation" aria-expanded={leaving !== null} disabled={leaving === 'busy'} onClick={() => setLeaving(leaving ? null : 'confirm')}><Icon name="logout" /></button>}
      </div>
    </header>
    {leaving && <div className="pt-messaging-leave" role="group" aria-label="Leave conversation">
      <p>Leave this group conversation? You’ll stop seeing its messages.</p>
      <Button secondary disabled={leaving === 'busy'} onClick={() => setLeaving(null)}>Cancel</Button>
      <Button disabled={leaving === 'busy'} onClick={() => void leave()}>{leaving === 'busy' ? 'Leaving…' : 'Leave'}</Button>
      {leaveError && <p role="alert">{leaveError}</p>}
    </div>}
    <section className="pt-chat" aria-label="Message history" aria-live="polite" onScroll={event => { const pane = event.currentTarget; stick.current = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 120 }}>
      {loading && <p role="status">Loading messages…</p>}
      {loadError && <div role="alert"><p>{loadError}</p><Button secondary disabled={loading} onClick={() => { setLoading(true); setReload(value => value + 1) }}>Retry messages</Button></div>}
      {cursor !== null && <Button secondary disabled={loading || sending} onClick={() => void older()}>Load earlier messages</Button>}
      {loaded && !messages.length && !loading && <p>No messages yet. Say hello.</p>}
      {messages.map(message => {
        const mine = message.sender_id === userId
        const sender = message.sender_id === null ? undefined : participants.get(message.sender_id)
        const name = message.sender_id === null ? 'Deleted user' : sender?.display_name ?? 'Former member'
        return <div key={message.id} className={`pt-message-row ${mine ? 'is-mine' : ''}`}>
          {!mine && <PersonMark name={name} avatar={sender?.avatar_url} />}
          <div className="pt-message-content">{!mine && <span>{name}</span>}<div className={`pt-chat-bubble ${mine ? 'is-mine' : ''}`}>{message.body}</div><time dateTime={message.created_at}>{dateLabel(message.created_at)}</time>{message.id === lastMine?.id && seen && <span className="pt-message-sent">{seen}</span>}</div>
        </div>
      })}<div className="pt-messaging-mobile-plan"><DemoPlan /></div><div ref={bottom} />
    </section>
    {sendError && <p role="alert">{sendError}</p>}
    {loaded && !canSend && <p className="pt-messaging-closed">{others.length ? 'You can’t send messages in this conversation.' : 'No one else is in this conversation.'}</p>}
    <form className="pt-composer" aria-label="Send message" onSubmit={event => { event.preventDefault(); void send() }}>
      <div className="pt-composer-field"><label className="pt-sr-only" htmlFor="pt-message">Message</label><input id="pt-message" value={draft} maxLength={MESSAGE_MAX_LENGTH} disabled={!loaded || sending || !canSend} onChange={event => setDraft(event.target.value)} placeholder="Write a message…" autoComplete="off" /></div><Button type="submit" disabled={!loaded || loading || sending || !canSend || !draft.trim()}>{sending ? 'Sending…' : 'Send'}<Icon name="arrow" size={18} /></Button>
    </form>
  </>
}

// The prototype's shared Plan Card stays visibly separate from persisted chats.
function DemoPlan() {
  const { state, go } = usePrototype()
  const plan = state.plan
  if (!plan) return null
  const activity = activities.find(item => item.id === plan.activity)
  return <section className="pt-shared-plan"><span className="pt-badge">Local demo plan</span><h2>{activity?.name ?? 'Your plan'}</h2><p><strong>{planDate(plan)} · {planTime(plan)}</strong></p><p>{activity?.place}</p><p>This plan is not linked to a saved conversation.</p><Button secondary onClick={() => go('Confirmed')}>View demo plan</Button></section>
}
