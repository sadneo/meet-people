-- Push notifications, part 2: "connection accepted" and "dating match".
-- Builds on 20261104060000_push_notifications.sql.

alter table public.push_outbox drop constraint if exists push_outbox_kind_check;
alter table public.push_outbox add constraint push_outbox_kind_check
  check (kind in ('message', 'connection_request', 'connection_accepted', 'dating_match'));

-- A pending connection becomes accepted -> push to the person who asked.
create or replace function public.push_enqueue_connection_accepted() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare other uuid;
begin
  other := case when new.initiated_by = new.user_a then new.user_b else new.user_a end;
  if not exists (select 1 from public.push_devices d where d.user_id = new.initiated_by) then return new; end if;
  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = new.initiated_by and b.blocked_id = other)
       or (b.blocker_id = other and b.blocked_id = new.initiated_by)) then return new; end if;
  insert into public.push_outbox (user_id, kind, ref) values (new.initiated_by, 'connection_accepted', '')
  on conflict (user_id, kind, ref) where sent_at is null do nothing;
  return new;
exception when others then
  return new; -- a push problem must never block accepting a connection
end $$;

drop trigger if exists push_on_connection_accepted on public.connections;
create trigger push_on_connection_accepted after update on public.connections
  for each row when (old.status = 'pending' and new.status = 'accepted')
  execute function public.push_enqueue_connection_accepted();

-- A pending dating request is accepted (status 'matched') -> push to the person who sent it.
-- Incoming dating requests are deliberately not announced, so nobody learns who liked them before matching.
create or replace function public.push_enqueue_dating_match() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare other uuid;
begin
  other := case when new.initiated_by = new.user_a then new.user_b else new.user_a end;
  if not exists (select 1 from public.push_devices d where d.user_id = new.initiated_by) then return new; end if;
  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = new.initiated_by and b.blocked_id = other)
       or (b.blocker_id = other and b.blocked_id = new.initiated_by)) then return new; end if;
  insert into public.push_outbox (user_id, kind, ref) values (new.initiated_by, 'dating_match', '')
  on conflict (user_id, kind, ref) where sent_at is null do nothing;
  return new;
exception when others then
  return new;
end $$;

drop trigger if exists push_on_dating_match on public.dating_matches;
create trigger push_on_dating_match after update on public.dating_matches
  for each row when (old.status = 'pending' and new.status = 'matched')
  execute function public.push_enqueue_dating_match();
