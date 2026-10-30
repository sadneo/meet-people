\set ON_ERROR_STOP on
begin isolation level read committed;
set local plpgsql.check_asserts=on;
do $$ begin
 if current_database()<>'pebble_safety_owner_disposable'
 or current_setting('pebble.safety_owner_test_target',true) is distinct from 'network-none-safety-owner-v1'
 or not exists(select 1 from public.safety_owner_disposable_marker where singleton and purpose='network-none-safety-owner-v1') then raise exception 'Wrong disposable';end if;
 if exists(select 1 from auth.users where id::text like 'ad000000-%') then raise exception 'Occupied fixture';end if;
end $$;
-- No external enrichment during fixture setup. Exception remains optional
-- derived data; canonical interest labels must still save. Rolled back below.
create or replace function public.get_gemini_embedding(interest_text text)
returns double precision[] language plpgsql as $$ begin raise exception 'Offline provider unavailable';end $$;
insert into auth.users(id) select ('ad000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,4) n;
insert into public.profiles(id,username,display_name,birthdate,location_city)
select id,'dating-rules-'||right(id::text,1),'Synthetic Dating '||right(id::text,1),'2000-01-01','Rules area '||right(id::text,1) from auth.users where id::text like 'ad000000-%';
insert into public.account_settings(user_id,preferences,settings,completed)
select id,'{"distance":"Nearby","group":"Either","intents":["Activity partners"],"usual":[]}',
 '{"notifications":false,"availability":false,"discoverable":true,"location":false}','[]'
from public.profiles where username like 'dating-rules-%';
insert into public.user_interests(profile_id,text)
select p.id,x from public.profiles p cross join unnest(array['Coffee','Board games','Sculpture']) x where p.username like 'dating-rules-%';
insert into public.availability(profile_id,dow,start_time,end_time)
select id,1,'12:00','17:00' from public.profiles where username like 'dating-rules-%';
set local role pebble_location_catalog_publisher;
do $$ declare n integer;begin
 for n in 1..4 loop
 perform public.publish_search_location_place(jsonb_build_object(
  'id','ad100000-0000-4000-8000-'||lpad(n::text,12,'0'),'label','Rules area '||n,'region','Synthetic',
  'aliases',jsonb_build_array('Rules area '||n),'latitude',0,'longitude',n*0.01,
  'provenance','Rollback Dating rules fixture','verifiedUntil',to_char(statement_timestamp()+interval '2 days','YYYY-MM-DD"T"HH24:MI:SS.USOF'),'enabled',true));
 end loop;
end $$;
reset role;
set local role authenticated;
do $$ declare n integer;owner uuid;receipt jsonb;profile jsonb;begin
 for n in 1..4 loop
  owner:=('ad000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
  perform set_config('request.jwt.claim.sub',owner::text,true);
  perform public.save_detailed_settings('{"expectedRevision":0,"settings":{"messages":false,"plans":false,"matches":false,"friendsDiscovery":false,"datingDiscovery":true}}');
  receipt:=public.resolve_search_area(jsonb_build_object('requestId','ad200000-0000-4000-8000-'||lpad(n::text,12,'0'),
   'mode','dating','source','home','placeId','ad100000-0000-4000-8000-'||lpad(n::text,12,'0')));
  profile:=(public.get_dating_preferences()->'profile')||jsonb_build_object(
   'gender',case when n=1 then 'Man' else 'Woman' end,'sexuality','Straight','intent','Long-term relationship','style','Monogamy',
   'clarifiedTargets',case when n=1 then '["Woman"]'::jsonb else '["Man"]'::jsonb end);
  perform public.save_dating_preferences(jsonb_build_object('expectedProfileRevision',0,'expectedSearchRevision',0,'profile',profile,
   'search',jsonb_build_object('ageMin',18,'ageMax',99,'radiusMiles',15,'searchArea',jsonb_build_object('source','home','resolvedLocationRef',receipt->>'id'))));
  perform public.set_dating_enabled('{"expectedProfileRevision":1,"expectedSearchRevision":1,"enabled":true}');
  assert public.get_dating_scoring_settings()='{"revision":0,"timeZone":null,"showAvailability":false}'::jsonb;
  perform public.save_dating_scoring_settings('{"expectedRevision":0,"timeZone":"America/New_York","showAvailability":false}');
  begin
   perform public.save_dating_scoring_settings('{"expectedRevision":0,"timeZone":"UTC","showAvailability":true}');
   raise exception 'Stale settings accepted';
  exception when sqlstate 'DA409' then null;end;
 end loop;
 perform set_config('request.jwt.claim.sub','ad000000-0000-4000-8000-000000000001',true);
 begin perform public.get_dating_scoring_pool('ad000000-0000-4000-8000-000000000001','[]');raise exception 'Private pool leaked';exception when insufficient_privilege then null;end;
 assert public.project_dating_candidate('ad000000-0000-4000-8000-000000000002')->'candidate'->>'id'='ad000000-0000-4000-8000-000000000002';
 assert not (public.project_dating_candidate('ad000000-0000-4000-8000-000000000002')->'candidate') ?| array['intervals','timeZone','birthdate','clarifiedTargets','latitude','longitude','score','components'];
end $$;
reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
do $$ declare value jsonb;begin
 value:=public.get_dating_scoring_pool('ad000000-0000-4000-8000-000000000001','[]');
 assert jsonb_array_length(value->'candidates')=3,'Eligible bounded pool failed';
 assert jsonb_array_length(value->'viewer'->'intervals')>0,'Confirmed timezone not used';
 value:=public.get_dating_scoring_pool('ad000000-0000-4000-8000-000000000001','["ad000000-0000-4000-8000-000000000002"]');
 assert jsonb_array_length(value->'candidates')=2,'Exclusions ignored';
end $$;
reset role;
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
do $$ begin
 perform set_config('request.jwt.claim.sub','ad000000-0000-4000-8000-000000000001',true);
 assert public.request_dating_connection('ad000000-0000-4000-8000-000000000002')->>'status'='sent';
 assert public.social_connection_list()->'sent'->0->>'mode'='dating','Dating request origin missing';
 perform set_config('request.jwt.claim.sub','ad000000-0000-4000-8000-000000000002',true);
 assert public.social_connection_list()->'incoming'->0->>'mode'='dating','Incoming Dating origin missing';
 assert public.request_dating_connection('ad000000-0000-4000-8000-000000000001')->>'status'='connected';
 assert public.social_inbox(1)->'conversations'->0->>'mode'='dating','Dating chat origin lost';
 assert public.request_dating_connection('ad000000-0000-4000-8000-000000000001')->>'status'='connected','Repeated mutual like changed relationship';
 perform public.social_connection('ad000000-0000-4000-8000-000000000001','remove');
 assert public.social_inbox(1)->'conversations'->0->>'mode'='dating','Saved history lost origin after removal';
 perform set_config('request.jwt.claim.sub','ad000000-0000-4000-8000-000000000001',true);
end $$;
reset role;
-- Eligibility is repeated after the private pool has been read.
set local role authenticated;
select set_config('request.jwt.claim.sub','ad000000-0000-4000-8000-000000000002',true);
select public.block_owner_target('ad000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub','ad000000-0000-4000-8000-000000000001',true);
do $$ begin
 assert public.project_dating_candidate('ad000000-0000-4000-8000-000000000002')='{"candidate":null}'::jsonb,'Reverse block bypassed revalidation';
end $$;
reset role;
update public.dating_owner_aggregates set search=jsonb_set(search,'{ageMin}','30') where user_id='ad000000-0000-4000-8000-000000000003';
set local role authenticated;
do $$ begin
 assert public.project_dating_candidate('ad000000-0000-4000-8000-000000000003')='{"candidate":null}'::jsonb,'Reverse age filter ignored';
end $$;
reset role;
update auth.users set banned_until=statement_timestamp()+interval '1 day' where id='ad000000-0000-4000-8000-000000000004';
set local role authenticated;
do $$ begin
 assert public.project_dating_candidate('ad000000-0000-4000-8000-000000000004')='{"candidate":null}'::jsonb,'Suspended account exposed';
end $$;
reset role;
do $$ begin
 assert not has_function_privilege('anon','public.project_dating_candidate(uuid)','EXECUTE');
 assert not has_function_privilege('authenticated','public.get_dating_scoring_pool(uuid,jsonb)','EXECUTE');
 assert not has_table_privilege('authenticated','matching_private.scoring_settings','SELECT');
 assert public.dating_targets('{"gender":"Man","sexuality":"Straight","clarifiedTargets":[]}') is null,'Inferred targets survived';
 assert (timestamp '2026-11-01 01:30' at time zone 'America/New_York')=timestamptz '2026-11-01 06:30+00','Fall ambiguity policy changed';
 assert ((timestamp '2026-03-08 02:30' at time zone 'America/New_York') at time zone 'America/New_York')<>timestamp '2026-03-08 02:30','Spring gap policy changed';
end $$;
rollback;
