-- Push notifications: registered devices and a queue of pushes waiting to be sent.
-- Rows are written by the API (service role) and by the triggers below; clients never touch these tables.

create table if not exists public.push_devices (
  token        text primary key check (char_length(token) between 20 and 4096),
  user_id      uuid not null references auth.users(id) on delete cascade,
  platform     text not null default 'android' check (platform in ('android')),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists push_devices_user_idx on public.push_devices (user_id);

create table if not exists public.push_outbox (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  kind          text not null check (kind in ('message', 'connection_request')),
  -- Internal de-duplication key only (never sent to the device or to Google).
  ref           text not null default '',
  created_at    timestamptz not null default now(),
  attempts      integer not null default 0,
  claimed_until timestamptz,
  sent_at       timestamptz
);
create index if not exists push_outbox_pending_idx on public.push_outbox (id) where sent_at is null;
-- At most one unsent push per person, kind and conversation: a burst of messages becomes one alert.
create unique index if not exists push_outbox_pending_unique
  on public.push_outbox (user_id, kind, ref) where sent_at is null;

alter table public.push_devices enable row level security;
alter table public.push_outbox  enable row level security;
revoke all on public.push_devices from anon, authenticated;
revoke all on public.push_outbox  from anon, authenticated;

-- New message -> one pending push for every other active participant who has a registered device
-- and has no block with the sender in either direction.
create or replace function public.push_enqueue_message() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.sender_id is null then return new; end if;
  insert into public.push_outbox (user_id, kind, ref)
  select p.user_id, 'message', new.conversation_id::text
  from public.conversation_participants p
  where p.conversation_id = new.conversation_id
    and p.left_at is null
    and p.user_id <> new.sender_id
    and exists (select 1 from public.push_devices d where d.user_id = p.user_id)
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = p.user_id and b.blocked_id = new.sender_id)
         or (b.blocker_id = new.sender_id and b.blocked_id = p.user_id))
  on conflict (user_id, kind, ref) where sent_at is null do nothing;
  return new;
exception when others then
  return new; -- a push problem must never stop a message from being sent
end $$;

drop trigger if exists push_on_message on public.messages;
create trigger push_on_message after insert on public.messages
  for each row execute function public.push_enqueue_message();

-- New connection request -> push to the person who was asked.
create or replace function public.push_enqueue_connection_request() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare recipient uuid;
begin
  recipient := case when new.initiated_by = new.user_a then new.user_b else new.user_a end;
  if recipient is null or recipient = new.initiated_by then return new; end if;
  if not exists (select 1 from public.push_devices d where d.user_id = recipient) then return new; end if;
  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = recipient and b.blocked_id = new.initiated_by)
       or (b.blocker_id = new.initiated_by and b.blocked_id = recipient)) then return new; end if;
  insert into public.push_outbox (user_id, kind, ref) values (recipient, 'connection_request', '')
  on conflict (user_id, kind, ref) where sent_at is null do nothing;
  return new;
exception when others then
  return new;
end $$;

drop trigger if exists push_on_connection_request on public.connections;
create trigger push_on_connection_request after insert on public.connections
  for each row execute function public.push_enqueue_connection_request();

-- Atomically claims a batch of unsent pushes for one dispatcher run. `skip locked` means two runs
-- can never take the same row; a claim that is never completed expires and is retried.
create or replace function public.push_claim(p_limit integer, p_lease_seconds integer, p_max_attempts integer)
returns table (id bigint, user_id uuid, kind text, attempts integer)
language sql security definer set search_path = public, pg_temp as $$
  with picked as (
    select o.id from public.push_outbox o
    where o.sent_at is null
      and o.attempts < p_max_attempts
      and (o.claimed_until is null or o.claimed_until < now())
    order by o.id
    limit greatest(p_limit, 0)
    for update skip locked)
  update public.push_outbox o
     set attempts = o.attempts + 1,
         claimed_until = now() + make_interval(secs => p_lease_seconds)
    from picked
   where o.id = picked.id
  returning o.id, o.user_id, o.kind, o.attempts;
$$;
revoke all on function public.push_claim(integer, integer, integer) from public, anon, authenticated;
grant execute on function public.push_claim(integer, integer, integer) to service_role;

-- Not wired yet (status values were not visible when this was written):
--   * connection accepted  -> notify the person who asked
--   * dating match         -> notify both people
-- Run `select distinct status from public.connections;` and the same for dating_matches,
-- then add triggers in a follow-up migration.
