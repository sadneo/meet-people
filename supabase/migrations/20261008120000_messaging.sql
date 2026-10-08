-- Persistent messaging. Apply explicitly after team review; no profile changes.
-- Like event company, only the verified Express service can access these tables.
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  participant_key text not null unique,
  created_at timestamptz not null default now()
);
create table public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (conversation_id, user_id)
);
create index conversation_participants_user_idx on public.conversation_participants(user_id, conversation_id);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null,
  body text not null check (char_length(body) between 1 and 2000 and body ~ '[^[:space:]]'),
  created_at timestamptz not null default now(),
  client_request_id uuid not null,
  foreign key (conversation_id, sender_id) references public.conversation_participants(conversation_id, user_id) on delete cascade,
  unique (conversation_id, sender_id, client_request_id)
);
create index messages_history_idx on public.messages(conversation_id, created_at desc, id desc);
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
revoke all on public.conversations, public.conversation_participants, public.messages from public, anon, authenticated;
grant select, insert, update, delete on public.conversations, public.conversation_participants, public.messages to service_role;

-- Exact participant set, independent of order. Unique key serializes concurrent
-- requests; conversation and participants are committed in the same transaction.
-- Service-only: caller must verify a mutually accepted match before invoking.
create function public.messaging_ensure_conversation(p_participant_ids uuid[])
returns uuid language plpgsql set search_path = '' as $$
declare
  ids uuid[];
  conversation uuid;
begin
  if p_participant_ids is null or array_position(p_participant_ids, null) is not null then
    raise exception 'Invalid participants' using errcode = '22023';
  end if;
  select array_agg(distinct u order by u) into ids from unnest(p_participant_ids) u;
  if coalesce(cardinality(ids), 0) not between 2 and 5 then
    raise exception 'Invalid participants' using errcode = '22023';
  end if;
  if (select count(*) from auth.users where id = any(ids)) <> cardinality(ids) then
    raise exception 'Unknown participant' using errcode = '22023';
  end if;
  insert into public.conversations(participant_key) values (array_to_string(ids, ','))
    on conflict (participant_key) do update set participant_key = excluded.participant_key
    returning id into conversation;
  insert into public.conversation_participants(conversation_id, user_id)
    select conversation, unnest(ids) on conflict do nothing;
  return conversation;
end;
$$;

create function public.messaging_ensure_event_conversation(p_user_id uuid, p_group_id uuid)
returns uuid language plpgsql set search_path = '' as $$
declare
  event uuid;
  ids uuid[];
begin
  select event_id into event from public.event_groups where id = p_group_id;
  if not found then raise exception 'Group missing' using errcode = 'P0002'; end if;
  -- Same lock as event_company_action; membership cannot change mid-snapshot.
  perform 1 from public.listings where id = event for update;
  select array_agg(user_id order by user_id) into ids
    from public.event_group_members where group_id = p_group_id;
  if not coalesce(p_user_id = any(ids), false) then
    raise exception 'Not a group member' using errcode = '42501';
  end if;
  return public.messaging_ensure_conversation(ids);
end;
$$;

create function public.messaging_check_participant(p_user_id uuid, p_conversation_id uuid)
returns void language plpgsql stable set search_path = '' as $$
begin
  if not exists (select 1 from public.conversations where id = p_conversation_id) then
    raise exception 'Conversation missing' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.conversation_participants where conversation_id = p_conversation_id and user_id = p_user_id) then
    raise exception 'Not a participant' using errcode = '42501';
  end if;
end;
$$;

