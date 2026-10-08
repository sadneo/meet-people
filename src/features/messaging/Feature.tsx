import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { ConversationsSchema, HistorySchema, MESSAGE_MAX_LENGTH, MessageSchema, type Conversation, type Message, type Participant } from '../../../shared/messaging'
import { useSession } from '../../auth/useSession'
import { EventSignIn } from '../events/Auth'
import { Button, Header, Icon } from '../prototype/ui'
import { usePrototype } from '../prototype/context'
import { activities, planDate, planTime } from '../prototype/model'
import { conversationPath, messagingRequest } from './client'
import '../prototype/messages.css'
import './messaging.css'

function nameOf(conversation: Conversation | undefined, userId: string) {
  return conversation?.participants.filter(person => person.id !== userId).map(person => person.display_name).join(', ') || 'Conversation'
}
function Initials({ name }: { name: string }) {
  return <span className="pt-avatar pt-messaging-initials" aria-hidden="true">{name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('')}</span>
}
function dateLabel(timestamp: string) {
  return new Date(timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
function failureMessage(failure: unknown) { return failure instanceof Error ? failure.message : 'Could not load messages. Please try again.' }

export default function MessagesWorkspace() {
  const { session, ready } = useSession()
  if (!ready || !session) return <div className="pt-messaging-access"><Header title="Messages" />{ready ? <EventSignIn purpose="messages" /> : <p role="status">Checking sign-in…</p>}</div>
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
  useEffect(() => {
    const controller = new AbortController()
    void messagingRequest(`?page=${page}`, ConversationsSchema, { signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return
      setConversations(previous => page === 1 ? data.conversations : [...new Map([...previous, ...data.conversations].map(item => [item.id, item])).values()])
      setHasMore(data.hasMore); setError('')
    }).catch(failure => { if (!controller.signal.aborted) setError(failureMessage(failure)) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [page, reload])
  const selected = conversations.find(item => item.id === selectedId)
  const visible = conversations.filter(item => `${nameOf(item, userId)} ${item.latest_message?.body ?? ''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  function refresh() { setLoading(true); setPage(1); setReload(value => value + 1) }
  function saved(message: Message) {
    setConversations(items => items.map(item => item.id === message.conversation_id ? { ...item, latest_message: message } : item)
      .sort((a, b) => (b.latest_message?.created_at ?? b.created_at).localeCompare(a.latest_message?.created_at ?? a.created_at)))
    refresh()
  }
  return <div className="pt-messages-workspace">
    <section className="pt-inbox-pane" aria-label="Conversation inbox">
      <Header title="Messages" action={<Button secondary disabled={loading} onClick={refresh}>Refresh</Button>} />
      <label className="pt-conversation-search"><Icon name="search" /><span className="pt-sr-only">Search conversations</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search conversations…" /></label>
      {loading && <p role="status">Loading conversations…</p>}
      {error && <div role="alert"><p>{error}</p><Button secondary disabled={loading} onClick={refresh}>Retry conversations</Button></div>}
      <div className="pt-conversations">{visible.map(item => <button key={item.id} className={`pt-conversation ${item.id === selectedId ? 'is-selected' : ''}`} aria-current={item.id === selectedId ? 'true' : undefined} onClick={() => navigate(conversationPath(item.id))}>
        <Initials name={nameOf(item, userId)} /><span><strong>{nameOf(item, userId)}</strong><span>{item.latest_message?.body ?? 'Say hello'}</span></span><small>{dateLabel(item.latest_message?.created_at ?? item.created_at)}</small>
      </button>)}</div>
      {!loading && !error && !conversations.length && <div className="pt-empty"><h2>Your conversations start here</h2><p>Join an event group, then open its conversation.</p><Link to="/events">Find an event</Link></div>}
      {!loading && !!conversations.length && !visible.length && <p>No conversations match your search.</p>}
      {hasMore && <Button secondary disabled={loading} onClick={() => { setLoading(true); setPage(value => value + 1) }}>Load more conversations</Button>}
    </section>
    <section className="pt-conversation-pane" aria-label="Selected conversation">
      {selectedId ? <Chat key={selectedId} id={selectedId} userId={userId} conversation={selected} onSaved={saved} /> : <div className="pt-chat-placeholder">{pathname.endsWith('/chat') && <Link to="/messages">Back to messages</Link>}<Icon name="messages" size={48} /><h2>Choose a conversation</h2><p>Open a conversation from your inbox.</p></div>}
    </section>
    <aside className="pt-chat-details" aria-label="Conversation details">
      {selected && <section className="pt-contact-card pt-messaging-details"><h2>Participants</h2>{selected.participants.map(person => <div key={person.id}><Initials name={person.display_name} /><p>{person.display_name}{person.id === userId ? ' (you)' : ''}</p></div>)}</section>}
      <DemoPlan />
    </aside>
  </div>
}

function Chat({ id, userId, conversation, onSaved }: { id: string; userId: string; conversation?: Conversation; onSaved: (message: Message) => void }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [members, setMembers] = useState<Participant[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [sendError, setSendError] = useState('')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [reload, setReload] = useState(0)
  const active = useRef(true)
  const pending = useRef(false)
  const retry = useRef<{ body: string; id: string } | null>(null)
  const bottom = useRef<HTMLDivElement>(null)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  useEffect(() => {
    const controller = new AbortController()
    void messagingRequest(`/${id}/messages`, HistorySchema, { signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return
      setMessages(data.messages); setMembers(data.participants); setCursor(data.nextCursor); setLoadError(''); setLoaded(true)
    }).catch(failure => { if (!controller.signal.aborted) setLoadError(failureMessage(failure)) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [id, reload])
  const lastMessageId = messages.at(-1)?.id
  useEffect(() => { const pane = bottom.current?.parentElement; if (pane) pane.scrollTop = pane.scrollHeight }, [lastMessageId])
  async function older() {
    if (loading || !cursor) return
    setLoading(true)
    try {
      const data = await messagingRequest(`/${id}/messages?before=${cursor}`, HistorySchema)
      if (active.current) { setMessages(current => [...new Map([...data.messages, ...current].map(item => [item.id, item])).values()]); setCursor(data.nextCursor); setLoadError('') }
    } catch (failure) { if (active.current) setLoadError(failureMessage(failure)) }
    finally { if (active.current) setLoading(false) }
  }
  async function send() {
    const body = draft.trim()
    if (pending.current || !loaded || loading || !body) return
    pending.current = true; setSending(true); setSendError('')
    // Keep the same request ID after an ambiguous network failure. A retry cannot
    // insert a second copy when the original database write already succeeded.
    if (retry.current?.body !== body) retry.current = { body, id: crypto.randomUUID() }
    try {
      const saved = await messagingRequest(`/${id}/messages`, MessageSchema, { body: { body, clientRequestId: retry.current.id } })
      if (!active.current) return
      setMessages(current => [...current.filter(item => item.id !== saved.id), saved]); setDraft(''); retry.current = null; onSaved(saved)
    } catch (failure) { if (active.current) setSendError(`${failureMessage(failure)} Your draft is kept; retry Send.`) }
    finally { pending.current = false; if (active.current) setSending(false) }
  }
  const participants = new Map<string, Participant>(members.map(person => [person.id, person]))
  const title = members.filter(person => person.id !== userId).map(person => person.display_name).join(', ') || nameOf(conversation, userId)
  return <>
    <header className="pt-chat-header"><Link className="pt-icon-button pt-chat-back" to="/messages" aria-label="Back to messages"><Icon name="back" /></Link><div className="pt-chat-identity"><Initials name={title} /><div><h1>{title}</h1><p>Shared conversation</p></div></div><Button secondary disabled={loading || sending} onClick={() => { setLoading(true); setReload(value => value + 1) }}>Refresh messages</Button></header>
    <section className="pt-chat" aria-label="Message history" aria-live="polite">
      {loading && <p role="status">Loading messages…</p>}
      {loadError && <div role="alert"><p>{loadError}</p><Button secondary disabled={loading} onClick={() => { setLoading(true); setReload(value => value + 1) }}>Retry messages</Button></div>}
      {cursor && <Button secondary disabled={loading || sending} onClick={() => void older()}>Load earlier messages</Button>}
      {loaded && !messages.length && !loading && <p>No messages yet. Say hello.</p>}
      {messages.map(message => <div key={message.id} className={`pt-message-row ${message.sender_id === userId ? 'is-mine' : ''}`}>
        {message.sender_id !== userId && <Initials name={participants.get(message.sender_id)?.display_name ?? 'Student'} />}
        <div className="pt-message-content">{message.sender_id !== userId && <span>{participants.get(message.sender_id)?.display_name ?? 'Student'}</span>}<div className={`pt-chat-bubble ${message.sender_id === userId ? 'is-mine' : ''}`}>{message.body}</div><time dateTime={message.created_at}>{dateLabel(message.created_at)}</time></div>
      </div>)}<div className="pt-messaging-mobile-plan"><DemoPlan /></div><div ref={bottom} />
    </section>
    {sendError && <p role="alert">{sendError}</p>}
    <form className="pt-composer" aria-label="Send message" onSubmit={event => { event.preventDefault(); void send() }}>
      <div className="pt-composer-field"><label className="pt-sr-only" htmlFor="pt-message">Message</label><input id="pt-message" value={draft} maxLength={MESSAGE_MAX_LENGTH} disabled={!loaded || sending} onChange={event => setDraft(event.target.value)} placeholder="Write a message…" autoComplete="off" /></div><Button type="submit" disabled={!loaded || loading || sending || !draft.trim()}>{sending ? 'Sending…' : 'Send'}<Icon name="arrow" size={18} /></Button>
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
