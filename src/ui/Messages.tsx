import { ActiveFriends, GroupControls, type ActiveGroup } from './ActiveFriends';
import { matchingClient } from './matching-client';
import {
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
  type Message,
} from "../../shared/messaging";
import { messagingRequest } from "../features/messaging/client";
import { useAction, useLoad } from "./hooks";
import {
  ActionButton,
  Avatar,
  Empty,
  ErrorMessage,
  ResourceState,
  Modal,
} from "./common";
import { useCurrent } from "./current";
import { SafetyActions } from "./Safety";

export function Messages() {
  const current = useCurrent(),
    [search] = useSearchParams(),
    selectedGroup = search.get("group"),
    selected = selectedGroup ?? search.get("conversation"),
    [findGroup,setFindGroup] = useState(false),
    [page, setPage] = useState(1);
  const inbox = useLoad(
    useCallback(
      (signal) =>
        messagingRequest(`?page=${page}`, ConversationsSchema, { signal }),
      [page],
    ),
  );
  const groups = useLoad(useCallback(signal=>matchingClient(current.session.access_token).groups(signal),[current.session.access_token]))
  const reloadInbox=inbox.reload,reloadGroups=groups.reload
  const changed=useCallback(()=>{reloadInbox();reloadGroups()},[reloadInbox,reloadGroups])
  useEffect(()=>{window.addEventListener('pebble:matching-changed',changed);return()=>window.removeEventListener('pebble:matching-changed',changed)},[changed])
  return (
    <section className={`messaging-page ${selected ? "chat-selected" : ""}`}>
      <div className="pagehead">
        <h2>Messages</h2>
        <div className="row">
          <ActionButton onClick={()=>setFindGroup(true)}>Find a group</ActionButton>
          <Link to="/activity">Activity</Link>
          <ActionButton
            secondary
            onClick={changed}
            disabled={inbox.loading}
          >
            Refresh inbox
          </ActionButton>
        </div>
      </div>
      {findGroup&&<Modal title="Find a group" close={()=>setFindGroup(false)}><ActiveFriends key={current.session.user.id} close={()=>setFindGroup(false)} changed={changed}/></Modal>}
      <div className="live-messages">
        <aside className="live-inbox">
          <ResourceState
            loading={inbox.loading}
            error={inbox.error}
            reload={inbox.reload}
          />
          <ResourceState loading={groups.loading} error={groups.error} reload={groups.reload}/>
          {groups.value?.groups.map(group=>{const title=group.name||group.members.filter(person=>person.id!==current.session.user.id).map(person=>person.display_name).join(', ')||'Friends group';return <Link className={`conversation-row ${selectedGroup===group.id?'selected':''}`} key={group.id} to={`/messages/chat?group=${encodeURIComponent(group.id)}`}><Avatar name={title}/><span><b>{title}</b><span className="message-preview">{group.latestMessage?.body??'Say hello'}</span></span>{group.unreadCount>0&&<span className="unread-count" aria-label={`${group.unreadCount} unread messages`}>{group.unreadCount}</span>}</Link>})}
          {inbox.value && !inbox.value.conversations.length && !groups.value?.groups.length && (
            <Empty title="Your next conversation starts with a hello.">
              <Link to="/matchmaking">Find people</Link>
            </Empty>
          )}
          {inbox.value?.conversations.map((conversation) => {
            const others = conversation.participants.filter(
                (person) => person.id !== current.session.user.id,
              ),
              title =
                others.map((person) => person.display_name).join(", ") ||
                "Conversation";
            return (
              <Link
                className={`conversation-row ${selected === conversation.id ? "selected" : ""}`}
                key={conversation.id}
                to={`/messages/chat?conversation=${encodeURIComponent(conversation.id)}`}
              >
                <Avatar name={title} url={others[0]?.avatar_url} />
                <span>
                  <b>{title}</b>
                  <span className="message-preview">
                    {conversation.latest_message?.body ?? "Say hello"}
                  </span>
                </span>
                {conversation.unread_count > 0 && (
                  <span
                    className="unread-count"
                    aria-label={`${conversation.unread_count} unread messages`}
                  >
                    {conversation.unread_count}
                  </span>
                )}
              </Link>
            );
          })}
          {inbox.value && (
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
          <Chat key={`${current.session.user.id}:${selectedGroup?"group":"direct"}:${selected}`} id={selected} changed={changed} isGroup={!!selectedGroup} />
        ) : (
          <div className="chat-empty">
            <h3>Choose a conversation.</h3>
            <p>Or find someone new in Discover.</p>
          </div>
        )}
      </div>
    </section>
  );
}
function Chat({ id, changed, isGroup=false }: { id: string; changed: () => void; isGroup?: boolean }) {
  const [group,setGroup]=useState<ActiveGroup|null>(null)
  const current = useCurrent()
  const token = current.session.access_token
  const action = useAction(),
    history = useLoad(
      useCallback(async(signal)=>{
        if(!isGroup)return messagingRequest(`/${encodeURIComponent(id)}/messages`,HistorySchema,{signal})
        const [group,value]=await Promise.all([matchingClient(token).group(id,signal),matchingClient(token).history(id,undefined,signal)])
        if(!signal.aborted)setGroup(group)
        return {kind:'friends_group' as const,canSend:true,messages:value.messages,participants:group.members,nextCursor:value.nextCursor}
      },[token,id,isGroup])
    );
  const historyPage=async(before:number)=>isGroup?matchingClient(token).history(id,before):messagingRequest(`/${encodeURIComponent(id)}/messages?before=${before}`,HistorySchema)

  const [body, setBody] = useState(""),
    [older, setOlder] = useState<Message[]>([]),
    [cursor, setCursor] = useState<number | null>(null),
    [readError, setReadError] = useState("");
  const [confirmed, setConfirmed] = useState<Message[]>([]),
    retry = useRef<{ body: string; clientRequestId: string } | null>(null);
  const [uncertain, setUncertain] = useState(false);
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
  useEffect(() => {
    if (!newest || document.visibilityState !== "visible") return;
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
  }, [id, newest, changed, token, isGroup]);
  async function send(event: FormEvent) {
    event.preventDefault();
    await action.run(async () => {
      if (!history.value?.canSend || (!body.trim() && !retry.current)) return;
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
        <Link className="chat-back" to="/messages">
          ‹ Inbox
        </Link>
        <h3>
          {group?.name || others.map((person) => person.display_name).join(", ") ||
            "Conversation"}
        </h3>
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
          <SafetyActions id={others[0].id} name={others[0].display_name} />
        )}
      </header>
      {isGroup&&group&&<GroupControls group={group} changed={()=>{setOlder([]);setConfirmed([]);history.reload();changed()}}/>}
      <div className="chat-history" aria-label="Message history">
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
        {messages.map((message) => (
          <div
            className={`live-message ${message.sender_id === current.session.user.id ? "mine" : ""}`}
            key={message.id}
          >
            <p>{message.body}</p>
            <time dateTime={message.created_at}>
              {new Date(message.created_at).toLocaleString()}
            </time>
          </div>
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
          id="message"
          required
          maxLength={2000}
          rows={2}
          placeholder="Say a little hello…"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          disabled={!history.value?.canSend || action.busy || uncertain}
        />
        <button
          className="btn"
          disabled={!history.value?.canSend || action.busy || !body.trim()}
        >
          {action.busy ? "Sending…" : uncertain ? "Retry same message" : "Send"}
        </button>
      </form>
      {uncertain && (
        <p className="account-note">
          Delivery is unconfirmed. Retrying uses the same request ID to avoid a
          duplicate.
        </p>
      )}
    </section>
  );
}
