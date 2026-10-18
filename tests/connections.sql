-- Run explicitly against a test database AFTER applying migrations.
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/connections.sql
-- Fixtures roll back. This is a real PostgreSQL test, separate from mocked API tests.
begin;
insert into auth.users(id) select ('a5170000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid from generate_series(1, 16) n;
-- User 5 has no profile.
insert into public.profiles(id, username, display_name)
  select id, 'connections_test_' || right(id::text, 2), 'Person ' || right(id::text, 2)
  from auth.users where id::text like 'a5170000-%' and id <> 'a5170000-0000-4000-8000-000000000005';

do $$
declare
  a uuid := 'a5170000-0000-4000-8000-000000000001';
  b uuid := 'a5170000-0000-4000-8000-000000000002';
  c uuid := 'a5170000-0000-4000-8000-000000000003';
  d uuid := 'a5170000-0000-4000-8000-000000000004';
  no_profile uuid := 'a5170000-0000-4000-8000-000000000005';
  spammer uuid := 'a5170000-0000-4000-8000-000000000006';
  state jsonb;
  list jsonb;
begin
  -- A request, as seen from both sides.
  assert public.connection_request(a, b) = '{"status": "sent", "conversationId": null}';
  assert public.connection_state(b, a)->>'status' = 'incoming';
  assert public.connection_request(a, b)->>'status' = 'sent', 'Repeating a request changes nothing';
  list := public.connection_list(b);
  assert jsonb_array_length(list->'incoming') = 1 and list->'incoming'->0->>'display_name' = 'Person 01';
  assert list->'incoming'->0 ? 'requested_at' and jsonb_array_length(list->'sent') = 0;
  assert jsonb_array_length(public.connection_list(a)->'sent') = 1;

  -- Only the recipient accepts, and accepting opens the direct chat.
  begin perform public.connection_accept(a, b); raise exception 'Requester accepted their own request';
  exception when sqlstate 'CON03' then null; end;
  state := public.connection_accept(b, a);
  assert state->>'status' = 'connected' and state->>'conversationId' is not null;
  assert (public.messaging_history(a, (state->>'conversationId')::uuid)->>'canSend')::boolean;
  assert public.connection_list(a)->'connected'->0->>'conversationId' = state->>'conversationId';
  assert (public.messaging_activity(b)->>'incomingRequests')::int = 0;

  -- Connecting back to someone who already asked accepts.
  perform public.connection_request(c, a);
  assert (public.messaging_activity(a)->>'incomingRequests')::int = 1;
  assert public.connection_request(a, c)->>'status' = 'connected';

  -- Removing ends the connection and closes the chat for both; declining is the same.
  assert public.connection_remove(a, b)->>'status' = 'none';
  begin perform public.messaging_history(b, (state->>'conversationId')::uuid); raise exception 'Chat still open';
  exception when sqlstate 'MSG03' then null; end;
  perform public.connection_request(d, b);
  perform public.connection_remove(b, d);
  assert public.connection_state(d, b)->>'status' = 'none';

  -- Unavailable people, and people without a profile, cannot be asked.
  begin perform public.connection_request(a, a); raise exception 'Connected to self';
  exception when sqlstate 'CON01' then null; end;
  begin perform public.connection_request(no_profile, a); raise exception 'Requester without profile';
  exception when sqlstate 'CON05' then null; end;
  begin perform public.connection_request(a, no_profile); raise exception 'Target without profile';
  exception when sqlstate 'CON02' then null; end;
  update public.profiles set is_active = false where id = d;
  begin perform public.connection_request(a, d); raise exception 'Inactive target';
  exception when sqlstate 'CON02' then null; end;
  update public.profiles set is_active = true where id = d;

  -- Blocks: hidden from lists, cannot be accepted or re-sent, same code either way round.
  perform public.connection_request(d, a);
  insert into public.blocks(blocker_id, blocked_id) values (a, d);
  assert jsonb_array_length(public.connection_list(a)->'incoming') = 0;
  begin perform public.connection_accept(a, d); raise exception 'Accepted across a block';
  exception when sqlstate 'CON02' then null; end;
  begin perform public.connection_request(d, a); raise exception 'Requested across a block';
  exception when sqlstate 'CON02' then null; end;
  delete from public.blocks where blocker_id = a;

  -- Ten requests per person per day; cancelling does not refund one.
  for n in 7..15 loop
    perform public.connection_request(spammer, ('a5170000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid);
  end loop;
  perform public.connection_remove(spammer, 'a5170000-0000-4000-8000-000000000007');
  perform public.connection_request(spammer, 'a5170000-0000-4000-8000-000000000007');
  begin perform public.connection_request(spammer, 'a5170000-0000-4000-8000-000000000016'); raise exception 'Rate limit not applied';
  exception when sqlstate 'CON04' then null; end;

  -- Browsers read their own rows but cannot write any: the old accept policy let a
  -- recipient rewrite the pair into a connection with someone who never agreed.
  assert has_table_privilege('authenticated', 'public.connections', 'SELECT');
  assert not has_table_privilege('authenticated', 'public.connections', 'INSERT');
  assert not has_table_privilege('authenticated', 'public.connections', 'UPDATE');
  assert not has_table_privilege('authenticated', 'public.connections', 'DELETE');
  assert not exists (select 1 from pg_policies where tablename = 'connections' and cmd <> 'SELECT');
  assert not has_table_privilege('authenticated', 'public.connection_request_log', 'SELECT');
  assert not has_function_privilege('authenticated', 'public.connection_request(uuid,uuid)', 'EXECUTE');
  assert not has_function_privilege('anon', 'public.connection_list(uuid)', 'EXECUTE');
  assert has_function_privilege('service_role', 'public.connection_accept(uuid,uuid)', 'EXECUTE');
  assert has_function_privilege('service_role', 'public.messaging_activity(uuid)', 'EXECUTE');
end;
$$;
rollback;
