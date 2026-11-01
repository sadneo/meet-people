\set ON_ERROR_STOP on
begin;
set local plpgsql.check_asserts = on;

do $$ begin
  assert not has_function_privilege('anon', 'public.public_live_events(text,integer,integer,uuid)', 'execute');
  assert not has_function_privilege('authenticated', 'public.public_live_events(text,integer,integer,uuid)', 'execute');
  assert has_function_privilege('service_role', 'public.public_live_events(text,integer,integer,uuid)', 'execute');
end $$;

-- A unique category isolates these assertions from existing seeds and user events.
select set_config('test.events_category', 'events-rpc-' || gen_random_uuid(), true);
insert into public.listings(id, title, listing_type, category, starts_at, ends_at, status, source, external_id, latitude, longitude)
values
  ('ea000000-0000-4000-8000-000000000001', 'Ongoing', 'event', current_setting('test.events_category'), now()-interval '1 hour', now()+interval '1 hour', 'active', 'events-rpc-test', 'ongoing', 40, -73),
  ('ea000000-0000-4000-8000-000000000002', 'Upcoming', 'event', current_setting('test.events_category'), now()+interval '1 day', null, 'active', 'events-rpc-test', 'upcoming', null, null),
  ('ea000000-0000-4000-8000-000000000003', 'Rescheduled', 'event', current_setting('test.events_category'), now()+interval '1 day', null, 'rescheduled', 'events-rpc-test', 'rescheduled', null, null),
  ('ea000000-0000-4000-8000-000000000004', 'Expired', 'event', current_setting('test.events_category'), now()-interval '2 hours', now()-interval '1 hour', 'active', 'events-rpc-test', 'expired', null, null),
  ('ea000000-0000-4000-8000-000000000005', 'Undated', 'event', current_setting('test.events_category'), null, null, 'active', 'events-rpc-test', 'undated', null, null),
  ('ea000000-0000-4000-8000-000000000006', 'Cancelled', 'event', current_setting('test.events_category'), now()+interval '1 day', null, 'cancelled', 'events-rpc-test', 'cancelled', null, null),
  ('ea000000-0000-4000-8000-000000000007', 'Inactive', 'event', current_setting('test.events_category'), now()+interval '1 day', null, 'inactive', 'events-rpc-test', 'inactive', null, null),
  ('ea000000-0000-4000-8000-000000000008', 'Restaurant', 'restaurant', current_setting('test.events_category'), now()+interval '1 day', null, 'active', 'events-rpc-test', 'restaurant', null, null),
  ('ea000000-0000-4000-8000-000000000009', 'Postponed', 'event', current_setting('test.events_category'), now()+interval '1 day', null, 'postponed', 'events-rpc-test', 'postponed', null, null),
  ('ea000000-0000-4000-8000-000000000010', 'Offsale', 'event', current_setting('test.events_category'), now()+interval '1 day', null, 'offsale', 'events-rpc-test', 'offsale', null, null);

set local role service_role;
do $$
declare category_in text := current_setting('test.events_category'); event_out record;
begin
  assert (select array_agg(id) from public.public_live_events(p_category => category_in)) = array[
    'ea000000-0000-4000-8000-000000000001'::uuid,
    'ea000000-0000-4000-8000-000000000002'::uuid,
    'ea000000-0000-4000-8000-000000000003'::uuid
  ], 'List must exclude unavailable/non-event rows and order by start time then ID';
  assert (select id from public.public_live_events(p_category => category_in, p_offset => 1, p_limit => 1)) = 'ea000000-0000-4000-8000-000000000002'::uuid;
  assert not exists(select 1 from public.public_live_events(p_category => category_in, p_offset => 3));
  assert not exists(select 1 from public.public_live_events(p_category => category_in || '-missing'));
  assert public.event_categories() @> to_jsonb(array[category_in]);
  select * into strict event_out from public.public_live_events(p_id => 'ea000000-0000-4000-8000-000000000001', p_limit => 1);
  assert event_out.title = 'Ongoing' and event_out.latitude = 40 and event_out.longitude = -73;
  assert not (to_jsonb(event_out) ?| array['external_id', 'missed_sync_count', 'last_synced_at']), 'Ingestion metadata is not part of the API contract';
  assert not exists(select 1 from public.public_live_events(p_id => 'ea000000-0000-4000-8000-000000000004', p_limit => 1));
  assert not exists(select 1 from public.public_live_events(p_id => 'ea000000-0000-4000-8000-000000000006', p_limit => 1));
  assert not exists(select 1 from public.public_live_events(p_id => 'ea000000-0000-4000-8000-000000000008', p_limit => 1));
end $$;
rollback;
