-- Run in a transaction after the migrations; all fixtures roll back.
begin;
insert into auth.users (id) select ('a0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid from generate_series(1, 6) n;
insert into public.listings(id, title, source, external_id, starts_at)
values ('e0000000-0000-4000-8000-000000000001', 'SQL test event', 'test', 'company-test', now() + interval '1 day');
do $$
declare
  v_event_id uuid := 'e0000000-0000-4000-8000-000000000001';
  u uuid;
  result jsonb;
  first_group uuid;
begin
  -- Interest alone must not place someone into a group.
  u := 'a0000000-0000-4000-8000-000000000001';
  perform public.event_company_action(v_event_id, u, 'Student 1', 'interest');
  result := public.event_company_snapshot(v_event_id, u);
  assert (result->>'isInterested')::boolean;
  assert result->'group' = 'null'::jsonb;
  for n in 1..6 loop
    u := ('a0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
    perform public.event_company_action(v_event_id, u, 'Student ' || n, 'join');
    perform public.event_company_action(v_event_id, u, 'Student ' || n, 'join');
  end loop;
  assert (select count(*) from public.event_group_members where event_id = v_event_id) = 6;
  assert (select count(*) from public.event_groups where event_id = v_event_id) = 2;
  assert (select max(size) from (select count(*) size from public.event_group_members where event_id = v_event_id group by group_id) counts) = 4;
  result := public.event_company_snapshot(v_event_id, 'a0000000-0000-4000-8000-000000000001');
  assert jsonb_array_length(result->'group'->'members') = 4;
  first_group := (result->'group'->>'id')::uuid;
  result := public.event_company_snapshot(v_event_id, 'a0000000-0000-4000-8000-000000000006');
  assert jsonb_array_length(result->'group'->'members') = 2;
  assert (result->'group'->>'id')::uuid <> first_group;
  -- Leaving is persisted, idempotent, and does not remove interest.
  u := 'a0000000-0000-4000-8000-000000000001';
  perform public.event_company_action(v_event_id, u, 'Student 1', 'leave');
  perform public.event_company_action(v_event_id, u, 'Student 1', 'leave');
  result := public.event_company_snapshot(v_event_id, u);
  assert result->'group' = 'null'::jsonb;
  assert (result->>'isInterested')::boolean;
  perform public.event_company_action(v_event_id, u, 'Student 1', 'join');
  assert (public.event_company_snapshot(v_event_id, u)->'group'->>'id')::uuid = first_group;
  -- Withdrawing interest also removes membership and cleans up empty groups.
  for n in 1..6 loop
    u := ('a0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
    perform public.event_company_action(v_event_id, u, 'Student ' || n, 'uninterest');
  end loop;
  assert (select count(*) from public.event_groups where event_id = v_event_id) = 0;
  assert (select count(*) from public.event_interests where event_id = v_event_id) = 0;
  -- Cancelled events cannot be joined.
  update public.listings set status = 'cancelled' where id = v_event_id;
  begin
    perform public.event_company_action(v_event_id, u, 'Student', 'join');
    raise exception 'Cancelled event accepted';
  exception when sqlstate 'P0002' then null;
  end;
  assert not has_table_privilege('anon', 'public.event_interests', 'SELECT');
  assert not has_table_privilege('authenticated', 'public.event_groups', 'INSERT');
  assert not has_function_privilege('authenticated', 'public.event_company_snapshot(uuid,uuid)', 'EXECUTE');
end;
$$;
rollback;
