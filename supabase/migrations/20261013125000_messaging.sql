-- Persistent messaging. Replaces the unused draft conversations/messages tables
-- from 20260925000000_init_schema.sql; any draft rows become direct chats.
-- Like event company, only the verified Express service can access these tables.
-- It passes the caller's verified auth user ID into the functions below.
--
-- Each conversation has one source, and its membership follows that source:
--   direct       an accepted connection; the chat closes when the connection ends
--   event_group  an event-company group; leaving the group leaves the chat
-- Members see messages sent since they (re)joined, never messages from someone
-- they have a block with, and cannot send in a direct chat across a block.
-- Messages keep their text with a null sender when an account is deleted.

create temporary table messaging_draft_conversations as
  select id, user_a, user_b, created_at from public.conversations;
create temporary table messaging_draft_messages as
  select id, conversation_id, sender_id, regexp_replace(body, '^[[:space:]]+|[[:space:]]+$', '', 'g') body, created_at
  from public.messages;
drop trigger trg_connections_after_update on public.connections;
drop function public.connections_after_update();
drop function public.get_my_conversations();
drop function public.mark_conversation_read(bigint);
drop function public.get_unread_count();
drop table public.messages;
drop table public.conversations;

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('direct', 'event_group')),
  -- 'direct:<lower user>:<higher user>' or 'event_group:<group id>': one chat per source.
  source_key text not null unique,
  -- Sends lock this row to take the next seq, so seq order is commit order.
  last_seq bigint not null default 0,
  created_at timestamptz not null default now()
);
create table public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  -- Messages up to this seq predate the current membership and stay hidden.
  joined_after_seq bigint not null default 0,
  last_read_seq bigint not null default 0,
  left_at timestamptz,
  primary key (conversation_id, user_id)
);
create index conversation_participants_active_idx on public.conversation_participants(user_id) where left_at is null;
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  seq bigint not null check (seq > 0),
  sender_id uuid,
  body text not null check (char_length(body) between 1 and 2000 and body ~ '[^[:space:]]'),
  created_at timestamptz not null default now(),
  client_request_id uuid not null,
  unique (conversation_id, seq),
  unique (conversation_id, sender_id, client_request_id),
  foreign key (conversation_id, sender_id) references public.conversation_participants(conversation_id, user_id)
    on delete set null (sender_id)
);
create index messages_sender_recent_idx on public.messages(sender_id, created_at) where sender_id is not null;
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
revoke all on public.conversations, public.conversation_participants, public.messages from public, anon, authenticated;
grant select, insert, update, delete on public.conversations, public.conversation_participants, public.messages to service_role;

create function public.messaging_blocked(p_a uuid, p_b uuid)
returns boolean language sql stable set search_path = '' as $$
  select exists (select 1 from public.blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b) or (b.blocker_id = p_b and b.blocked_id = p_a));
$$;

-- True when the viewer must not see this sender's messages.
create function public.messaging_hidden(p_viewer uuid, p_sender uuid)
returns boolean language sql stable set search_path = '' as $$
  select p_sender is not null and p_sender <> p_viewer and public.messaging_blocked(p_viewer, p_sender);
$$;

-- Adds a member or brings back one who left. Coming back to a group chat starts
-- after its current last message; a reopened direct chat keeps its history
-- (nobody can send while it is closed).
create function public.messaging_join(p_conversation_id uuid, p_user_id uuid, p_keep_history boolean)
returns void language sql set search_path = '' as $$
  insert into public.conversation_participants as p (conversation_id, user_id, joined_after_seq, last_read_seq)
    select id, p_user_id, last_seq, last_seq from public.conversations where id = p_conversation_id
  on conflict (conversation_id, user_id) do update set left_at = null,
    joined_at = case when p_keep_history then p.joined_at else now() end,
    joined_after_seq = case when p_keep_history then p.joined_after_seq else excluded.joined_after_seq end,
    last_read_seq = case when p_keep_history then p.last_read_seq else excluded.last_read_seq end
  where p.left_at is not null;
$$;

create function public.messaging_open_direct(p_a uuid, p_b uuid)
returns uuid language plpgsql set search_path = '' as $$
declare
  conversation uuid;
begin
  insert into public.conversations(kind, source_key)
    values ('direct', 'direct:' || least(p_a, p_b) || ':' || greatest(p_a, p_b))
    on conflict (source_key) do update set kind = excluded.kind
    returning id into conversation;
  perform public.messaging_join(conversation, p_a, true);
  perform public.messaging_join(conversation, p_b, true);
  return conversation;
end;
$$;

