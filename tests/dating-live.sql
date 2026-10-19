\set ON_ERROR_STOP on
begin isolation level read committed;
set local plpgsql.check_asserts=on;
do $$ begin
 if current_database()<>'pebble_safety_owner_disposable' or current_setting('pebble.safety_owner_test_target',true) is distinct from 'network-none-safety-owner-v1' or not exists(select 1 from public.safety_owner_disposable_marker where singleton and purpose='network-none-safety-owner-v1') then raise exception 'Wrong disposable';end if;
 if exists(select 1 from auth.users where id::text like 'af000000-%') or exists(select 1 from location_private.places where id::text like 'af100000-%') then raise exception 'Fixture occupied';end if;
end $$;
insert into auth.users select ('af000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,4) n;
insert into public.profiles(id,username,display_name,birthdate,location_city)
select id,'active-fixture-'||right(id::text,1),'Synthetic active '||right(id::text,1),'2000-01-01','Synthetic area '||right(id::text,1) from auth.users where id::text like 'af000000-%';
insert into public.account_settings(user_id,preferences,settings,completed) select id,'{"distance":"Nearby","group":"Either","intents":["Activity partners"],"usual":[]}','{"notifications":false,"availability":false,"discoverable":true,"location":false}','[]' from public.profiles where username like 'active-fixture-%';
insert into public.user_interests(profile_id,text) select p.id,x||right(p.id::text,1) from public.profiles p cross join unnest(array['Custom sculpture ','Sourdough ','Sketches ']) x where p.username like 'active-fixture-%';
insert into public.availability(profile_id,dow,start_time,end_time) select id,right(id::text,1)::int,'12:00','17:00' from public.profiles where username like 'active-fixture-%';
set local role pebble_location_catalog_publisher;
do $$ declare n int;begin
 for n in 1..4 loop
 perform public.publish_search_location_place(jsonb_build_object('id','af100000-0000-4000-8000-'||lpad(n::text,12,'0'),'label','Synthetic area '||n,'region','Synthetic','aliases',jsonb_build_array('Synthetic area '||n),'latitude',0,'longitude',case n when 1 then 0 when 2 then 0.01 when 3 then 0.02 else 0.01 end,'provenance','Rollback active fixture','verifiedUntil',to_char(statement_timestamp()+interval '2 days','YYYY-MM-DD"T"HH24:MI:SS.USOF'),'enabled',true));
 end loop;
end $$;
reset role;set local role authenticated;
do $$ declare n int;owner uuid;receipt jsonb;begin
 for n in 1..4 loop
 owner:=('af000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
 perform set_config('request.jwt.claim.sub',owner::text,true);
 perform public.save_detailed_settings('{"expectedRevision":0,"settings":{"messages":false,"plans":false,"matches":false,"friendsDiscovery":true,"datingDiscovery":false}}');
 begin perform public.join_queue('matchmaking');raise exception 'Missing filters joined';exception when sqlstate 'AQ409' then null;end;
 receipt:=public.resolve_search_area(jsonb_build_object('requestId','af200000-0000-4000-8000-'||lpad(n::text,12,'0'),'mode','friends','source','home','placeId','af100000-0000-4000-8000-'||lpad(n::text,12,'0')));
 perform public.save_friends_search_preferences(jsonb_build_object('expectedRevision',0,'preferences',jsonb_build_object('ageMin',18,'ageMax',99,'radiusMiles',15,'goals',jsonb_build_array('Exact custom goal '||n),'searchArea',jsonb_build_object('source','home','resolvedLocationRef',receipt->>'id'))));
 perform public.join_queue('matchmaking');
 end loop;
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.get_queue_match();raise exception 'No JWT match';exception when sqlstate '28000' then null;end;
 perform set_config('request.jwt.claim.sub','af000000-0000-4000-8000-000000000001',true);
 assert (select count(*) from public.get_queue_match())=1;
 assert (select match_profile_id from public.get_queue_match())='af000000-0000-4000-8000-000000000002';
 assert (select shared_interests from public.get_queue_match())='{}'::text[],'Zero interests should qualify';
 assert (select overlap_minutes from public.get_queue_match())=0,'No overlap should qualify';
 assert (select match_score is null and shared_windows is null and event_id is null from public.get_queue_match()),'Invented outcome/event or exact schedule';
 begin perform active_private.people();raise exception 'Private helper leaked';exception when insufficient_privilege then null;end;
end $$;
reset role;

-- All four accounts are real synthetic Auth owners with valid canonical facts.
-- Dating is separately opted in and never inferred from Friends queue membership.
set local role authenticated;
do $$ declare n integer;owner uuid;receipt jsonb;profile jsonb;settings jsonb;result jsonb;begin
 for n in 1..4 loop
  owner:=('af000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
  perform set_config('request.jwt.claim.sub',owner::text,true);
  assert public.get_dating_runtime()->'aggregate'->'profile'->>'enabled'='false';
  begin perform public.find_dating_candidate('[]');raise exception 'Unconsented Dating searched';exception when sqlstate 'DL409' then null;end;
  receipt:=public.resolve_search_area(jsonb_build_object('requestId','af300000-0000-4000-8000-'||lpad(n::text,12,'0'),'mode','dating','source','home','placeId','af100000-0000-4000-8000-'||lpad(n::text,12,'0')));
  profile:=(public.get_dating_preferences()->'profile')||jsonb_build_object('gender',case when n in(1,3) then 'Man' else 'Woman' end,'sexuality','Straight','intent','Long-term relationship','style','Monogamy','heightInches',71);
  perform public.save_dating_preferences(jsonb_build_object('expectedProfileRevision',0,'expectedSearchRevision',0,'profile',profile,'search',jsonb_build_object('ageMin',18,'ageMax',99,'radiusMiles',15,'searchArea',jsonb_build_object('source','home','resolvedLocationRef',receipt->>'id'))));
  assert public.get_dating_runtime()->>'canStart'='false','Dating discovery setting ignored';
  begin perform public.set_dating_enabled('{"expectedProfileRevision":1,"expectedSearchRevision":1,"enabled":true}');raise exception 'Unopted setting enabled';exception when sqlstate 'DL409' then null;end;
  settings:=public.get_detailed_settings();
  perform public.save_detailed_settings(jsonb_build_object('expectedRevision',(settings->>'revision')::integer,'settings',settings->'settings'||'{"datingDiscovery":true}'));
  assert public.get_dating_runtime()->>'canStart'='true';
  perform public.set_dating_enabled('{"expectedProfileRevision":1,"expectedSearchRevision":1,"enabled":true}');
 end loop;
 perform set_config('request.jwt.claim.sub','af000000-0000-4000-8000-000000000001',true);
 result:=public.find_dating_candidate('[]');
 assert result->'candidate'->>'id'='af000000-0000-4000-8000-000000000002','Reciprocal targeting/nearest tie failed';
 assert result->'candidate'->>'gender' is null and result->'candidate'->>'sexuality' is null and result->'candidate'->>'heightInches' is null,'Hidden Dating fields leaked';
 assert not (result->'candidate') ?| array['birthdate','latitude','longitude','search','clarifiedTargets'];
 assert (result->'candidate'->>'age')::integer between 18 and 99;
 assert public.find_dating_candidate('["af000000-0000-4000-8000-000000000002"]')->'candidate'->>'id'='af000000-0000-4000-8000-000000000004';
 begin perform public.find_dating_candidate('["af000000-0000-4000-8000-000000000002","AF000000-0000-4000-8000-000000000002"]');raise exception 'Duplicate exclusions accepted';exception when sqlstate '22023' then null;end;
 -- A heart is a real connection request, not an invented completed Dating match.
 assert public.request_dating_connection('af000000-0000-4000-8000-000000000002')->>'status'='sent';
 assert public.request_dating_connection('af000000-0000-4000-8000-000000000002')->>'status'='sent';
 perform set_config('request.jwt.claim.sub','af000000-0000-4000-8000-000000000002',true);
 assert public.social_connection('af000000-0000-4000-8000-000000000001','get')->>'status'='incoming';
 assert public.request_dating_connection('af000000-0000-4000-8000-000000000001')->>'status'='connected';
 perform public.set_dating_enabled('{"expectedProfileRevision":2,"expectedSearchRevision":2,"enabled":false}');
 perform set_config('request.jwt.claim.sub','af000000-0000-4000-8000-000000000001',true);
 assert public.find_dating_candidate('[]')->'candidate'->>'id'='af000000-0000-4000-8000-000000000004','Paused Dating leaked';
 begin perform public.request_dating_connection('af000000-0000-4000-8000-000000000002');raise exception 'Paused target received Dating request';exception when sqlstate 'DL409' then null;end;
 perform set_config('request.jwt.claim.sub','af000000-0000-4000-8000-000000000004',true);
 perform public.block_owner_target('af000000-0000-4000-8000-000000000001');
 perform set_config('request.jwt.claim.sub','af000000-0000-4000-8000-000000000001',true);
 assert public.find_dating_candidate('[]')='{ "candidate":null}'::jsonb,'Reverse block or incompatible targets ignored';
 begin perform public.request_dating_connection('af000000-0000-4000-8000-000000000004');raise exception 'Blocked Dating request';exception when sqlstate 'DL409' then null;end;
end $$;
reset role;
update location_private.places set enabled=false where id='af100000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
 assert public.get_dating_runtime()->'aggregate'->>'effectiveEnabled'='false';
 -- Pausing must remain available even after a saved location expires/revokes.
 assert public.set_dating_enabled('{"expectedProfileRevision":2,"expectedSearchRevision":2,"enabled":false}')->'aggregate'->'profile'->>'enabled'='false';
 assert public.get_friends_search_preferences()->>'revision'='1','Dating overwrote Friends filters';
 assert (select my_queue from public.get_queue_status())='matchmaking','Dating changed Friends queue';
 begin perform public.set_dating_enabled('{"expectedProfileRevision":2,"expectedSearchRevision":2,"enabled":true}');raise exception 'Stale consent write';exception when sqlstate 'DA409' then null;end;
 begin perform dating_private.people();raise exception 'Private Dating helper exposed';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$ begin
 assert (select count(*) from public.connections where user_a='af000000-0000-4000-8000-000000000001' and user_b='af000000-0000-4000-8000-000000000002' and status='accepted')=1;
 assert (select count(*) from public.conversations where user_a='af000000-0000-4000-8000-000000000001' and user_b='af000000-0000-4000-8000-000000000002')=1;
 assert not exists(select 1 from public.dating_matches where user_a::text like 'af000000-%' or user_b::text like 'af000000-%'),'Legacy Dating lifecycle fabricated';
 assert not has_function_privilege('anon','public.find_dating_candidate(jsonb)','EXECUTE');
end $$;
-- A valid UUID/JWT subject is insufficient when Auth marks the owner anonymous.
update auth.users set is_anonymous=true where id='af000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
 perform set_config('request.jwt.claim.sub','af000000-0000-4000-8000-000000000001',true);
 begin perform public.get_dating_runtime();raise exception 'Anonymous Dating owner admitted';exception when sqlstate '28000' then null;end;
 begin perform public.get_friends_runtime();raise exception 'Anonymous Friends owner admitted';exception when sqlstate '28000' then null;end;
 begin perform public.get_profile_photo_state();raise exception 'Anonymous photo owner admitted';exception when sqlstate '28000' then null;end;
end $$;
reset role;
do $$ begin
 assert not social_private.discoverable('af000000-0000-4000-8000-000000000001');
 assert not safety_private.contact_allowed('af000000-0000-4000-8000-000000000001','af000000-0000-4000-8000-000000000002');
end $$;
rollback;
