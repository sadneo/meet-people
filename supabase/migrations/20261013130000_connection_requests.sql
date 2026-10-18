-- Connection requests go through the verified Express service, like messaging.
-- Browsers keep read access to their own rows but can no longer write them: the
-- old accept policy only checked the new status, so a recipient could rewrite
-- who a connection was between and pull in someone who never agreed.
drop policy "Users create their own requests" on public.connections;
drop policy "Recipient accepts pending request" on public.connections;
drop policy "Participants delete own connections" on public.connections;
revoke all on public.connections from anon, authenticated;
grant select on public.connections to authenticated;

-- Every request ever sent, so cancelling one does not refund the daily limit.
create table public.connection_request_log (
  initiated_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index connection_request_log_recent_idx on public.connection_request_log(initiated_by, created_at);
alter table public.connection_request_log enable row level security;
revoke all on public.connection_request_log from public, anon, authenticated;
grant select, insert, delete on public.connection_request_log to service_role;

-- Same checks as before, now safe under an empty search_path (the service
-- functions below set one) and counting by initiator, because auth.uid() is
-- empty for server calls. Codes are mapped by the API.
create or replace function public.connections_before_insert()
returns trigger language plpgsql set search_path = '' as $$
declare
  a uuid := least(new.user_a, new.user_b);
  b uuid := greatest(new.user_a, new.user_b);
begin
  new.user_a := a;
  new.user_b := b;
  if new.initiated_by is distinct from a and new.initiated_by is distinct from b then
    raise exception 'initiated_by must be a participant';
  end if;
  if public.messaging_blocked(a, b) then
    raise exception 'Blocked relationship' using errcode = 'CON02';
  end if;
  if (select count(*) from public.connection_request_log
      where initiated_by = new.initiated_by and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'Connection request rate limit exceeded' using errcode = 'CON04';
  end if;
  insert into public.connection_request_log(initiated_by) values (new.initiated_by);
  return new;
end;
$$;

-- How the other person appears: nothing for inactive or missing profiles.
create function public.connection_person_json(p_user_id uuid)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('id', p.id, 'display_name', p.display_name,
    'avatar_url', case when p.avatar_url ~ '^https://[^[:space:]]{1,2040}$' then p.avatar_url end)
  from public.profiles p where p.id = p_user_id and p.is_active;
$$;

-- 'none' | 'sent' | 'incoming' | 'connected', with the direct chat once connected.
create function public.connection_state(p_user_id uuid, p_other_id uuid)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'status', case when c.id is null then 'none' when c.status = 'accepted' then 'connected'
      when c.initiated_by = p_user_id then 'sent' else 'incoming' end,
    'conversationId', case when c.status = 'accepted' then (select k.id from public.conversations k
      where k.source_key = 'direct:' || least(p_user_id, p_other_id) || ':' || greatest(p_user_id, p_other_id)) end)
  from (select 1) one
    left join public.connections c on c.user_a = least(p_user_id, p_other_id) and c.user_b = greatest(p_user_id, p_other_id);
$$;

-- Sends a request. If the other person already asked, this accepts instead.
create function public.connection_request(p_user_id uuid, p_other_id uuid)
returns jsonb language plpgsql set search_path = '' as $$
declare
  a uuid := least(p_user_id, p_other_id);
  b uuid := greatest(p_user_id, p_other_id);
  existing public.connections;
begin
  if p_user_id = p_other_id then raise exception 'Cannot connect to yourself' using errcode = 'CON01'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Requester has no profile' using errcode = 'CON05';
  end if;
  -- Blocked and unavailable read the same, so nobody learns they were blocked.
  if public.connection_person_json(p_other_id) is null or public.messaging_blocked(p_user_id, p_other_id) then
    raise exception 'Person unavailable' using errcode = 'CON02';
  end if;
  -- Two people connecting at once end up with one accepted row, not an error.
  perform pg_advisory_xact_lock(hashtextextended('connection:' || a || ':' || b, 0));
  select * into existing from public.connections where user_a = a and user_b = b;
  if not found then
    insert into public.connections(user_a, user_b, initiated_by) values (a, b, p_user_id);
  elsif existing.status = 'pending' and existing.initiated_by <> p_user_id then
    update public.connections set status = 'accepted', responded_at = now() where id = existing.id;
  end if;
  return public.connection_state(p_user_id, p_other_id);
end;
$$;

-- Only the recipient of a pending request can accept it; only status changes.
create function public.connection_accept(p_user_id uuid, p_other_id uuid)
returns jsonb language plpgsql set search_path = '' as $$
begin
  if public.messaging_blocked(p_user_id, p_other_id) then
    raise exception 'Person unavailable' using errcode = 'CON02';
  end if;
  update public.connections set status = 'accepted', responded_at = now()
    where user_a = least(p_user_id, p_other_id) and user_b = greatest(p_user_id, p_other_id)
      and status = 'pending' and initiated_by = p_other_id;
  if not found then raise exception 'No request to accept' using errcode = 'CON03'; end if;
  return public.connection_state(p_user_id, p_other_id);
end;
$$;

-- Declines, cancels or disconnects. Ending an accepted connection closes its chat.
create function public.connection_remove(p_user_id uuid, p_other_id uuid)
returns jsonb language plpgsql set search_path = '' as $$
begin
  delete from public.connections
    where user_a = least(p_user_id, p_other_id) and user_b = greatest(p_user_id, p_other_id);
  return public.connection_state(p_user_id, p_other_id);
end;
$$;

-- Leaves out blocked pairs and inactive profiles.
create function public.connection_list(p_user_id uuid)
returns jsonb language sql stable set search_path = '' as $$
  with people as (
    select c.status, c.initiated_by, c.created_at, other,
      public.connection_person_json(other) person,
      (select k.id from public.conversations k
        where k.source_key = 'direct:' || c.user_a || ':' || c.user_b) conversation_id
    from public.connections c
      cross join lateral (select case when c.user_a = p_user_id then c.user_b else c.user_a end other) o
    where p_user_id in (c.user_a, c.user_b) and not public.messaging_blocked(p_user_id, other)
  )
  select jsonb_build_object(
    'incoming', coalesce((select jsonb_agg(person || jsonb_build_object('requested_at', created_at) order by created_at desc)
      from people where status = 'pending' and initiated_by <> p_user_id and person is not null), '[]'::jsonb),
    'sent', coalesce((select jsonb_agg(person || jsonb_build_object('requested_at', created_at) order by created_at desc)
      from people where status = 'pending' and initiated_by = p_user_id and person is not null), '[]'::jsonb),
    'connected', coalesce((select jsonb_agg(person || jsonb_build_object('conversationId', conversation_id) order by person->>'display_name')
      from people where status = 'accepted' and person is not null), '[]'::jsonb));
$$;

-- For the Messages navigation dot.
create function public.messaging_activity(p_user_id uuid)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'unreadConversations', (select count(*) from public.conversation_participants p
      where p.user_id = p_user_id and p.left_at is null and exists (select 1 from public.messages m
        where m.conversation_id = p.conversation_id and m.seq > greatest(p.joined_after_seq, p.last_read_seq)
          and m.sender_id is distinct from p_user_id and not public.messaging_hidden(p_user_id, m.sender_id))),
    'incomingRequests', jsonb_array_length(public.connection_list(p_user_id)->'incoming'));
$$;

do $$
declare
  f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname in ('connection_person_json', 'connection_state',
      'connection_request', 'connection_accept', 'connection_remove', 'connection_list', 'messaging_activity') loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;