create function public.messaging_close_direct(p_a uuid, p_b uuid)
returns void language sql set search_path = '' as $$
  update public.conversation_participants set left_at = now()
  where left_at is null and conversation_id = (select id from public.conversations
    where source_key = 'direct:' || least(p_a, p_b) || ':' || greatest(p_a, p_b));
$$;

-- The caller's current membership. Missing conversation: MSG01; not (or no
-- longer) a member: MSG03.
create function public.messaging_member(p_user_id uuid, p_conversation_id uuid)
returns public.conversation_participants language plpgsql stable set search_path = '' as $$
declare
  member public.conversation_participants;
begin
  select * into member from public.conversation_participants
    where conversation_id = p_conversation_id and user_id = p_user_id and left_at is null;
  if found then return member; end if;
  if exists (select 1 from public.conversations where id = p_conversation_id) then
    raise exception 'Not a participant' using errcode = 'MSG03';
  end if;
  raise exception 'Conversation missing' using errcode = 'MSG01';
end;
$$;

-- Null when the member may send now, otherwise the code a send raises. MSG05 is
-- the same whichever side made the block, so a sender cannot tell who did.
create function public.messaging_send_blocker(p_user_id uuid, p_conversation_id uuid)
returns text language sql stable set search_path = '' as $$
  select case
    when not exists (select 1 from public.conversation_participants p
      where p.conversation_id = c.id and p.user_id <> p_user_id and p.left_at is null) then 'MSG07'
    when c.kind = 'direct' and exists (select 1 from public.conversation_participants p
      where p.conversation_id = c.id and p.user_id <> p_user_id and p.left_at is null
        and public.messaging_blocked(p_user_id, p.user_id)) then 'MSG05'
  end
  from public.conversations c where c.id = p_conversation_id;
$$;

-- Current members only. Names and avatars follow the profiles visibility rule
-- (inactive profiles are hidden), then the event-company name, then "Student".
create function public.messaging_participants_json(p_conversation_id uuid)
returns jsonb language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.user_id,
      'display_name', coalesce(case when pr.is_active then pr.display_name end, ep.display_name, 'Student'),
      'avatar_url', case when pr.is_active and pr.avatar_url ~ '^https://[^[:space:]]{1,2040}$' then pr.avatar_url end,
      'last_read_seq', p.last_read_seq) order by p.joined_at, p.user_id), '[]'::jsonb)
  from public.conversation_participants p
    left join public.profiles pr on pr.id = p.user_id
    left join public.event_profiles ep on ep.user_id = p.user_id
  where p.conversation_id = p_conversation_id and p.left_at is null;
$$;

-- Service-only: the caller must be a current member of a group of two or more.
create function public.messaging_ensure_event_conversation(p_user_id uuid, p_group_id uuid)
returns uuid language plpgsql set search_path = '' as $$
declare
  event uuid;
  members uuid[];
  conversation uuid;
begin
  select event_id into event from public.event_groups where id = p_group_id;
  if not found then raise exception 'Group missing' using errcode = 'MSG02'; end if;
  -- Same lock as event_company_action; membership cannot change meanwhile.
  perform 1 from public.listings where id = event for update;
  select array_agg(user_id) into members from public.event_group_members where group_id = p_group_id;
  if not coalesce(p_user_id = any(members), false) then
    raise exception 'Not a group member' using errcode = 'MSG04';
  end if;
  if cardinality(members) < 2 then raise exception 'Group too small' using errcode = 'MSG06'; end if;
  select id into conversation from public.conversations where source_key = 'event_group:' || p_group_id;
  if not found then
    insert into public.conversations(kind, source_key) values ('event_group', 'event_group:' || p_group_id)
      returning id into conversation;
    perform public.messaging_join(conversation, member, false) from unnest(members) member;
  else
    -- Triggers apply later joins and leaves. This only brings back a member who
    -- left the chat but not the group.
    perform public.messaging_join(conversation, p_user_id, false);
  end if;
  return conversation;
end;
$$;

