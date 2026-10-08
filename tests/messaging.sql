-- Run explicitly against a test database AFTER applying migrations.
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/messaging.sql
-- Fixtures roll back. This is a real PostgreSQL test, separate from mocked API tests.
begin;
insert into auth.users(id) select ('a4160000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid from generate_series(1, 4) n;
insert into public.event_profiles(user_id, display_name)
  select id, 'Messaging test ' || right(id::text, 1) from auth.users where id::text like 'a4160000-%';
insert into public.listings(id, title, source, external_id, starts_at)
  values ('e4160000-0000-4000-8000-000000000001', 'Messaging SQL test event', 'test', 'messaging-sql-test', now() + interval '1 day');

do $$
declare
  a uuid := 'a4160000-0000-4000-8000-000000000001';
  b uuid := 'a4160000-0000-4000-8000-000000000002';
  outsider uuid := 'a4160000-0000-4000-8000-000000000003';
  event uuid := 'e4160000-0000-4000-8000-000000000001';
  conversation uuid;
  other_conversation uuid;
  group_id uuid;
  request_id uuid := gen_random_uuid();
  saved jsonb;
  history jsonb;
  inbox jsonb;
  earlier jsonb;
begin
  conversation := public.messaging_ensure_conversation(array[a,b]);
  assert public.messaging_ensure_conversation(array[b,a,a]) = conversation, 'Participant order should not duplicate conversations';
  assert (select count(*) from public.conversation_participants where conversation_id = conversation) = 2;
  other_conversation := public.messaging_ensure_conversation(array[a,outsider]);
  saved := public.messaging_send(a, conversation, '  M3 messaging persistence test  ', request_id);
  assert saved->>'body' = 'M3 messaging persistence test';
  assert saved->>'sender_id' = a::text;
  assert saved->>'created_at' is not null;
  assert public.messaging_send(a, conversation, 'M3 messaging persistence test', request_id) = saved, 'Retry should return the same saved message';
  assert (select count(*) from public.messages where conversation_id = conversation) = 1;
  -- Subsequent independent database read restores the inserted message.
  history := public.messaging_history(b, conversation);
  assert history->'messages'->0 = saved;
  assert jsonb_array_length(history->'participants') = 2;
  assert jsonb_array_length(public.messaging_history(a, other_conversation)->'messages') = 0, 'No cross-conversation leakage';
  inbox := public.messaging_list_conversations(b);
  assert jsonb_array_length(inbox->'conversations') = 1;
  assert inbox->'conversations'->0->'latest_message' = saved;
  assert jsonb_array_length(public.messaging_list_conversations(outsider)->'conversations') = 1;

  begin
    perform public.messaging_history(outsider, conversation);
    raise exception 'Outsider read succeeded';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.messaging_send(outsider, conversation, 'Intrusion', gen_random_uuid());
    raise exception 'Outsider send succeeded';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.messaging_history(a, 'c4160000-0000-4000-8000-000000000099');
    raise exception 'Missing conversation accepted';
  exception when sqlstate 'P0002' then null;
  end;
  begin
    perform public.messaging_send(a, 'c4160000-0000-4000-8000-000000000099', 'Hello', gen_random_uuid());
    raise exception 'Missing conversation send accepted';
  exception when sqlstate 'P0002' then null;
  end;
  begin
    perform public.messaging_send(a, conversation, E' \n\t ', gen_random_uuid());
    raise exception 'Whitespace accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.messaging_send(a, conversation, repeat('x', 2001), gen_random_uuid());
    raise exception 'Overlong message accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.messaging_send(a, conversation, 'Different content', request_id);
    raise exception 'Conflicting retry accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.messaging_history(a, other_conversation, (saved->>'id')::uuid);
    raise exception 'Cross-conversation cursor accepted';
  exception when sqlstate '22023' then null;
  end;
  -- Keyset pagination, including timestamp ties, has no missing or duplicate rows.
  for n in 1..55 loop
    perform public.messaging_send(a, conversation, 'Page test ' || n, gen_random_uuid());
  end loop;
  history := public.messaging_history(a, conversation);
  assert jsonb_array_length(history->'messages') = 50;
  assert history->>'nextCursor' is not null;
  earlier := public.messaging_history(a, conversation, (history->>'nextCursor')::uuid);
  assert jsonb_array_length(earlier->'messages') = 6;
  assert earlier->>'nextCursor' is null;
  assert not exists (select 1 from jsonb_array_elements(history->'messages') h, jsonb_array_elements(earlier->'messages') e where h->>'id' = e->>'id');

  -- Only current members can start an event conversation, minimum two members.
  perform public.event_company_action(event, a, 'Messaging A', 'join');
  select m.group_id into group_id from public.event_group_members m where m.event_id = event and m.user_id = a;
  begin
    perform public.messaging_ensure_event_conversation(a, group_id);
    raise exception 'Singleton accepted';
  exception when sqlstate '22023' then null;
  end;
  perform public.event_company_action(event, b, 'Messaging B', 'join');
  assert public.messaging_ensure_event_conversation(a, group_id) = conversation;
  begin
    perform public.messaging_ensure_event_conversation(outsider, group_id);
    raise exception 'Outsider created group conversation';
  exception when sqlstate '42501' then null;
  end;
  -- Joining/leaving an event never grants new users access to an old chat.
  perform public.event_company_action(event, b, 'Messaging B', 'leave');
  perform public.event_company_action(event, outsider, 'Messaging C', 'join');
  assert public.messaging_ensure_event_conversation(a, group_id) = other_conversation;
  assert jsonb_array_length(public.messaging_history(b, conversation)->'messages') = 50;

  assert not has_table_privilege('anon', 'public.messages', 'SELECT');
  assert not has_table_privilege('authenticated', 'public.messages', 'INSERT');
  assert not has_table_privilege('authenticated', 'public.conversation_participants', 'INSERT');
  assert not has_function_privilege('authenticated', 'public.messaging_send(uuid,uuid,text,uuid)', 'EXECUTE');
  assert not has_function_privilege('anon', 'public.messaging_history(uuid,uuid,uuid)', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'public.messaging_ensure_conversation(uuid[])', 'EXECUTE');
  assert has_function_privilege('service_role', 'public.messaging_send(uuid,uuid,text,uuid)', 'EXECUTE');
end;
$$;
rollback;
