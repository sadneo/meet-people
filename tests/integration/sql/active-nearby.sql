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
-- Farther candidate shares everything; distance must still win.
update public.user_interests set text=regexp_replace(text,'3$','1') where profile_id='af000000-0000-4000-8000-000000000003';
update public.availability set dow=1 where profile_id='af000000-0000-4000-8000-000000000003';
set local role authenticated;
do $$ begin assert (select match_profile_id from public.get_queue_match())='af000000-0000-4000-8000-000000000002','Soft signals outranked distance';end $$;
reset role;
-- Equal-distance soft interest tie-breaker, including a custom comparison key.
update public.user_interests set text=case when text like 'Custom%' then E'  CUSTOM SCULPTURE 1\t' else regexp_replace(text,'4$','1') end where profile_id='af000000-0000-4000-8000-000000000004';
set local role authenticated;
do $$ begin
 assert (select match_profile_id from public.get_queue_match())='af000000-0000-4000-8000-000000000004';
 assert (select cardinality(shared_interests) from public.get_queue_match())=3;
end $$;
reset role;
-- Equal interests use exact shared time as the next soft tie-breaker.
update public.user_interests set text=regexp_replace(text,'2$','1') where profile_id='af000000-0000-4000-8000-000000000002';
set local role authenticated;
do $$ begin assert (select match_profile_id from public.get_queue_match())='af000000-0000-4000-8000-000000000002','Stable UUID tie-break failed';end $$;
reset role;
update public.availability set dow=1 where profile_id='af000000-0000-4000-8000-000000000004';
set local role authenticated;
do $$ begin
 assert (select match_profile_id from public.get_queue_match())='af000000-0000-4000-8000-000000000004','Overlap soft tie-break failed';
 assert (select overlap_minutes from public.get_queue_match())=300;
 -- Reverse-direction block excludes the winning candidate immediately.
 perform set_config('request.jwt.claim.sub','af000000-0000-4000-8000-000000000004',true);
 perform public.block_owner_target('af000000-0000-4000-8000-000000000001');
 perform set_config('request.jwt.claim.sub','af000000-0000-4000-8000-000000000001',true);
 assert (select match_profile_id from public.get_queue_match())='af000000-0000-4000-8000-000000000002';
end $$;
reset role;
-- Reciprocal radius and age apply, not just the requester's values.
update public.friends_search_preferences set preferences=jsonb_set(preferences,'{ageMin}','99')||'{"ageMax":99}' where user_id='af000000-0000-4000-8000-000000000002';
set local role authenticated;
do $$ begin assert (select match_profile_id from public.get_queue_match())='af000000-0000-4000-8000-000000000003','Reciprocal age ignored';end $$;
reset role;
update public.friends_search_preferences set preferences=jsonb_set(preferences,'{radiusMiles}','1') where user_id='af000000-0000-4000-8000-000000000003';
set local role authenticated;
do $$ begin assert (select count(*) from public.get_queue_match())=0,'Reciprocal radius ignored';end $$;
reset role;
update public.friends_search_preferences set preferences=jsonb_set(preferences,'{radiusMiles}','15') where user_id='af000000-0000-4000-8000-000000000003';
update location_private.places set enabled=false where id='af100000-0000-4000-8000-000000000003';
set local role authenticated;
do $$ begin assert (select count(*) from public.get_queue_match())=0,'Revocation ignored';end $$;
reset role;
update location_private.places set enabled=true where id='af100000-0000-4000-8000-000000000003';
update public.detailed_settings set settings=settings||'{"friendsDiscovery":false}' where user_id='af000000-0000-4000-8000-000000000003';
set local role authenticated;
do $$ begin assert (select count(*) from public.get_queue_match())=0,'Discovery withdrawal ignored';end $$;
reset role;
update public.detailed_settings set settings=settings||'{"friendsDiscovery":true}' where user_id='af000000-0000-4000-8000-000000000003';
set local role authenticated;
do $$ begin
 assert (select count(*) from public.get_queue_match())=1;
 perform public.leave_queue();
 begin perform public.get_queue_match();raise exception 'Cancelled queue returned candidate';exception when sqlstate 'AQ409' then null;end;
 perform public.join_queue('downtime');
 begin perform public.get_queue_match();raise exception 'Invented downtime lifecycle';exception when sqlstate 'AQ503' then null;end;
 perform public.join_queue('matchmaking');
 assert (select my_queue from public.get_queue_status())='matchmaking';
 assert (select others_in_my_queue from public.get_queue_status()) is null;
 begin perform public.join_queue('dating');raise exception 'Dating queue activated';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$ begin
 assert not has_function_privilege('anon','public.get_queue_match()','EXECUTE');
 assert (select count(*) from public.queue_entries where profile_id::text like 'af000000-%')=4,'Result mutated queue';
 assert not exists(select 1 from public.connections where user_a::text like 'af000000-%' or user_b::text like 'af000000-%'),'Result fabricated connection';
 assert not exists(select 1 from public.profiles where username like 'active-fixture-%' and (latitude is not null or longitude is not null)),'Search overwrote home coordinates';
end $$;
rollback;