create function public.messaging_list_conversations(p_user_id uuid, p_page integer default 1)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  result jsonb;
begin
  if p_page is null or p_page not between 1 and 10000 then
    raise exception 'Invalid page' using errcode = 'MSG08';
  end if;
  with items as (
    select c.id, c.kind, c.created_at, p.joined_after_seq, p.last_read_seq, latest.message,
      coalesce(latest.created_at, p.joined_at) activity
    from public.conversation_participants p
      join public.conversations c on c.id = p.conversation_id
      left join lateral (select to_jsonb(m) - 'client_request_id' message, m.created_at from public.messages m
        where m.conversation_id = c.id and m.seq > p.joined_after_seq and not public.messaging_hidden(p_user_id, m.sender_id)
        order by m.seq desc limit 1) latest on true
    where p.user_id = p_user_id and p.left_at is null
    order by activity desc, c.id desc limit 51 offset (p_page - 1) * 50
  ), page as (select * from items order by activity desc, id desc limit 50)
  select jsonb_build_object('conversations', coalesce((select jsonb_agg(jsonb_build_object(
      'id', page.id, 'kind', page.kind, 'created_at', page.created_at,
      'participants', public.messaging_participants_json(page.id), 'latest_message', page.message,
      'unread_count', (select count(*) from (select 1 from public.messages m
        where m.conversation_id = page.id and m.seq > greatest(page.joined_after_seq, page.last_read_seq)
          and m.sender_id is distinct from p_user_id and not public.messaging_hidden(p_user_id, m.sender_id)
        limit 99) unread))
    order by page.activity desc, page.id desc) from page), '[]'::jsonb),
    'hasMore', (select count(*) > 50 from items)) into result;
  return result;
end;
$$;

-- Without p_after: the newest 50 visible messages, or the 50 before p_before.
-- With p_after: up to 50 visible messages after that seq, for polling.
create function public.messaging_history(p_user_id uuid, p_conversation_id uuid, p_before bigint default null, p_after bigint default null)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  member public.conversation_participants := public.messaging_member(p_user_id, p_conversation_id);
  messages jsonb;
  older boolean := false;
begin
  if (p_before is not null and p_after is not null) or p_before < 1 or p_after < 0 then
    raise exception 'Invalid cursor' using errcode = 'MSG08';
  end if;
  if p_after is null then
    with items as (
      select m.* from public.messages m
      where m.conversation_id = p_conversation_id and m.seq > member.joined_after_seq
        and (p_before is null or m.seq < p_before) and not public.messaging_hidden(p_user_id, m.sender_id)
      order by m.seq desc limit 51
    ), page as (select * from items order by seq desc limit 50)
    select coalesce((select jsonb_agg(to_jsonb(page) - 'client_request_id' order by page.seq) from page), '[]'::jsonb),
      (select count(*) > 50 from items)
      into messages, older;
  else
    select coalesce(jsonb_agg(to_jsonb(newer) - 'client_request_id' order by newer.seq), '[]'::jsonb) into messages
    from (select m.* from public.messages m
      where m.conversation_id = p_conversation_id and m.seq > greatest(member.joined_after_seq, p_after)
        and not public.messaging_hidden(p_user_id, m.sender_id)
      order by m.seq limit 50) newer;
  end if;
  return jsonb_build_object(
    'kind', (select kind from public.conversations where id = p_conversation_id),
    'canSend', public.messaging_send_blocker(p_user_id, p_conversation_id) is null,
    'messages', messages,
    'participants', public.messaging_participants_json(p_conversation_id),
    'nextCursor', case when older then (messages->0->>'seq')::bigint end);
end;
$$;

create function public.messaging_send(p_user_id uuid, p_conversation_id uuid, p_body text, p_request_id uuid)
returns jsonb language plpgsql set search_path = '' as $$
declare
  trimmed text := regexp_replace(p_body, '^[[:space:]]+|[[:space:]]+$', '', 'g');
  problem text;
  next_seq bigint;
  saved public.messages;
