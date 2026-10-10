-- Run in a transaction after the migrations; all fixtures roll back.
begin;
insert into auth.users (id) select ('b0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid from generate_series(1, 3) n;
do $$
declare
  a uuid := 'b0000000-0000-4000-8000-000000000001';
  b uuid := 'b0000000-0000-4000-8000-000000000002';
  c uuid := 'b0000000-0000-4000-8000-000000000003';
  snap jsonb;
  failed boolean;
begin
  -- A new profile needs a username and display name.
  failed := false;
  begin perform public.save_profile(a, '{"bio": "hi"}'); exception when sqlstate '22023' then failed := true; end;
  assert failed, 'profile created without username';

  perform public.save_profile(a, '{"username": "alex", "display_name": "Alex", "bio": "Coffee"}',
    array['Coffee', 'Music'], '[{"dow": 1, "start_time": "15:00", "end_time": "18:00"}]');
  perform public.save_profile(b, '{"username": "sam", "display_name": "Sam"}', array['Music']);
  perform public.save_profile(c, '{"username": "kai", "display_name": "Kai"}');

  -- Settings are created with defaults.
  assert (select discoverable and notifications and share_availability and not nearby_suggestions
    from public.user_settings where profile_id = a);

  -- Partial edits leave absent fields alone; present nulls clear them.
  perform public.save_profile(a, '{"pronouns": "they/them", "onboarded": true}');
  snap := public.profile_snapshot(a, a);
  assert snap->>'bio' = 'Coffee' and snap->>'pronouns' = 'they/them' and snap->>'onboarded_at' is not null;
  perform public.save_profile(a, '{"bio": null}');
  assert public.profile_snapshot(a, a)->'bio' = 'null'::jsonb;

  -- Interests are replaced as a set; unchanged rows are kept (embedding failures don't block saves).
  perform public.save_profile(a, '{}', array['Music', 'Hiking']);
  assert (select array_agg(text order by text) from public.user_interests where profile_id = a) = array['Hiking', 'Music'];

  -- Usernames are unique regardless of case and must be lowercase.
  failed := false;
  begin perform public.save_profile(b, '{"username": "alex"}'); exception when unique_violation then failed := true; end;
  assert failed, 'duplicate username accepted';
  failed := false;
  begin perform public.save_profile(b, '{"username": "Alex"}'); exception when check_violation then failed := true; end;
  assert failed, 'uppercase username accepted';
  failed := false;
  begin perform public.save_profile(b, '{"latitude": 10}'); exception when check_violation then failed := true; end;
  assert failed, 'unpaired coordinates accepted';

  -- Other viewers get the public shape: no private fields, and no availability unless connected.
  snap := public.profile_snapshot(a, b);
  assert snap->>'username' = 'alex' and not snap ? 'birthdate' and not snap ? 'latitude';
  assert snap->'availability' = 'null'::jsonb and not (snap->>'is_connected')::boolean;
  insert into public.connections(user_a, user_b, status, initiated_by) values (least(a, b), greatest(a, b), 'accepted', a);
  snap := public.profile_snapshot(a, b);
  assert jsonb_array_length(snap->'availability') = 1 and (snap->>'is_connected')::boolean;
  update public.user_settings set share_availability = false where profile_id = a;
  assert public.profile_snapshot(a, b)->'availability' = 'null'::jsonb;

  -- Hidden profiles are invisible to others but not to their owner.
  update public.user_settings set discoverable = false where profile_id = a;
  assert public.profile_snapshot(a, b) is null and public.profile_snapshot(a, a) is not null;
  assert not public.is_discoverable(a) and public.is_discoverable(b);
  update public.user_settings set discoverable = true where profile_id = a;

  -- Blocking hides both directions, severs the connection, and ends dating matches.
  insert into public.dating_matches(user_a, user_b, status, initiated_by) values (least(a, b), greatest(a, b), 'matched', a);
  assert public.block_user(a, b);
  assert public.block_user(a, b), 'blocking is idempotent';
  assert public.profile_snapshot(b, a) is null and public.profile_snapshot(a, b) is null;
  assert not exists (select 1 from public.connections where user_a = least(a, b) and user_b = greatest(a, b));
  assert (select status from public.dating_matches where user_a = least(a, b) and user_b = greatest(a, b)) = 'ended';
  assert jsonb_array_length(public.blocked_users(a)) = 1 and public.blocked_users(a)->0->>'username' = 'sam';
  assert not public.block_user(a, 'b0000000-0000-4000-8000-000000000099'), 'unknown profile blocked';
  failed := false;
  begin perform public.block_user(a, a); exception when sqlstate '22023' then failed := true; end;
  assert failed, 'self-block accepted';

  -- Reports cannot target oneself.
  failed := false;
  begin insert into public.user_reports(reporter_id, reported_id, reason) values (a, a, 'other'); exception when check_violation then failed := true; end;
  assert failed, 'self-report accepted';
  insert into public.user_reports(reporter_id, reported_id, reason, details) values (a, c, 'harassment', 'context');

  -- New settings default off / follow the device.
  assert (select not dating_enabled and not downtime_matching and locale is null and timezone is null
    from public.user_settings where profile_id = c);
  failed := false;
  begin update public.user_settings set locale = 'not a locale!' where profile_id = c; exception when check_violation then failed := true; end;
  assert failed, 'invalid locale accepted';

  -- Choosing the first username is free; changing it is limited to once per 30 days.
  assert public.profile_snapshot(c, c)->'username_changeable_at' = 'null'::jsonb;
  perform public.save_profile(c, '{"username": "kai"}');
  assert (select username_changed_at is null from public.profiles where id = c), 'unchanged username counted';
  perform public.save_profile(c, '{"username": "kai_2"}');
  assert public.profile_snapshot(c, c)->>'username_changeable_at' is not null;
  failed := false;
  begin perform public.save_profile(c, '{"username": "kai_3"}'); exception when sqlstate 'PU429' then failed := true; end;
  assert failed, 'second username change within 30 days accepted';
  update public.profiles set username_changed_at = now() - interval '31 days' where id = c;
  perform public.save_profile(c, '{"username": "kai_3"}');

  -- Exports contain the user's data and name other people only by username.
  snap := public.export_user_data(a);
  assert snap->'profile'->>'username' = 'alex' and snap->'settings'->>'discoverable' = 'true';
  assert jsonb_array_length(snap->'interests') = 2 and jsonb_array_length(snap->'blocked') = 1;
  assert snap->'blocked'->0->>'username' = 'sam' and not (snap->'blocked'->0 ? 'id');
  assert jsonb_array_length(snap->'reports_filed') = 1 and snap->'reports_filed'->0->>'reported' = 'kai_3';
  assert jsonb_array_length(snap->'dating_matches') = 1;
  assert jsonb_array_length(public.export_user_data(b)->'reports_filed') = 0, 'reports against someone leaked into their export';

  -- Sessions: list, revoke one, and revoke all but the current one.
  insert into auth.sessions (id, user_id, created_at, updated_at) values
    ('c0000000-0000-4000-8000-000000000001', a, now() - interval '2 days', now() - interval '2 days'),
    ('c0000000-0000-4000-8000-000000000002', a, now() - interval '1 day', now() - interval '1 day'),
    ('c0000000-0000-4000-8000-000000000003', a, now(), now()),
    ('c0000000-0000-4000-8000-000000000004', b, now(), now());
  assert jsonb_array_length(public.list_sessions(a)) = 3;
  assert public.list_sessions(a)->0->>'id' = 'c0000000-0000-4000-8000-000000000003', 'sessions not newest first';
  assert public.revoke_sessions(a, 'c0000000-0000-4000-8000-000000000004') = 0, 'revoked another user''s session';
  assert public.revoke_sessions(a, 'c0000000-0000-4000-8000-000000000001') = 1;
  assert public.revoke_sessions(a, null, 'c0000000-0000-4000-8000-000000000003') = 1;
  assert jsonb_array_length(public.list_sessions(a)) = 1 and jsonb_array_length(public.list_sessions(b)) = 1;

  -- Deleting the auth user cascades everything away.
  delete from auth.users where id = a;
  assert not exists (select 1 from public.profiles where id = a);
  assert not exists (select 1 from public.user_settings where profile_id = a);
  assert not exists (select 1 from public.user_reports where reporter_id = a);
  assert not exists (select 1 from public.blocks where blocker_id = a);
  assert not exists (select 1 from auth.sessions where user_id = a);
end;
$$;

-- Browser roles cannot call the service functions or read reports.
set local role authenticated;
do $$
begin
  begin perform public.save_profile('b0000000-0000-4000-8000-000000000002', '{}'); raise exception 'save_profile was callable';
  exception when insufficient_privilege then null; end;
  begin perform public.profile_snapshot('b0000000-0000-4000-8000-000000000002', null); raise exception 'profile_snapshot was callable';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.user_reports; raise exception 'reports were readable';
  exception when insufficient_privilege then null; end;
  begin perform public.list_sessions('b0000000-0000-4000-8000-000000000002'); raise exception 'list_sessions was callable';
  exception when insufficient_privilege then null; end;
  begin perform public.revoke_sessions('b0000000-0000-4000-8000-000000000002', null); raise exception 'revoke_sessions was callable';
  exception when insufficient_privilege then null; end;
  begin perform public.export_user_data('b0000000-0000-4000-8000-000000000002'); raise exception 'export_user_data was callable';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.data_export_requests; raise exception 'export requests were readable';
  exception when insufficient_privilege then null; end;
end;
$$;

-- RLS: other users' settings are invisible, and hidden profiles drop out of reads.
set local request.jwt.claim.sub = 'b0000000-0000-4000-8000-000000000002';
do $$
begin
  assert (select count(*) from public.user_settings) = 1, 'saw another user''s settings';
end;
$$;
reset role;
update public.user_settings set discoverable = false where profile_id = 'b0000000-0000-4000-8000-000000000003';
set local role authenticated;
do $$
begin
  assert not exists (select 1 from public.profiles where username = 'kai_3'), 'hidden profile readable';
  assert exists (select 1 from public.profiles where username = 'sam'), 'own profile not readable';
end;
$$;
rollback;
