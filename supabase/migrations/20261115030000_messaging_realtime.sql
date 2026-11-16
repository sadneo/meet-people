-- Private, owner-only invalidations. No message bodies, sender IDs or table
-- access are exposed to the browser; authoritative reads still use the API.
begin;

create schema messaging_realtime_private;
revoke all on schema messaging_realtime_private from public, anon, authenticated;

create policy messaging_owner_broadcasts on realtime.messages
  for select to authenticated
  using (extension = 'broadcast' and topic = realtime.topic()
    and topic = 'messaging:' || (select auth.uid())::text);

create function messaging_realtime_private.emit(recipient uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if recipient is not null then
    perform realtime.send('{}'::jsonb, 'changed', 'messaging:' || recipient::text, true);
  end if;
exception when others then
  -- Realtime availability must not decide whether a message can be saved.
  raise warning 'Messaging realtime notification failed (%)', sqlstate;
end $$;

create function messaging_realtime_private.notify_members(
  conversation uuid, is_group boolean, changed_user uuid default null, sender uuid default null
) returns void language plpgsql security definer set search_path = '' as $$
declare recipient uuid;
begin
  if is_group then
    for recipient in
      select m.user_id from active_friends_private.group_members m
        where m.group_id = conversation and m.left_at is null
          and (sender is null or sender = m.user_id or public.safety_pair_allowed(m.user_id, sender))
      union select changed_user where changed_user is not null
    loop
      perform messaging_realtime_private.emit(recipient);
    end loop;
    return;
  end if;
  for recipient in
    select p.user_id from public.conversation_participants p
      where p.conversation_id = conversation and p.left_at is null
        and (sender is null or sender = p.user_id or public.safety_pair_allowed(p.user_id, sender))
    union
    -- A departing member also needs to discard their former permissions.
    select changed_user where changed_user is not null
  loop
    perform messaging_realtime_private.emit(recipient);
  end loop;
end $$;

-- Activated legacy deployments retain bigint direct-chat storage and private
-- read states. Keep that store intact; notifications contain no storage IDs.
create function messaging_realtime_private.notify_legacy(conversation bigint, sender uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare recipient uuid;
begin
  for recipient in
    select member from public.conversations c
      cross join lateral unnest(array[c.user_a, c.user_b]) member
      where c.id = conversation
        and (sender is null or sender = member or public.safety_pair_allowed(member, sender))
  loop
    perform messaging_realtime_private.emit(recipient);
  end loop;
end $$;

create function messaging_realtime_private.message_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_schema = 'active_friends_private' then
    perform messaging_realtime_private.notify_members(new.group_id, true, null, new.sender_id);
  elsif to_regclass('public.conversation_participants') is not null then
    perform messaging_realtime_private.notify_members(new.conversation_id, false, null, new.sender_id);
  else
    perform messaging_realtime_private.notify_legacy(new.conversation_id, new.sender_id);
  end if;
  return new;
end $$;

create function messaging_realtime_private.member_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare member_row record;
begin
  if tg_op = 'DELETE' then member_row := old; else member_row := new; end if;
  if tg_table_schema = 'active_friends_private' then
    perform messaging_realtime_private.notify_members(member_row.group_id, true, member_row.user_id);
  elsif tg_table_schema = 'social_private' then
    perform messaging_realtime_private.notify_legacy(member_row.conversation_id);
  else
    perform messaging_realtime_private.notify_members(member_row.conversation_id, false, member_row.user_id);
  end if;
  return null;
end $$;

create function messaging_realtime_private.group_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform messaging_realtime_private.notify_members(new.id, true);
  return new;
end $$;

create function messaging_realtime_private.pair_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare pair_row record;
begin
  if tg_op = 'DELETE' then pair_row := old; else pair_row := new; end if;
  if tg_table_name = 'blocks' then
    perform messaging_realtime_private.emit(pair_row.blocker_id);
    perform messaging_realtime_private.emit(pair_row.blocked_id);
  else
    perform messaging_realtime_private.emit(pair_row.user_a);
    perform messaging_realtime_private.emit(pair_row.user_b);
  end if;
  return null;
end $$;

create trigger messaging_realtime_message after insert on public.messages
  for each row execute function messaging_realtime_private.message_changed();
create trigger messaging_realtime_group_message after insert on active_friends_private.messages
  for each row execute function messaging_realtime_private.message_changed();

do $$ begin
  if to_regclass('public.conversation_participants') is not null then
    create trigger messaging_realtime_member after insert or delete on public.conversation_participants
      for each row execute function messaging_realtime_private.member_changed();
    create trigger messaging_realtime_member_update after update on public.conversation_participants
      for each row when (old.* is distinct from new.*) execute function messaging_realtime_private.member_changed();
  else
    create trigger messaging_realtime_read after insert on social_private.read_states
      for each row execute function messaging_realtime_private.member_changed();
    create trigger messaging_realtime_read_update after update on social_private.read_states
      for each row when (old.* is distinct from new.*) execute function messaging_realtime_private.member_changed();
  end if;
end $$;
create trigger messaging_realtime_group_member after insert or delete on active_friends_private.group_members
  for each row execute function messaging_realtime_private.member_changed();
create trigger messaging_realtime_group_member_update after update on active_friends_private.group_members
  for each row when (old.* is distinct from new.*) execute function messaging_realtime_private.member_changed();
create trigger messaging_realtime_group_update after update of name on active_friends_private.groups
  for each row when (old.name is distinct from new.name) execute function messaging_realtime_private.group_changed();

create trigger messaging_realtime_connection after insert or update or delete on public.connections
  for each row execute function messaging_realtime_private.pair_changed();
create trigger messaging_realtime_block after insert or delete on public.blocks
  for each row execute function messaging_realtime_private.pair_changed();

revoke all on all functions in schema messaging_realtime_private from public, anon, authenticated;
commit;