begin
  perform public.messaging_member(p_user_id, p_conversation_id);
  if trimmed is null or char_length(trimmed) not between 1 and 2000 or p_request_id is null then
    raise exception 'Invalid message' using errcode = 'MSG09';
  end if;
  -- One sender's sends run one at a time, so the retry check and rate limit
  -- below see every earlier send.
  perform pg_advisory_xact_lock(hashtextextended('messaging_send:' || p_user_id, 0));
  select * into saved from public.messages
    where conversation_id = p_conversation_id and sender_id = p_user_id and client_request_id = p_request_id;
  if found then
    -- A retry of a saved send returns the original instead of a second copy.
    if saved.body <> trimmed then raise exception 'Request ID reused' using errcode = 'MSG10'; end if;
    return to_jsonb(saved) - 'client_request_id';
  end if;
  problem := public.messaging_send_blocker(p_user_id, p_conversation_id);
  if problem is not null then raise exception 'Cannot send' using errcode = problem; end if;
  if (select count(*) from public.messages
      where sender_id = p_user_id and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Too many messages' using errcode = 'MSG11';
  end if;
  update public.conversations set last_seq = last_seq + 1 where id = p_conversation_id
    returning last_seq into next_seq;
  insert into public.messages(conversation_id, seq, sender_id, body, client_request_id)
    values (p_conversation_id, next_seq, p_user_id, trimmed, p_request_id)
    returning * into saved;
  update public.conversation_participants set last_read_seq = next_seq
    where conversation_id = p_conversation_id and user_id = p_user_id;
  return to_jsonb(saved) - 'client_request_id';
end;
$$;

create function public.messaging_mark_read(p_user_id uuid, p_conversation_id uuid, p_seq bigint)
returns bigint language plpgsql set search_path = '' as $$
declare
  saved bigint;
begin
  perform public.messaging_member(p_user_id, p_conversation_id);
  if p_seq is null or p_seq < 0 then raise exception 'Invalid cursor' using errcode = 'MSG08'; end if;
  -- Never past the last message, so later messages still count as unread.
  update public.conversation_participants p set last_read_seq = greatest(p.last_read_seq, least(p_seq, c.last_seq))
    from public.conversations c
    where c.id = p.conversation_id and p.conversation_id = p_conversation_id and p.user_id = p_user_id
    returning p.last_read_seq into saved;
  return saved;
end;
$$;

create function public.messaging_leave(p_user_id uuid, p_conversation_id uuid)
returns void language plpgsql set search_path = '' as $$
begin
  perform public.messaging_member(p_user_id, p_conversation_id);
  if (select kind from public.conversations where id = p_conversation_id) = 'direct' then
    raise exception 'Direct chats follow their connection' using errcode = 'MSG12';
  end if;
  update public.conversation_participants set left_at = now()
    where conversation_id = p_conversation_id and user_id = p_user_id;
end;
$$;

-- Accepting a connection opens its direct chat; ending it closes the chat for
-- both. Definer rights keep this working whichever role changes connections.
create function public.messaging_sync_connection()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  was_accepted boolean := tg_op <> 'INSERT' and old.status = 'accepted';
  is_accepted boolean := tg_op <> 'DELETE' and new.status = 'accepted';
begin
  if was_accepted and not is_accepted then
    perform public.messaging_close_direct(old.user_a, old.user_b);
  elsif is_accepted and not was_accepted then
    perform public.messaging_open_direct(new.user_a, new.user_b);
  end if;
  return null;
end;
$$;

-- Joining an event group joins its chat, if one exists; leaving the group leaves
-- it. Deleting the event itself is not anyone leaving, so its members keep the chat.
create function public.messaging_sync_event_group_member()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  conversation uuid;
begin
  if tg_op = 'INSERT' then
    select id into conversation from public.conversations where source_key = 'event_group:' || new.group_id;
    if found then perform public.messaging_join(conversation, new.user_id, false); end if;
  elsif exists (select 1 from public.listings where id = old.event_id) then
    update public.conversation_participants set left_at = now()
      where user_id = old.user_id and left_at is null and conversation_id =
        (select id from public.conversations where source_key = 'event_group:' || old.group_id);
  end if;
  return null;
end;
$$;

-- Carry over draft rows as direct chats. Draft read state is not kept: carried
-- messages start out read. Chats with an accepted connection reopen below.
insert into public.conversations(kind, source_key, created_at)
  select 'direct', 'direct:' || user_a || ':' || user_b, coalesce(created_at, now())
  from messaging_draft_conversations where user_a is not null and user_b is not null;
insert into public.conversation_participants(conversation_id, user_id, joined_at, left_at)
  select c.id, member, c.created_at, now()
  from messaging_draft_conversations d
    join public.conversations c on c.source_key = 'direct:' || d.user_a || ':' || d.user_b
    cross join unnest(array[d.user_a, d.user_b]) member;
insert into public.messages(conversation_id, seq, sender_id, body, created_at, client_request_id)
  select c.id, row_number() over (partition by c.id order by m.created_at, m.id), m.sender_id, m.body,
    coalesce(m.created_at, now()), gen_random_uuid()
  from messaging_draft_messages m
    join messaging_draft_conversations d on d.id = m.conversation_id
    join public.conversations c on c.source_key = 'direct:' || d.user_a || ':' || d.user_b
  where m.sender_id in (d.user_a, d.user_b) and char_length(m.body) between 1 and 2000;
update public.conversations c set last_seq = coalesce((select max(seq) from public.messages m where m.conversation_id = c.id), 0);
update public.conversation_participants p set last_read_seq = c.last_seq from public.conversations c where c.id = p.conversation_id;
drop table messaging_draft_messages, messaging_draft_conversations;

select public.messaging_open_direct(user_a, user_b) from public.connections where status = 'accepted';
create trigger messaging_sync_connection after insert or update or delete on public.connections
  for each row execute function public.messaging_sync_connection();
create trigger messaging_sync_event_group_member after insert or delete on public.event_group_members
  for each row execute function public.messaging_sync_event_group_member();

do $$
declare
  f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname like 'messaging\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;
