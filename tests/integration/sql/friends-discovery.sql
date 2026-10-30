\set ON_ERROR_STOP on
begin isolation level read committed;
set local plpgsql.check_asserts=on;
do $$ begin
 if current_database()<>'pebble_safety_owner_disposable'
 or current_setting('pebble.safety_owner_test_target',true) is distinct from 'network-none-safety-owner-v1'
 or not exists(select 1 from public.safety_owner_disposable_marker where singleton and purpose='network-none-safety-owner-v1') then raise exception 'Wrong disposable';end if;
 if exists(select 1 from auth.users where id::text like 'fc000000-%') then raise exception 'Occupied fixture';end if;
end $$;
-- Fixture writes cannot call an external provider. Optional enrichment failure
-- preserves canonical labels. All changes, including this stub, roll back.
create or replace function public.get_gemini_embedding(interest_text text)
returns double precision[] language plpgsql as $$ begin raise exception 'Offline provider unavailable';end $$;
create temporary table friends_queue_before as select profile_id,queue_type from public.queue_entries;
insert into auth.users(id) select ('fc000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,4) n;
insert into public.profiles(id,username,display_name,birthdate,location_city)
select id,'friends-rules-'||right(id::text,1),'Synthetic Friend '||right(id::text,1),
 ((statement_timestamp() at time zone 'America/New_York')::date-interval '24 years')::date,
 'Friends area '||right(id::text,1) from auth.users where id::text like 'fc000000-%';
insert into public.account_settings(user_id,preferences,settings,completed)
select id,'{"distance":"Nearby","group":"Either","intents":["Study buddies"],"usual":[]}',
 '{"notifications":false,"availability":false,"discoverable":true,"location":false}','[]'
from public.profiles where username like 'friends-rules-%';
insert into public.user_interests(profile_id,text)
select p.id,x from public.profiles p cross join unnest(array['Coffee','Board games','Sculpture']) x where p.username like 'friends-rules-%';
insert into public.availability(profile_id,dow,start_time,end_time)
select id,1,'12:00','17:00' from public.profiles where username like 'friends-rules-%';
set local role pebble_location_catalog_publisher;
do $$ declare n integer;begin
 for n in 1..4 loop
 perform public.publish_search_location_place(jsonb_build_object(
  'id','fc100000-0000-4000-8000-'||lpad(n::text,12,'0'),'label','Friends area '||n,'region','Synthetic',
  'aliases',jsonb_build_array('Friends area '||n),'latitude',0,'longitude',n*0.01,
  'provenance','Rollback Friends fixture','verifiedUntil',to_char(statement_timestamp()+interval '2 days','YYYY-MM-DD"T"HH24:MI:SS.USOF'),'enabled',true));
 end loop;
end $$;
reset role;
set local role authenticated;
do $$ declare n integer;owner uuid;receipt jsonb;begin
 for n in 1..4 loop
  owner:=('fc000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
  perform set_config('request.jwt.claim.sub',owner::text,true);
  -- Dating stays explicitly off, and nobody joins any active queue.
  perform public.save_detailed_settings('{"expectedRevision":0,"settings":{"messages":false,"plans":false,"matches":false,"friendsDiscovery":true,"datingDiscovery":false}}');
  receipt:=public.resolve_search_area(jsonb_build_object('requestId','fc200000-0000-4000-8000-'||lpad(n::text,12,'0'),
   'mode','friends','source','home','placeId','fc100000-0000-4000-8000-'||lpad(n::text,12,'0')));
  perform public.save_friends_search_preferences(jsonb_build_object('expectedRevision',0,'preferences',jsonb_build_object(
   'ageMin',18,'ageMax',99,'radiusMiles',15,'goals',jsonb_build_array('Study buddies'),
   'searchArea',jsonb_build_object('source','home','resolvedLocationRef',receipt->>'id'))));
  perform public.save_matching_scoring_settings('{"expectedRevision":0,"timeZone":"America/New_York","showAvailability":false}');
 end loop;
 perform set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000001',true);
 begin perform public.get_friends_scoring_pool('fc000000-0000-4000-8000-000000000001','[]');raise exception 'Private pool leaked';exception when insufficient_privilege then null;end;
 assert jsonb_array_length(public.project_friends_candidates('["fc000000-0000-4000-8000-000000000002","fc000000-0000-4000-8000-000000000003"]')->'candidates')=2;
 assert not (public.project_friends_candidates('["fc000000-0000-4000-8000-000000000002"]')->'candidates'->0)
  ?| array['intervals','goals','birthdate','latitude','longitude','timeZone','score','components'];
end $$;
reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
do $$ declare value jsonb;begin
 value:=public.get_friends_scoring_pool('fc000000-0000-4000-8000-000000000001','[]');
 assert jsonb_array_length(value->'candidates')=3,'Passive discovery incorrectly requires queue participation or Dating';
 assert jsonb_array_length(value->'viewer'->'intervals')>0,'Confirmed canonical timezone ignored';
 assert jsonb_array_length(public.get_friends_scoring_pool('fc000000-0000-4000-8000-000000000001','["fc000000-0000-4000-8000-000000000002"]')->'candidates')=2;
end $$;
reset role;
select set_config('request.jwt.claim.role','authenticated',true);
-- Both directions of age/distance, blocks, account status and current consent
-- are revalidated after scoring, before returning public profiles or committing.
update public.profiles set birthdate=((statement_timestamp() at time zone 'America/New_York')::date-interval '18 years'+interval '1 day')::date
 where id='fc000000-0000-4000-8000-000000000004';
set local role authenticated;
do $$ begin
 assert public.project_friends_candidates('["fc000000-0000-4000-8000-000000000004"]')='{"candidates":[]}'::jsonb,'Under-18 candidate exposed';
 begin perform public.friends_discovery_connection('fc000000-0000-4000-8000-000000000004','request');raise exception 'Minor received request';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000004',true);
 assert public.project_friends_candidates('["fc000000-0000-4000-8000-000000000001"]')='{"candidates":[]}'::jsonb,'Under-18 actor exposed profiles';
 perform set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000001',true);
end $$;
reset role;
update public.friends_search_preferences set preferences=jsonb_set(preferences,'{ageMin}','30') where user_id='fc000000-0000-4000-8000-000000000003';
set local role authenticated;
do $$ begin
 assert public.project_friends_candidates('["fc000000-0000-4000-8000-000000000003"]')='{"candidates":[]}'::jsonb,'Reciprocal age ignored';
end $$;
reset role;
update public.friends_search_preferences set preferences=jsonb_set(preferences,'{ageMin}','18') where user_id='fc000000-0000-4000-8000-000000000003';
update public.friends_search_preferences set preferences=jsonb_set(preferences,'{radiusMiles}','1') where user_id='fc000000-0000-4000-8000-000000000003';
set local role authenticated;
do $$ begin
 assert public.project_friends_candidates('["fc000000-0000-4000-8000-000000000003"]')='{"candidates":[]}'::jsonb,'Reciprocal distance ignored';
end $$;
reset role;
update public.friends_search_preferences set preferences=jsonb_set(preferences,'{radiusMiles}','15') where user_id='fc000000-0000-4000-8000-000000000003';
do $$ begin
 assert not photo_private.audience('fc000000-0000-4000-8000-000000000001','fc000000-0000-4000-8000-000000000004'),'Minor photo exposed via passive audience';
end $$;
update auth.users set banned_until=statement_timestamp()+interval '1 day' where id='fc000000-0000-4000-8000-000000000003';
set local role authenticated;
do $$ begin
 assert public.project_friends_candidates('["fc000000-0000-4000-8000-000000000003"]')='{"candidates":[]}'::jsonb,'Banned candidate exposed';
end $$;
reset role;
update auth.users set banned_until=null where id='fc000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000003',true);
select public.block_owner_target('fc000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000001',true);
do $$ begin
 assert public.project_friends_candidates('["fc000000-0000-4000-8000-000000000003"]')='{"candidates":[]}'::jsonb,'Reverse block bypassed';
 assert public.friends_discovery_connection('fc000000-0000-4000-8000-000000000002','request')->>'status'='sent';
  assert public.friends_discovery_connection('fc000000-0000-4000-8000-000000000002','request')->>'status'='sent','Repeated request not idempotent';
  assert public.social_connection_list()->'sent'->0->>'mode'='friends','Outgoing origin missing';
 perform set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000002',true);
 begin perform public.friends_discovery_connection('fc000000-0000-4000-8000-000000000001','request');raise exception 'Reciprocal request silently accepted';exception when sqlstate 'FR409' then null;end;
  assert public.social_connection('fc000000-0000-4000-8000-000000000001','get')->>'status'='incoming';
  assert public.social_connection_list()->'incoming'->0->>'mode'='friends','Incoming origin missing';
 assert public.friends_discovery_connection('fc000000-0000-4000-8000-000000000001','accept')->>'status'='connected';
  assert public.friends_discovery_connection('fc000000-0000-4000-8000-000000000001','accept')->>'status'='connected','Repeated acceptance not idempotent';
  assert public.social_inbox(1)->'conversations'->0->>'mode'='friends','Friends chat origin lost';
end $$;
reset role;
do $$ begin
 assert (select count(*) from public.connections where user_a='fc000000-0000-4000-8000-000000000001' and user_b='fc000000-0000-4000-8000-000000000002' and status='accepted')=1;
 assert (select count(*) from public.conversations where user_a='fc000000-0000-4000-8000-000000000001' and user_b='fc000000-0000-4000-8000-000000000002')=1;
 assert not exists((select profile_id,queue_type from public.queue_entries except select * from friends_queue_before)
  union all (select * from friends_queue_before except select profile_id,queue_type from public.queue_entries)),'Passive discovery mutated active queues';
 assert not exists(select 1 from public.detailed_settings where user_id::text like 'fc000000-%' and settings->>'datingDiscovery'='true'),'Friends enabled Dating';
 assert not has_function_privilege('authenticated','public.get_friends_scoring_pool(uuid,jsonb)','EXECUTE');
  assert not has_function_privilege('anon','public.project_friends_candidates(jsonb)','EXECUTE');
  assert not has_table_privilege('authenticated','social_private.relationship_modes','SELECT');
  assert not has_function_privilege('authenticated','social_private.record_relationship_mode(uuid,uuid,text)','EXECUTE');
  begin
   perform social_private.record_relationship_mode('fc000000-0000-4000-8000-000000000001','fc000000-0000-4000-8000-000000000002','dating');
   raise exception 'Existing Friends origin was overwritten';
  exception when insufficient_privilege then null;end;
  assert (select mode from social_private.relationship_modes where user_a='fc000000-0000-4000-8000-000000000001' and user_b='fc000000-0000-4000-8000-000000000002')='friends';
end $$;
rollback;
