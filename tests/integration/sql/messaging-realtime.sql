-- Runs after the normal seed, inside a disposable schema replay database.
begin;
delete from realtime.messages;
do $$
declare chat uuid; group_in uuid := gen_random_uuid();
begin
  select id into strict chat from public.conversations where source_key =
    'direct:11111111-1111-1111-1111-111111111111:22222222-2222-2222-2222-222222222222';
  insert into public.messages(conversation_id, seq, sender_id, body, client_request_id)
    values(chat, 3, '11111111-1111-1111-1111-111111111111', 'Realtime test', gen_random_uuid());
  assert (select count(*) = 2 from realtime.messages), 'Message must notify both active members only';
  assert not exists(select 1 from realtime.messages where payload - 'id' <> '{}'::jsonb or not private or event <> 'changed'), 'Broadcast leaked data or was public';
  assert not exists(select 1 from realtime.messages where topic not in ('messaging:11111111-1111-1111-1111-111111111111', 'messaging:22222222-2222-2222-2222-222222222222')), 'Wrong recipient';
  delete from realtime.messages;
  update public.conversation_participants set last_read_seq = 3 where conversation_id = chat and user_id = '22222222-2222-2222-2222-222222222222';
  assert (select count(*) = 2 from realtime.messages), 'Read receipt must notify members';
  update public.conversation_participants set last_read_seq = 3 where conversation_id = chat and user_id = '22222222-2222-2222-2222-222222222222';
  assert (select count(*) = 2 from realtime.messages), 'No-op reads must not create notification loops';
  delete from realtime.messages;
  update public.conversation_participants set left_at = now() where conversation_id = chat and user_id = '22222222-2222-2222-2222-222222222222';
  assert (select count(*) = 2 from realtime.messages), 'Departure must also notify the departing member';
  delete from realtime.messages;
  insert into public.messages(conversation_id, seq, sender_id, body, client_request_id)
    values(chat, 4, '11111111-1111-1111-1111-111111111111', 'After departure', gen_random_uuid());
  assert (select count(*) = 1 from realtime.messages), 'Former member received new message notifications';

  insert into active_friends_private.groups(id, target_size) values(group_in, 3);
  insert into active_friends_private.group_members(group_id, user_id, maximum_size) values
    (group_in, '11111111-1111-1111-1111-111111111111', 3),
    (group_in, '22222222-2222-2222-2222-222222222222', 3);
  delete from realtime.messages;
  insert into active_friends_private.messages(group_id, seq, sender_id, body, request_id)
    values(group_in, 1, '11111111-1111-1111-1111-111111111111', 'Group message', gen_random_uuid());
  assert (select count(*) = 2 from realtime.messages), 'Group message notifications missing';
  delete from realtime.messages;
  update active_friends_private.group_members set read_seq = 1 where group_id = group_in and user_id = '22222222-2222-2222-2222-222222222222';
  assert (select count(*) = 2 from realtime.messages), 'Group read receipt missing';
  update active_friends_private.group_members set read_seq = 1 where group_id = group_in and user_id = '22222222-2222-2222-2222-222222222222';
  assert (select count(*) = 2 from realtime.messages), 'Group read no-op created a loop';
  delete from realtime.messages;
  update active_friends_private.group_members set left_at = now() where group_id = group_in and user_id = '22222222-2222-2222-2222-222222222222';
  assert (select count(*) = 2 from realtime.messages), 'Departing group member was not notified';
  delete from realtime.messages;
  insert into active_friends_private.messages(group_id, seq, sender_id, body, request_id)
    values(group_in, 2, '11111111-1111-1111-1111-111111111111', 'After leaving', gen_random_uuid());
  assert (select count(*) = 1 from realtime.messages), 'Former group member received notifications';
end $$ language plpgsql;

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set local realtime.topic = 'messaging:11111111-1111-1111-1111-111111111111';
do $$ begin
  assert (select count(*) = 1 from realtime.messages), 'Owner cannot receive own notifications';
  assert not has_schema_privilege(current_user, 'messaging_realtime_private', 'USAGE'), 'Client can access private emit helpers';
  assert not has_table_privilege(current_user, 'public.messages', 'SELECT'), 'Client gained message table access';
  begin
    insert into realtime.messages(topic, extension, payload, event, private)
      values('messaging:11111111-1111-1111-1111-111111111111', 'broadcast', '{}', 'changed', true);
    raise exception 'Client could forge broadcasts';
  exception when insufficient_privilege then null; end;
end $$;
set local realtime.topic = 'messaging:22222222-2222-2222-2222-222222222222';
do $$ begin
  assert (select count(*) = 0 from realtime.messages), 'Owner could subscribe to another account';
end $$;
set local role anon;
do $$ begin
  assert (select count(*) = 0 from realtime.messages), 'Anonymous subscription allowed';
end $$;
rollback;
