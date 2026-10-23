-- Run in a transaction after the migrations; all fixtures roll back.
begin;
insert into public.listings(id, listing_type, title, source, external_id, category, starts_at, ends_at, status) values
  ('e0000000-0000-4000-8000-000000000001', 'event', 'Upcoming concert', 'test', 'public-1', 'Music', now() + interval '1 day', null, 'active'),
  ('e0000000-0000-4000-8000-000000000002', 'event', 'Ongoing fair', 'test', 'public-2', 'Food', now() - interval '1 hour', now() + interval '1 hour', 'rescheduled'),
  ('e0000000-0000-4000-8000-000000000003', 'event', 'Past talk', 'test', 'public-3', 'Music', now() - interval '2 days', now() - interval '1 day', 'active'),
  ('e0000000-0000-4000-8000-000000000004', 'event', 'Cancelled show', 'test', 'public-4', 'Music', now() + interval '1 day', null, 'cancelled'),
  ('e0000000-0000-4000-8000-000000000005', 'restaurant', 'Campus diner', 'test', 'public-5', 'Music', now() + interval '1 day', null, 'active');
insert into public.listings(listing_type, title, source, external_id, category, starts_at)
  select 'event', 'Bulk event ' || n, 'test', 'public-bulk-' || n, 'Bulk', now() + interval '2 days' + n * interval '1 minute' from generate_series(1, 60) n;

set local role service_role;
do $$
declare
  ids uuid[];
begin
  -- Only live events, and only the requested category, in start order.
  select array_agg(id) into ids from public.public_live_events(p_category => 'Music');
  assert ids = array['e0000000-0000-4000-8000-000000000001'::uuid], 'Unexpected Music events: ' || ids::text;
  select array_agg(id order by starts_at, id) into ids from public.public_live_events(p_category => 'Food');
  assert ids = array['e0000000-0000-4000-8000-000000000002'::uuid], 'Ongoing rescheduled event missing';
  -- Detail lookups apply the same live filter.
  assert exists(select 1 from public.public_live_events(p_id => 'e0000000-0000-4000-8000-000000000001'));
  assert not exists(select 1 from public.public_live_events(p_id => 'e0000000-0000-4000-8000-000000000004')), 'Cancelled event exposed';
  assert not exists(select 1 from public.public_live_events(p_id => 'e0000000-0000-4000-8000-000000000005')), 'Non-event listing exposed';
  -- The function bounds pages itself as a backstop to the API's validation.
  assert (select count(*) from public.public_live_events(p_category => 'Bulk', p_limit => 1000)) = 51, 'Page size not capped';
  assert (select count(*) from public.public_live_events(p_category => 'Bulk', p_offset => 50, p_limit => 51)) = 10;
  assert (select count(*) from public.public_live_events(p_category => 'Bulk', p_offset => 999999)) = 0, 'Offset not capped';
  assert public.event_categories() ? 'Music' and not public.event_categories() ? 'Campus diner';
end;
$$;
reset role;

-- Browser roles reach event data only through the API: no direct reads or function calls.
set local role anon;
do $$
begin
  begin perform 1 from public.listings limit 1; assert false, 'anon read listings';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.public_live_events(); assert false, 'anon called public_live_events';
  exception when insufficient_privilege then null; end;
  begin perform public.event_categories(); assert false, 'anon called event_categories';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;

-- Retired event-company functions are gone for every role.
do $$
begin
  assert to_regprocedure('public.event_company_action(uuid, uuid, text, text)') is null;
  assert to_regprocedure('public.event_company_snapshot(uuid, uuid)') is null;
  assert to_regprocedure('public.event_interest_counts(uuid[])') is null;
  assert not has_function_privilege('authenticated', 'public.public_live_events(text, integer, integer, uuid)', 'execute');
  assert not has_function_privilege('anon', 'public.public_live_events(text, integer, integer, uuid)', 'execute');
end;
$$;
rollback;
