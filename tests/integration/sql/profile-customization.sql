-- Profile customization: owner validation, audience-gated showcase reads and
-- per-mode detail audiences. Disposable replay only; everything rolls back.
begin;
set local plpgsql.check_asserts=on;
do $$
declare
 owner constant uuid := 'f9900000-0000-4000-8000-000000000001';
 friend constant uuid := 'f9900000-0000-4000-8000-000000000002';
 stranger constant uuid := 'f9900000-0000-4000-8000-000000000003';
begin
 insert into auth.users(id,email_confirmed_at,created_at,is_anonymous)
 values(owner,now(),now()-interval '20 days',false),(friend,now(),now()-interval '20 days',false),(stranger,now(),now()-interval '20 days',false);
 insert into public.profiles(id,username,display_name,birthdate)
 values(owner,'customization-owner','Owner','2000-01-01'),(friend,'customization-friend','Friend','2000-01-01'),(stranger,'customization-stranger','Stranger','2000-01-01');
 -- Seed rows directly; enrichment triggers are not part of this contract.
 perform set_config('session_replication_role','replica',true);
 insert into public.user_interests(profile_id,text) values(owner,'Coffee'),(owner,'Music'),(owner,'Hiking');
 insert into public.connections(user_a,user_b,initiated_by,status,created_at,responded_at)
 values(least(owner,friend),greatest(owner,friend),owner,'accepted',now(),now());
 insert into public.profile_details(user_id,revision,facts)
 values(owner,1,'{"education":"Biology","occupation":"Barista","languages":["English"],"visibility":{"education":true,"occupation":true,"languages":true}}');
 insert into garden_private.wallets(owner,owned) values(owner,'["bench"]');
 perform set_config('session_replication_role','origin',true);
end $$;

set local role authenticated;
do $$
declare result jsonb;
begin
 perform set_config('request.jwt.claim.sub','f9900000-0000-4000-8000-000000000001',true);
 assert public.get_profile_customization() = '{"revision":0,"customization":{"interestOrder":[],"audiences":{"education":"both","occupation":"both","languages":"both"},"gardenItem":null,"prompts":[],"datingBio":null}}'::jsonb, 'Virtual default changed';
 result := public.save_profile_customization('{"expectedRevision":0,"customization":{"interestOrder":["Music","Coffee"],"audiences":{"education":"friends","occupation":"dating","languages":"both"},"gardenItem":"bench"}}');
 assert result->>'revision' = '1' and result->'customization'->'interestOrder' = '["Music","Coffee"]'::jsonb, 'Customization not saved';
 begin
  perform public.save_profile_customization('{"expectedRevision":0,"customization":{"interestOrder":[],"audiences":{"education":"both","occupation":"both","languages":"both"},"gardenItem":null}}');
  raise exception 'Stale revision accepted';
 exception when sqlstate 'PC409' then null; end;
 begin
  perform public.save_profile_customization('{"expectedRevision":1,"customization":{"interestOrder":["Chess"],"audiences":{"education":"both","occupation":"both","languages":"both"},"gardenItem":null}}');
  raise exception 'Unsaved interest accepted';
 exception when sqlstate '22023' then null; end;
 begin
  perform public.save_profile_customization('{"expectedRevision":1,"customization":{"interestOrder":[],"audiences":{"education":"both","occupation":"both","languages":"both"},"gardenItem":"cottage"}}');
  raise exception 'Unowned Garden item accepted';
 exception when sqlstate '22023' then null; end;
 begin
  perform public.save_profile_customization('{"expectedRevision":1,"customization":{"interestOrder":[],"audiences":{"education":"everyone","occupation":"both","languages":"both"},"gardenItem":null}}');
  raise exception 'Unknown audience accepted';
 exception when sqlstate '22023' then null; end;
 begin
  perform public.save_profile_customization('{"expectedRevision":1,"customization":{"interestOrder":["Coffee","Coffee"],"audiences":{"education":"both","occupation":"both","languages":"both"},"gardenItem":null}}');
  raise exception 'Duplicate order accepted';
 exception when sqlstate '22023' then null; end;
 assert public.get_profile_customization()->>'revision' = '1', 'Rejected saves changed the revision';
 -- The owner reads their own showcase like anyone in their audience.
 assert public.get_profile_showcase('f9900000-0000-4000-8000-000000000001') = '{"interestOrder":["Music","Coffee"],"gardenItem":"bench"}'::jsonb;

 perform set_config('request.jwt.claim.sub','f9900000-0000-4000-8000-000000000002',true);
 assert public.get_profile_showcase('f9900000-0000-4000-8000-000000000001') = '{"interestOrder":["Music","Coffee"],"gardenItem":"bench"}'::jsonb, 'Connection cannot see showcase';
 assert (public.get_profile_customization()->>'revision') = '0', 'Another account read owner customization';

 perform set_config('request.jwt.claim.sub','f9900000-0000-4000-8000-000000000003',true);
 begin
  perform public.get_profile_showcase('f9900000-0000-4000-8000-000000000001');
  raise exception 'Stranger read showcase';
 exception when sqlstate 'PC404' then null; end;
