import { ActiveFriends, GroupControls, type ActiveGroup } from './ActiveFriends';
import { matchingClient } from './matching-client';
import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link, useSearchParams } from "react-router";
import {
  ConversationsSchema,
  HistorySchema,
  MessageSchema,
  ReadStateSchema,
  MessagingActivitySchema,
  type Message,
} from "../../shared/messaging";
import { messagingRequest } from "../features/messaging/client";
import { useCachedLoad } from "../data/useCachedLoad";
import { useAction } from "./hooks";
import {
  ActionButton,
  Avatar,
  Icon,
  PersonPhoto,
  Empty,
  ErrorMessage,
  ResourceState,
  Modal,
} from "./common";
import { useCurrent } from "./current";
import { SafetyActions } from "./Safety";
import { connections } from '../features/connections/client';

function inboxTime(value: string | undefined) {
  if (!value) return '';
  const date = new Date(value), now = new Date();
  if (Number.isNaN(date.getTime())) return '';
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  return date.toDateString() === yesterday.toDateString() ? 'Yesterday' : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function Messages() {
  const current = useCurrent(),
    [search] = useSearchParams(),
    selectedGroup = search.get("group"),
    selected = selectedGroup ?? search.get("conversation"),
    [query, setQuery] = useState(''),
    [drafts, setDrafts] = useState<Record<string, string>>({}),
    [findGroup,setFindGroup] = useState(false),
    [page, setPage] = useState(1);
  const inbox = useCachedLoad(
    useCallback(
      (signal) =>
        messagingRequest(`?page=${page}`, ConversationsSchema, { signal }),
      [page],
    ),
    ["inbox", page], 5000,
  );
  const groups = useCachedLoad(useCallback(signal=>matchingClient(current.session.access_token).groups(signal),[current.session.access_token]),["groups"],5000)
  const activity = useCachedLoad(useCallback(signal => messagingRequest('/activity', MessagingActivitySchema, { signal }), []), ['activity'],2000);
  const reloadInbox=inbox.reload,reloadGroups=groups.reload,reloadActivity=activity.reload
  const changed=useCallback(()=>{reloadInbox();reloadGroups();reloadActivity()},[reloadInbox,reloadGroups,reloadActivity])
  useEffect(()=>{window.addEventListener('pebble:matching-changed',changed);return()=>window.removeEventListener('pebble:matching-changed',changed)},[changed])
  useEffect(() => { const refresh = () => { if (document.visibilityState === 'visible') changed(); }; window.addEventListener('focus', refresh); return () => window.removeEventListener('focus', refresh); }, [changed]);
  const rows = [
    ...(groups.value?.groups ?? []).map(group => ({ id: group.id, group: true, title: group.name || group.members.filter(person => person.id !== current.session.user.id).map(person => person.display_name).join(', ') || 'Friends group',
      people: group.members.filter(person => person.id !== current.session.user.id).map(person => ({ id: person.id, display_name: person.display_name, avatar_url: null as string | null })),
      preview: group.latestMessage?.body ?? 'Say hello', date: group.latestMessage?.created_at, unread: group.unreadCount, label: 'Friends',
    })),
    ...(inbox.value?.conversations ?? []).map(conversation => {
      const people = conversation.participants.filter(person => person.id !== current.session.user.id);
      return { id: conversation.id, group: false, title: people.map(person => person.display_name).join(', ') || 'Conversation', people,
        preview: conversation.latest_message?.body ?? 'Say hello', date: conversation.latest_message?.created_at ?? conversation.created_at,
        unread: conversation.unread_count, label: conversation.kind === 'direct' ? conversation.mode === 'friends' ? 'Friends' : conversation.mode === 'dating' ? 'Dating' : '' : conversation.kind === 'event_group' ? 'Event group' : 'Friends',
      };
    }),
  ].sort((a, b) => (Date.parse(b.date ?? '') || 0) - (Date.parse(a.date ?? '') || 0) || a.id.localeCompare(b.id));
  const filtered = rows.filter(row => `${row.title} ${row.preview}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const draftKey = `${current.session.user.id}:${selectedGroup ? 'group' : 'direct'}:${selected}`;
  return (
    <section className={`messaging-page ${selected ? "chat-selected" : ""}`}>
      <div className="pagehead">
        <h2>Messages</h2>
        <div className="row messages-header-actions">
          <button type="button" className="messages-group-action" aria-label="Find a group" onClick={()=>setFindGroup(true)}><Icon name="Friends" /><span>Find a group</span></button>
          <Link className="round messages-activity" to="/activity" aria-label="Activity inbox"><Icon name="Bell" /></Link>
        </div>
      </div>
      {findGroup&&<Modal title="Find a group" close={()=>setFindGroup(false)}><ActiveFriends key={current.session.user.id} close={()=>setFindGroup(false)} changed={changed}/></Modal>}
      <div className="live-messages">
        <aside className="live-inbox">
          <div className="inbox-search">
            <label className="sr-only" htmlFor="chat-search">Search conversations</label>
            <input id="chat-search" type="search" placeholder="Search" value={query} onChange={event => setQuery(event.target.value)} />
          </div>
          <Link className="requests-link" to="/messages/requests"><span>Requests{activity.value && activity.value.incomingRequests > 0 && <span className="request-count">{activity.value.incomingRequests}</span>}</span><span aria-hidden="true">›</span></Link>
          <ResourceState
            loading={inbox.loading}
            error={inbox.error}
            reload={inbox.reload}
          />
          <ResourceState loading={groups.loading} error={groups.error} reload={groups.reload}/>
          {inbox.value && groups.value && !inbox.value.conversations.length && !groups.value.groups.length && (
            <Empty title="Your next conversation starts with a hello.">
              <Link to="/matchmaking">Find people</Link>
            </Empty>
          )}
          {filtered.map(row => {
            return (
              <Link
                className={`conversation-row contact-row ${selected === row.id ? "selected" : ""}`}
                key={`${row.group ? 'group' : 'direct'}:${row.id}`}
                to={`/messages/chat?${row.group ? 'group' : 'conversation'}=${encodeURIComponent(row.id)}`}
              >
                {row.people.length > 1 ? <span className="group-avatar">{row.people.slice(0, 2).map(person => <PersonPhoto key={person.id} id={person.id} name={person.display_name} fallback={person.avatar_url} />)}</span>
                  : row.people[0] ? <PersonPhoto id={row.people[0].id} name={row.title} fallback={row.people[0].avatar_url} /> : <Avatar name={row.title} />}
                <span className="contact-copy">
                  <span className="contact-top"><b>{row.title}</b><small><time dateTime={row.date}>{inboxTime(row.date)}</time></small></span>
                  <span className="contact-bottom"><span className={`contact-preview ${row.unread ? 'unread' : ''}`}>{row.preview}</span>
                    {row.unread > 0 && <span className="unread-count" aria-label={`${row.unread} unread messages`}>{row.unread}</span>}
                  </span>
                  {row.label && <span className={`connection-kind ${row.label === 'Dating' ? 'dating' : ''}`}>{row.label}</span>}
                </span>
              </Link>
            );
          })}
          {query.trim() && rows.length > 0 && !filtered.length && <p className="contact-empty">No conversations match “{query.trim()}”.</p>}
          {query.trim() && inbox.value?.hasMore && <p className="contact-empty">Search is limited to this page of conversations.</p>}
          {inbox.value && (page > 1 || inbox.value.hasMore) && (
            <div className="row pagination">
              <ActionButton
                secondary
                disabled={page <= 1 || inbox.loading}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous
              </ActionButton>
              <ActionButton
                secondary
                disabled={!inbox.value.hasMore || inbox.loading}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </ActionButton>
            </div>
          )}
        </aside>
        {selected ? (
          <Chat key={draftKey} id={selected} changed={changed} isGroup={!!selectedGroup} initialDraft={drafts[draftKey] ?? ''} saveDraft={value => setDrafts(previous => {
            const next = { ...previous };
            if (value) next[draftKey] = value; else delete next[draftKey];
            return next;
          })} />
        ) : (
          <div className="chat-empty">
            <Icon name="Messages"/>
            <p>Select a conversation</p>
          </div>
        )}
      </div>
    </section>
  );
}
function Chat({ id, changed, isGroup=false, initialDraft, saveDraft }: { id: string; changed: () => void; isGroup?: boolean; initialDraft: string; saveDraft: (value: string) => void }) {
  const [group,setGroup]=useState<ActiveGroup|null>(null)
  const [removeOpen, setRemoveOpen] = useState(false);
  const historyElement = useRef<HTMLDivElement>(null), lastVisibleMessage = useRef<string | null>(null);
  const current = useCurrent()
  const token = current.session.access_token
  const action = useAction(),
    history = useCachedLoad(
      useCallback(async(signal)=>{
        if(!isGroup)return messagingRequest(`/${encodeURIComponent(id)}/messages`,HistorySchema,{signal})
        const [group,value]=await Promise.all([matchingClient(token).group(id,signal),matchingClient(token).history(id,undefined,signal)])
        if(!signal.aborted)setGroup(group)
        return {kind:'friends_group' as const,canSend:true,messages:value.messages,participants:group.members,nextCursor:value.nextCursor}
      },[token,id,isGroup]),
      ["message-history", isGroup ? "group" : "direct", id], 0,
    );
  const historyPage=async(before:number)=>isGroup?matchingClient(token).history(id,before):messagingRequest(`/${encodeURIComponent(id)}/messages?before=${before}`,HistorySchema)

  const [body, setBody] = useState(initialDraft),
    [older, setOlder] = useState<Message[]>([]),
    [cursor, setCursor] = useState<number | null>(null),
    [readError, setReadError] = useState("");
  const [confirmed, setConfirmed] = useState<Message[]>([]),
    retry = useRef<{ body: string; clientRequestId: string } | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const composer = useRef<HTMLTextAreaElement>(null),
    focusAfterSend = useRef(false);
  useEffect(() => {
    if (focusAfterSend.current && !action.busy && !uncertain && !history.refreshing && history.value?.canSend) {
      composer.current?.focus();
      focusAfterSend.current = false;
    }
  }, [action.busy, uncertain, history.refreshing, history.value?.canSend]);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const reloadHistory=history.reload
  useEffect(()=>{const refresh=()=>{setOlder([]);setConfirmed([]);reloadHistory()};window.addEventListener('pebble:matching-changed',refresh);return()=>window.removeEventListener('pebble:matching-changed',refresh)},[reloadHistory])
  const messages = [
    ...new Map(
      [...older, ...(history.value?.messages ?? []), ...confirmed].map(
        (message) => [message.id, message],
      ),
    ).values(),
  ].sort((a, b) => a.seq - b.seq);
  const newest = history.value?.messages.at(-1)?.seq ?? 0;
  const lastMessage = messages.at(-1);
  useEffect(() => {
    const element = historyElement.current;
    if (!element || !lastMessage || lastVisibleMessage.current === lastMessage.id) return;
    if (!lastVisibleMessage.current || element.scrollHeight - element.scrollTop - element.clientHeight < 120 || lastMessage.sender_id === current.session.user.id) element.scrollTop = element.scrollHeight;
    lastVisibleMessage.current = lastMessage.id;
  }, [lastMessage, current.session.user.id]);
  useEffect(() => {
    if (history.refreshing || !newest || document.visibilityState !== "visible") return;
    const controller = new AbortController();
    void (isGroup?matchingClient(token).read(id,newest,controller.signal):messagingRequest(`/${encodeURIComponent(id)}/read`,ReadStateSchema,{body:{seq:newest},signal:controller.signal}))
      .then(() => {
        if (!controller.signal.aborted) {
          setReadError("");
          window.dispatchEvent(new Event("pebble:activity-changed"));
          changed();
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setReadError(
            "Read status could not be saved. Refresh messages to check again.",
          );
      });
    return () => controller.abort();
  }, [id, newest, changed, token, isGroup, history.refreshing]);
  async function send(event: FormEvent) {
    event.preventDefault();
    await action.run(async () => {
      if (history.refreshing || !history.value?.canSend || (!body.trim() && !retry.current)) return;
      retry.current ??= {
        body: body.trim(),
        clientRequestId: crypto.randomUUID(),
      };
      setUncertain(true);
      const saved = isGroup?await matchingClient(token).send(id,retry.current):await messagingRequest(`/${encodeURIComponent(id)}/messages`,MessageSchema,{body:retry.current});
      if (!live.current) return;
      if (
        saved.conversation_id !== id ||
        saved.sender_id !== current.session.user.id ||
        saved.body !== retry.current.body
      )
        throw new Error(
          "The message response could not be confirmed. Refresh messages before retrying.",
        );
      setConfirmed((value) => [...value, saved]);
      retry.current = null;
      setUncertain(false);
      setBody("");
      saveDraft('');
      history.reload();
      changed();
    });
  }
  const others =
    history.value?.participants.filter(
      (person) => person.id !== current.session.user.id,
    ) ?? [];
  const olderCursor = cursor ?? history.value?.nextCursor;
  return (
    <section className="live-chat">
      <header className="chat-header">
        <Link className="chat-back" to="/messages" aria-label="Back to conversations">
          <Icon name="Back" />
        </Link>
        {others[0] && <PersonPhoto id={others[0].id} name={others[0].display_name} fallback={others[0].avatar_url} />}
        <h3>
          {group?.name || others.map((person) => person.display_name).join(", ") ||
            "Conversation"}
        </h3>
        <details className="chat-options" onKeyDown={event => {
          if (event.key === 'Escape') {
            event.currentTarget.open = false;
            event.currentTarget.querySelector('summary')?.focus();
          }
        }}>
          <summary className="round" aria-label="Conversation options and safety"><Icon name="More" /></summary>
          <div className="chat-options-menu">
          <ActionButton
          secondary
          disabled={action.busy}
          onClick={() => {
            setConfirmed([]);
            history.reload();
          }}
        >
          Refresh messages
        </ActionButton>
        {history.value?.kind === "direct" && others[0] && (
          <><SafetyActions id={others[0].id} name={others[0].display_name} />
          <ActionButton secondary onClick={() => setRemoveOpen(true)}>Remove connection</ActionButton></>
        )}
          </div>
        </details>
      </header>
      {removeOpen && others[0] && <Modal title="Remove connection?" close={() => setRemoveOpen(false)}>
        <p>Remove your connection with {others[0].display_name}? This does not block the account or erase saved messages.</p>
        <ErrorMessage>{action.error}</ErrorMessage>
        <ActionButton disabled={action.busy} onClick={() => { void action.run(async () => {
          await connections.remove(others[0].id);
          if (!live.current) return;
          setRemoveOpen(false); history.reload(); changed(); window.dispatchEvent(new Event('pebble:activity-changed'));
        }); }}>Remove connection</ActionButton>
        <ActionButton secondary disabled={action.busy} onClick={() => setRemoveOpen(false)}>Cancel</ActionButton>
      </Modal>}
      {isGroup&&group&&<GroupControls group={group} changed={()=>{setOlder([]);setConfirmed([]);history.reload();changed()}}/>}
      <div className="chat-history" aria-label="Message history" role="log" aria-live="polite" ref={historyElement}>
        <ResourceState
          loading={history.loading}
          error={history.error}
          reload={history.reload}
        />
        <ErrorMessage>{readError}</ErrorMessage>
        {olderCursor !== null &&
          olderCursor !== undefined &&
          olderCursor >= 0 && (
            <ActionButton
              secondary
              disabled={action.busy}
              onClick={() => {
                void action.run(async () => {
                  const value = await historyPage(olderCursor);
                  if (!live.current) return;
                  setOlder((items) => [...value.messages, ...items]);
                  setCursor(value.nextCursor ?? -1);
                });
              }}
            >
              Load earlier messages
            </ActionButton>
          )}
        {history.value && !messages.length && (
          <p>No messages yet. Say hello.</p>
        )}
        {messages.map((message, index) => (
          <Fragment key={message.id}>
          {(index === 0 || new Date(messages[index - 1].created_at).toDateString() !== new Date(message.created_at).toDateString()) && <div className="chat-date">{new Date(message.created_at).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}</div>}
          <div
            className={`live-message ${message.sender_id === current.session.user.id ? "mine" : ""}`}
          >
            {isGroup && message.sender_id !== current.session.user.id && <small className="sender-name">{history.value?.participants.find(person => person.id === message.sender_id)?.display_name ?? 'Group member'}</small>}
            <p>{message.body}</p>
            <time dateTime={message.created_at}>
              {new Date(message.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              {message.sender_id === current.session.user.id && ` · ${others.length > 0 && others.every(person => person.last_read_seq >= message.seq) ? 'Read' : 'Sent'}`}
            </time>
          </div>
          </Fragment>
        ))}
      </div>
      <ErrorMessage>{action.error}</ErrorMessage>
      {history.value && !history.value.canSend && (
        <p>You can’t send messages in this conversation.</p>
      )}
      <form className="live-composer" onSubmit={(event) => void send(event)}>
        <label className="sr-only" htmlFor="message">
          Message
        </label>
        <textarea
          ref={composer}
          id="message"
          required
          maxLength={2000}
          rows={1}
          placeholder="Message…"
          value={body}
          onChange={(event) => { setBody(event.target.value); saveDraft(event.target.value); }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
            event.preventDefault();
            if (event.repeat || !body.trim() || !history.value?.canSend || history.refreshing || action.busy || uncertain) return;
            focusAfterSend.current = true;
            event.currentTarget.form?.requestSubmit();
          }}
          aria-describedby="message-keyboard-help"
          disabled={!history.value?.canSend || history.refreshing || action.busy || uncertain}
        />
        <button
          className={`btn message-send ${uncertain ? 'retry' : ''}`}
          aria-label={action.busy ? 'Sending…' : uncertain ? 'Retry same message' : 'Send'}
          disabled={!history.value?.canSend || history.refreshing || action.busy || !body.trim()}
        >
          {action.busy ? "…" : uncertain ? "Retry same message" : <Icon name="Send" />}
        </button>
      </form>
      <p id="message-keyboard-help" className="account-note">
        Enter to send · Shift+Enter for a new line.
      </p>
      {uncertain && (
        <p className="account-note">
          Delivery is unconfirmed. Retrying uses the same request ID to avoid a
          duplicate.
        </p>
      )}
    </section>
  );
}
