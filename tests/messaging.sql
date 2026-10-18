-- Run explicitly against a test database AFTER applying migrations.
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/messaging.sql
-- Fixtures roll back. This is a real PostgreSQL test, separate from mocked API tests.
begin;
insert into auth.users(id) select ('a4160000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid from generate_series(1, 5) n;
insert into public.profiles(id, username, display_name)
  select id, 'messaging_test_' || right(id::text, 1), 'Messaging ' || right(id::text, 1) from auth.users where id::text like 'a4160000-%';
insert into public.listings(id, title, source, external_id, starts_at)
  values ('e4160000-0000-4000-8000-000000000001', 'Messaging SQL test event', 'test', 'messaging-sql-test', now() + interval '1 day');

do $$
declare
  a uuid := 'a4160000-0000-4000-8000-000000000001';
  b uuid := 'a4160000-0000-4000-8000-000000000002';
  c uuid := 'a4160000-0000-4000-8000-000000000003';
  d uuid := 'a4160000-0000-4000-8000-000000000004';
  event uuid := 'e4160000-0000-4000-8000-000000000001';
  direct uuid;
  grouped uuid;
  group_id uuid;
  request_id uuid := gen_random_uuid();
  saved jsonb;
  history jsonb;
  earlier jsonb;
  inbox jsonb;
  count_before bigint;
begin
  -- Accepting through the service functions opens the direct chat.
  perform public.connection_request(d, 'a4160000-0000-4000-8000-000000000005');
  perform public.connection_accept('a4160000-0000-4000-8000-000000000005', d);
  assert (select count(*) from public.conversation_participants p join public.conversations k on k.id = p.conversation_id
    where k.source_key = 'direct:' || d || ':a4160000-0000-4000-8000-000000000005' and p.left_at is null) = 2,
    'Accepting opens the direct chat';

  -- Direct chats follow connections.
  insert into public.connections(user_a, user_b, initiated_by) values (a, b, a);
  assert not exists (select 1 from public.conversations where source_key = 'direct:' || a || ':' || b), 'Pending opens nothing';
  update public.connections set status = 'accepted' where user_a = a and user_b = b;
  select id into direct from public.conversations where source_key = 'direct:' || a || ':' || b and kind = 'direct';
  assert direct is not null, 'Accepting opens a direct chat';

  -- Sends trim, deduplicate retries, and never expose the request ID.
  saved := public.messaging_send(a, direct, E'  hello \n', request_id);
  assert saved->>'body' = 'hello' and (saved->>'seq')::int = 1 and saved->>'sender_id' = a::text;
  assert not saved ? 'client_request_id';
  assert public.messaging_send(a, direct, 'hello', request_id) = saved, 'Retry returns the original';
  assert (select count(*) from public.messages where conversation_id = direct) = 1;
  begin perform public.messaging_send(a, direct, 'different', request_id); raise exception 'Reused request ID accepted';
  exception when sqlstate 'MSG10' then null; end;
  begin perform public.messaging_send(a, direct, E' \n\t ', gen_random_uuid()); raise exception 'Whitespace accepted';
  exception when sqlstate 'MSG09' then null; end;
  begin perform public.messaging_send(a, direct, repeat('x', 2001), gen_random_uuid()); raise exception 'Overlong accepted';
  exception when sqlstate 'MSG09' then null; end;

  -- Reads: members only, with names from profiles and read state.
  history := public.messaging_history(b, direct);
  assert history->'messages'->0 = saved and (history->>'canSend')::boolean and history->>'kind' = 'direct';
  assert history->'participants' @> jsonb_build_array(jsonb_build_object('id', a, 'display_name', 'Messaging 1', 'last_read_seq', 1));
  begin perform public.messaging_history(c, direct); raise exception 'Outsider read';
  exception when sqlstate 'MSG03' then null; end;
  begin perform public.messaging_send(c, direct, 'Intrusion', gen_random_uuid()); raise exception 'Outsider send';
  exception when sqlstate 'MSG03' then null; end;
  begin perform public.messaging_history(a, 'c4160000-0000-4000-8000-000000000099'); raise exception 'Missing accepted';
  exception when sqlstate 'MSG01' then null; end;
  begin perform public.messaging_history(a, direct, 1, 1); raise exception 'Two cursors accepted';
  exception when sqlstate 'MSG08' then null; end;

  -- Unread counts and read receipts.
  inbox := public.messaging_list_conversations(b);
  assert (inbox->'conversations'->0->>'unread_count')::int = 1 and inbox->'conversations'->0->'latest_message' = saved;
  assert (public.messaging_list_conversations(a)->'conversations'->0->>'unread_count')::int = 0, 'Own messages are read';
  assert public.messaging_mark_read(b, direct, 999) = 1, 'Read state never passes the last message';
  assert (public.messaging_list_conversations(b)->'conversations'->0->>'unread_count')::int = 0;
  assert public.messaging_history(a, direct)->'participants' @> jsonb_build_array(jsonb_build_object('id', b, 'last_read_seq', 1));

  -- Polling returns only newer messages.
  perform public.messaging_send(b, direct, 'reply', gen_random_uuid());
  history := public.messaging_history(a, direct, null, 1);
  assert jsonb_array_length(history->'messages') = 1 and history->'messages'->0->>'body' = 'reply' and history->'nextCursor' = 'null';
  assert jsonb_array_length(public.messaging_history(a, direct, null, 2)->'messages') = 0;

  -- Rate limit: 30 sends per sender per minute.
  for n in 1..29 loop perform public.messaging_send(a, direct, 'Burst ' || n, gen_random_uuid()); end loop;
  begin perform public.messaging_send(a, direct, 'One too many', gen_random_uuid()); raise exception 'Rate limit not applied';
  exception when sqlstate 'MSG11' then null; end;
  update public.messages set created_at = created_at - interval '2 minutes' where sender_id = a;
  perform public.messaging_send(a, direct, 'After the window', gen_random_uuid());

  -- Keyset pagination has no missing or duplicate rows.
  for n in 1..25 loop perform public.messaging_send(b, direct, 'Page ' || n, gen_random_uuid()); end loop;
  history := public.messaging_history(a, direct);
  earlier := public.messaging_history(a, direct, (history->>'nextCursor')::bigint);
  assert jsonb_array_length(history->'messages') = 50 and earlier->'nextCursor' = 'null';
  assert jsonb_array_length(earlier->'messages') + 50 = (select count(*) from public.messages where conversation_id = direct);
  assert not exists (select 1 from jsonb_array_elements(history->'messages') h, jsonb_array_elements(earlier->'messages') e where h->>'id' = e->>'id');

  -- Blocks: hidden messages and no direct sends, whichever side blocked.
  insert into public.blocks(blocker_id, blocked_id) values (b, a);
  history := public.messaging_history(a, direct);
  assert not (history->>'canSend')::boolean;
  assert not exists (select 1 from jsonb_array_elements(history->'messages') m where m->>'sender_id' = b::text), 'Blocked sender hidden';
  begin perform public.messaging_send(a, direct, 'Blocked', gen_random_uuid()); raise exception 'Blocked send (blocked side)';
  exception when sqlstate 'MSG05' then null; end;
  begin perform public.messaging_send(b, direct, 'Blocked', gen_random_uuid()); raise exception 'Blocked send (blocking side)';
  exception when sqlstate 'MSG05' then null; end;
  delete from public.blocks where blocker_id = b;

  -- Ending the connection closes the chat for both; reconnecting restores its history.
  count_before := jsonb_array_length(public.messaging_history(a, direct)->'messages');
  delete from public.connections where user_a = a and user_b = b;
  begin perform public.messaging_history(a, direct); raise exception 'Closed chat readable';
  exception when sqlstate 'MSG03' then null; end;
  assert jsonb_array_length(public.messaging_list_conversations(b)->'conversations') = 0;
  insert into public.connections(user_a, user_b, initiated_by) values (a, b, b);
  update public.connections set status = 'accepted' where user_a = a and user_b = b;
  assert jsonb_array_length(public.messaging_history(a, direct)->'messages') = count_before;
  begin perform public.messaging_leave(a, direct); raise exception 'Left a direct chat';
  exception when sqlstate 'MSG12' then null; end;

  -- Event groups: current members only, two or more.
  perform public.event_company_action(event, a, 'Event A', 'join');
  select m.group_id into group_id from public.event_group_members m where m.event_id = event and m.user_id = a;
  begin perform public.messaging_ensure_event_conversation(a, group_id); raise exception 'Singleton accepted';
  exception when sqlstate 'MSG06' then null; end;
  perform public.event_company_action(event, c, 'Event C', 'join');
  grouped := public.messaging_ensure_event_conversation(c, group_id);
  assert public.messaging_ensure_event_conversation(a, group_id) = grouped;
  begin perform public.messaging_ensure_event_conversation(b, group_id); raise exception 'Outsider created group chat';
  exception when sqlstate 'MSG04' then null; end;
  begin perform public.messaging_ensure_event_conversation(a, 'c4160000-0000-4000-8000-000000000099'); raise exception 'Missing group';
  exception when sqlstate 'MSG02' then null; end;
  perform public.messaging_send(c, grouped, 'hi from C', gen_random_uuid());

  -- Leaving the group leaves the chat. Nobody can post to an empty room.
  perform public.event_company_action(event, c, 'Event C', 'leave');
  begin perform public.messaging_send(c, grouped, 'still here', gen_random_uuid()); raise exception 'Ex-member sent';
  exception when sqlstate 'MSG03' then null; end;
  assert not (public.messaging_history(a, grouped)->>'canSend')::boolean;
  begin perform public.messaging_send(a, grouped, 'alone', gen_random_uuid()); raise exception 'Sent with nobody else';
  exception when sqlstate 'MSG07' then null; end;

  -- New and returning members never see messages from before they (re)joined.
  perform public.event_company_action(event, d, 'Event D', 'join');
  assert jsonb_array_length(public.messaging_history(d, grouped)->'messages') = 0;
  perform public.messaging_send(a, grouped, 'while C is away', gen_random_uuid());
  perform public.event_company_action(event, c, 'Event C', 'join');
  assert jsonb_array_length(public.messaging_history(c, grouped)->'messages') = 0, 'Returning member sees no earlier messages';
  assert jsonb_array_length(public.messaging_history(a, grouped)->'messages') = 2;
  assert jsonb_array_length(public.messaging_history(d, grouped)->'messages') = 1;

  -- Leaving only the chat sticks until that member comes back themselves.
  perform public.messaging_leave(d, grouped);
  perform public.messaging_ensure_event_conversation(a, group_id);
  begin perform public.messaging_history(d, grouped); raise exception 'Left member re-added by another member';
  exception when sqlstate 'MSG03' then null; end;
  perform public.messaging_ensure_event_conversation(d, group_id);

  -- In groups a block hides messages between the pair but does not stop sends.
  insert into public.blocks(blocker_id, blocked_id) values (a, d);
  perform public.messaging_send(d, grouped, 'from D', gen_random_uuid());
  assert (public.messaging_history(a, grouped)->>'canSend')::boolean;
  assert not exists (select 1 from jsonb_array_elements(public.messaging_history(a, grouped)->'messages') m where m->>'body' = 'from D');
  assert exists (select 1 from jsonb_array_elements(public.messaging_history(c, grouped)->'messages') m where m->>'body' = 'from D');

  -- Account deletion keeps the text for everyone else, without a sender.
  delete from auth.users where id = d;
  assert exists (select 1 from jsonb_array_elements(public.messaging_history(c, grouped)->'messages') m
    where m->>'body' = 'from D' and m->'sender_id' = 'null');
  assert not exists (select 1 from jsonb_array_elements(public.messaging_history(c, grouped)->'participants') p where p->>'id' = d::text);

  -- Deleting the event is not anyone leaving: members keep the chat.
  delete from public.listings where id = event;
  assert jsonb_array_length(public.messaging_history(a, grouped)->'participants') = 2;

  -- Inactive profiles fall back to their event name.
  update public.profiles set is_active = false where id = c;
  assert public.messaging_history(a, grouped)->'participants' @> jsonb_build_array(jsonb_build_object('id', c, 'display_name', 'Event C'));

  assert not has_table_privilege('anon', 'public.messages', 'SELECT');
  assert not has_table_privilege('authenticated', 'public.messages', 'INSERT');
  assert not has_table_privilege('authenticated', 'public.conversation_participants', 'UPDATE');
  assert not has_function_privilege('authenticated', 'public.messaging_send(uuid,uuid,text,uuid)', 'EXECUTE');
  assert not has_function_privilege('anon', 'public.messaging_history(uuid,uuid,bigint,bigint)', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'public.messaging_open_direct(uuid,uuid)', 'EXECUTE');
  assert has_function_privilege('service_role', 'public.messaging_send(uuid,uuid,text,uuid)', 'EXECUTE');
  assert to_regprocedure('public.get_my_conversations()') is null and to_regprocedure('public.connections_after_update()') is null;
end;
$$;
rollback;