end $$;
reset role;

do $$
declare
 person constant uuid := 'f9900000-0000-4000-8000-000000000001';
 friend constant uuid := 'f9900000-0000-4000-8000-000000000002';
begin
 -- Optional details respect each field's audience per mode.
 assert matching_private.discovery_details(friend,person,'friends')->'details' = '{"education":"Biology","languages":["English"]}'::jsonb, 'Friends audience wrong';
 assert matching_private.discovery_details(friend,person,'dating')->'details' = '{"occupation":"Barista","languages":["English"]}'::jsonb, 'Dating audience wrong';
 assert matching_private.discovery_details(friend,person)->'details' = '{"languages":["English"]}'::jsonb, 'Unspecified mode must only show shared details';
 assert position($q$discovery_details(actor,target_in,'dating')$q$ in pg_get_functiondef('public.project_dating_candidate(uuid)'::regprocedure)) > 0, 'Dating projection not mode-aware';
 assert position($q$discovery_details(actor,target,'friends')$q$ in pg_get_functiondef('public.project_friends_candidates(jsonb)'::regprocedure)) > 0, 'Friends projection not mode-aware';
 assert not has_function_privilege('authenticated','matching_private.discovery_details(uuid,uuid,text)','EXECUTE');
 assert not has_function_privilege('anon','public.get_profile_showcase(uuid)','EXECUTE');
 assert not has_table_privilege('authenticated','public.profile_customization','SELECT');

 -- Stale choices drop out of the public view without rewriting the owner's.
 perform set_config('session_replication_role','replica',true);
 update garden_private.wallets set owned='[]' where owner=person;
 delete from public.user_interests where profile_id=person and text='Music';
 perform set_config('session_replication_role','origin',true);
end $$;

set local role authenticated;
do $$ begin
 perform set_config('request.jwt.claim.sub','f9900000-0000-4000-8000-000000000002',true);
 assert public.get_profile_showcase('f9900000-0000-4000-8000-000000000001') = '{"interestOrder":["Coffee"],"gardenItem":null}'::jsonb, 'Stale showcase choices leaked';
 perform set_config('request.jwt.claim.sub','f9900000-0000-4000-8000-000000000001',true);
 assert public.get_profile_customization()->'customization'->'interestOrder' = '["Music","Coffee"]'::jsonb, 'Owner choices rewritten';
 assert public.save_profile_customization('{"expectedRevision":1,"customization":{"interestOrder":["Coffee"],"audiences":{"education":"both","occupation":"both","languages":"both"},"gardenItem":"pebble"}}')->>'revision' = '2', 'Pebble showcase rejected';
end $$;
reset role;
rollback;