create function public.messaging_list_conversations(p_user_id uuid, p_page integer default 1)
returns jsonb language plpgsql stable set search_path = '' as $$
declare result jsonb;
begin
  if p_page not between 1 and 10000 then raise exception 'Invalid page' using errcode = '22023'; end if;
  with items as (
    select c.id, c.created_at,
      (select jsonb_agg(jsonb_build_object('id', p.user_id,
        'display_name', coalesce(ep.display_name, 'Student'), 'avatar_url', null) order by p.user_id)
        from public.conversation_participants p left join public.event_profiles ep on ep.user_id = p.user_id
        where p.conversation_id = c.id) participants,
      latest.message latest_message,
      coalesce(latest.created_at, c.created_at) activity
    from public.conversations c
      join public.conversation_participants mine on mine.conversation_id = c.id and mine.user_id = p_user_id
      left join lateral (select to_jsonb(m) message, m.created_at from public.messages m
        where m.conversation_id = c.id order by m.created_at desc, m.id desc limit 1) latest on true
    order by activity desc, c.id desc limit 51 offset (p_page - 1) * 50
  ), page as (select * from items order by activity desc, id desc limit 50)
  select jsonb_build_object('conversations', coalesce((select jsonb_agg(
    jsonb_build_object('id', id, 'created_at', created_at, 'participants', participants, 'latest_message', latest_message)
    order by activity desc, id desc) from page), '[]'::jsonb), 'hasMore', (select count(*) > 50 from items)) into result;
  return result;
end;
$$;

create function public.messaging_history(p_user_id uuid, p_conversation_id uuid, p_before uuid default null)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  before_time timestamptz;
  result jsonb;
begin
  perform public.messaging_check_participant(p_user_id, p_conversation_id);
  if p_before is not null then
    select created_at into before_time from public.messages where id = p_before and conversation_id = p_conversation_id;
    if not found then raise exception 'Invalid cursor' using errcode = '22023'; end if;
  end if;
  with items as (
    select * from public.messages where conversation_id = p_conversation_id
      and (p_before is null or (created_at, id) < (before_time, p_before))
      order by created_at desc, id desc limit 51
  ), page as (select * from items order by created_at desc, id desc limit 50)
  select jsonb_build_object('messages', coalesce((select jsonb_agg(to_jsonb(page) order by created_at, id) from page), '[]'::jsonb),
    'nextCursor', case when (select count(*) > 50 from items) then
      (select id from page order by created_at, id limit 1) else null end,
    'participants', (select jsonb_agg(jsonb_build_object('id', p.user_id,
      'display_name', coalesce(ep.display_name, 'Student'), 'avatar_url', null) order by p.user_id)
      from public.conversation_participants p left join public.event_profiles ep on ep.user_id = p.user_id
      where p.conversation_id = p_conversation_id)) into result;
  return result;
end;
$$;

create function public.messaging_send(p_user_id uuid, p_conversation_id uuid, p_body text, p_request_id uuid)
returns jsonb language plpgsql set search_path = '' as $$
declare saved public.messages;
begin
  perform public.messaging_check_participant(p_user_id, p_conversation_id);
  if p_body is null or char_length(btrim(p_body)) not between 1 and 2000 or p_body !~ '[^[:space:]]' or p_request_id is null then
    raise exception 'Invalid message' using errcode = '22023';
  end if;
  insert into public.messages(conversation_id, sender_id, body, client_request_id)
    values (p_conversation_id, p_user_id, btrim(p_body), p_request_id)
    on conflict (conversation_id, sender_id, client_request_id) do update set client_request_id = excluded.client_request_id
    returning * into saved;
  if saved.body <> btrim(p_body) then raise exception 'Request ID reused with different content' using errcode = '22023'; end if;
  return to_jsonb(saved);
end;
$$;

revoke all on function public.messaging_ensure_conversation(uuid[]), public.messaging_ensure_event_conversation(uuid,uuid),
  public.messaging_check_participant(uuid,uuid), public.messaging_list_conversations(uuid,integer),
  public.messaging_history(uuid,uuid,uuid), public.messaging_send(uuid,uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.messaging_ensure_conversation(uuid[]), public.messaging_ensure_event_conversation(uuid,uuid),
  public.messaging_check_participant(uuid,uuid), public.messaging_list_conversations(uuid,integer),
  public.messaging_history(uuid,uuid,uuid), public.messaging_send(uuid,uuid,text,uuid) to service_role;
