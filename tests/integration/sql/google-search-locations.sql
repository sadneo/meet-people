\set ON_ERROR_STOP on
begin isolation level read committed;
set local plpgsql.check_asserts=on;
do $$ begin
 if current_database()<>'pebble_safety_owner_disposable'
 or current_setting('pebble.safety_owner_test_target',true) is distinct from 'network-none-safety-owner-v1'
 or not exists(select 1 from public.safety_owner_disposable_marker where singleton and purpose='network-none-safety-owner-v1') then raise exception 'Wrong disposable';end if;
end $$;
insert into auth.users(id) values('af000000-0000-4000-8000-000000000001'),('af000000-0000-4000-8000-000000000002');
insert into public.profiles(id,username,display_name,birthdate,location_city)
select id,'map-fixture-'||right(id::text,1),'Synthetic Map User','2000-01-01','Unchanged profile home' from auth.users where id::text like 'af000000-%';
insert into public.account_settings(user_id,preferences,settings,completed)
select id,'{"distance":"Nearby","group":"Either","intents":["New friends"],"usual":[]}',
 '{"notifications":false,"availability":false,"discoverable":true,"location":false}','[]'
from public.profiles where username like 'map-fixture-%';
alter table public.user_interests disable trigger trg_user_interests_embed;
insert into public.user_interests(profile_id,text) select p.id,x from public.profiles p cross join unnest(array['Coffee','Art','Music']) x where p.username like 'map-fixture-%';
insert into public.availability(profile_id,dow,start_time,end_time) select id,1,'12:00','17:00' from public.profiles where username like 'map-fixture-%';

-- Synthetic signed provider tickets are created ONLY by this disposable DB owner.
create temporary table map_test_tickets(name text primary key,ticket jsonb);
do $$ declare row_in record; payload text;issued timestamptz;begin
 for row_in in select * from (values
  ('friends-a','af000000-0000-4000-8000-000000000001','friends','map-pin',40.7,-73.9),
  ('friends-b','af000000-0000-4000-8000-000000000002','friends','place-search',40.7,-73.91),
  ('friends-far','af000000-0000-4000-8000-000000000002','friends','map-pin',40.7,-74.9),
  ('dating-a','af000000-0000-4000-8000-000000000001','dating','place-search',40.7,-73.9),
  ('device-a','af000000-0000-4000-8000-000000000001','friends','device-assisted',40.7,-73.9),
  ('expired','af000000-0000-4000-8000-000000000001','friends','map-pin',40.7,-73.9),
  ('invalid-coordinates','af000000-0000-4000-8000-000000000001','friends','map-pin',999,-73.9)
 ) as rows(name,actor,mode,origin,lat,lon) loop
  issued:=statement_timestamp()-case when row_in.name='expired' then interval '20 minutes' else interval '0 seconds' end;
  payload:=jsonb_build_object('actorId',row_in.actor,'requestId',gen_random_uuid(),'mode',row_in.mode,'origin',row_in.origin,
   'latitude',row_in.lat,'longitude',row_in.lon,'areaLabel','Synthetic area, NY','providerPlaceId','synthetic-provider-id',
   'issuedAt',to_char(issued at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'expiresAt',to_char((issued+interval '10 minutes') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))::text;
  insert into map_test_tickets values(row_in.name,jsonb_build_object('payload',payload,'signature',encode(extensions.hmac(convert_to(payload,'UTF8'),decode(repeat('ab',32),'hex'),'sha256'),'hex')));
 end loop;
end $$;
grant select on map_test_tickets to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','af000000-0000-4000-8000-000000000001',true);
do $$ begin
 begin perform public.confirm_map_search_location((select ticket from map_test_tickets where name='friends-a'));raise exception 'Unconfigured issuer accepted ticket';exception when sqlstate 'LC503' then null;end;
end $$;
reset role;
insert into location_private.map_signing_key values(true,decode(repeat('ab',32),'hex'));
set local role authenticated;
do $$ declare ticket jsonb; receipt jsonb; prefs jsonb;dating_receipt jsonb;begin
 ticket:=(select t.ticket from map_test_tickets t where name='friends-a');
 begin perform public.confirm_map_search_location(jsonb_set(ticket,'{signature}',to_jsonb(repeat('0',64))));raise exception 'Forged signature accepted';exception when sqlstate '22023' then null;end;
 begin perform public.confirm_map_search_location(jsonb_set(ticket,'{payload}',to_jsonb((ticket->>'payload')||' ')));raise exception 'Changed signed bytes accepted';exception when sqlstate '22023' then null;end;
 begin perform public.confirm_map_search_location((select t.ticket from map_test_tickets t where name='friends-b'));raise exception 'Other owner ticket accepted';exception when sqlstate '22023' then null;end;
 begin perform public.confirm_map_search_location((select t.ticket from map_test_tickets t where name='expired'));raise exception 'Expired preview accepted';exception when sqlstate 'LC409' then null;end;
 begin perform public.confirm_map_search_location((select t.ticket from map_test_tickets t where name='invalid-coordinates'));raise exception 'Invalid center accepted';exception when sqlstate '22023' then null;end;
 begin perform public.confirm_map_search_location((select t.ticket from map_test_tickets t where name='device-a'));raise exception 'Device opt-in bypass';exception when sqlstate 'LC403' then null;end;
 prefs:=public.get_friends_search_preferences();receipt:=public.confirm_map_search_location(ticket);
 assert receipt->>'method'='selected-area' and receipt->>'usable'='true' and receipt->>'source'='temporary';
 assert not receipt ?| array['latitude','longitude','center','providerPlaceId'];
 assert public.confirm_map_search_location(ticket)=receipt,'Same-ticket retry changed reference';
 assert public.get_friends_search_preferences()=prefs,'Preview issuance changed preferences';
 assert public.get_search_location_map('friends',(receipt->>'id')::uuid)->'center'='{"latitude":40.7,"longitude":-73.9}'::jsonb;
 begin perform public.get_search_location_map('dating',(receipt->>'id')::uuid);raise exception 'Cross-mode map read';exception when sqlstate 'PT404' then null;end;
 perform set_config('pebble.map_ref_a',receipt->>'id',true);
 perform public.save_friends_search_preferences(jsonb_build_object('expectedRevision',0,'preferences',jsonb_build_object(
  'ageMin',18,'ageMax',99,'radiusMiles',15,'goals','[]'::jsonb,'searchArea',jsonb_build_object('source','temporary','areaLabel',receipt->>'areaLabel','resolvedLocationRef',receipt->>'id'))));
 dating_receipt:=public.confirm_map_search_location((select t.ticket from map_test_tickets t where name='dating-a'));
 perform public.save_dating_preferences(jsonb_build_object('expectedProfileRevision',0,'expectedSearchRevision',0,'profile',public.get_dating_preferences()->'profile','search',jsonb_build_object(
  'ageMin',18,'ageMax',99,'radiusMiles',15,'searchArea',jsonb_build_object('source','temporary','areaLabel',dating_receipt->>'areaLabel','resolvedLocationRef',dating_receipt->>'id'))));
 assert public.get_dating_preferences()->'profile'->>'enabled'='false','Map choice enabled Dating';
 perform set_config('request.jwt.claim.sub','af000000-0000-4000-8000-000000000002',true);
 begin perform public.get_search_location_map('friends',(receipt->>'id')::uuid);raise exception 'Other owner coordinates leaked';exception when sqlstate 'PT404' then null;end;
 receipt:=public.confirm_map_search_location((select t.ticket from map_test_tickets t where name='friends-b'));
 perform public.save_friends_search_preferences(jsonb_build_object('expectedRevision',0,'preferences',jsonb_build_object(
  'ageMin',18,'ageMax',99,'radiusMiles',15,'goals','[]'::jsonb,'searchArea',jsonb_build_object('source','temporary','areaLabel',receipt->>'areaLabel','resolvedLocationRef',receipt->>'id'))));
 assert jsonb_array_length(public.project_friends_candidates('["af000000-0000-4000-8000-000000000001"]')->'candidates')=1,'Selected map centers not consumed by matching';
 assert not (public.project_friends_candidates('["af000000-0000-4000-8000-000000000001"]')->'candidates'->0) ?| array['latitude','longitude','center'];
 receipt:=public.confirm_map_search_location((select t.ticket from map_test_tickets t where name='friends-far'));
 prefs:=public.get_friends_search_preferences();
 perform public.save_friends_search_preferences(jsonb_build_object('expectedRevision',prefs->'revision','preferences',jsonb_set(prefs->'preferences','{searchArea}',jsonb_build_object('source','temporary','areaLabel',receipt->>'areaLabel','resolvedLocationRef',receipt->>'id'))));
 assert jsonb_array_length(public.project_friends_candidates('["af000000-0000-4000-8000-000000000001"]')->'candidates')=0,'New pin did not change distance filtering';
end $$;
reset role;
update public.profiles set location_city='Changed profile home' where id::text like 'af000000-%';
do $$ declare role_in text;begin
 assert location_private.usable('friends',current_setting('pebble.map_ref_a')::uuid,'af000000-0000-4000-8000-000000000001','temporary','Synthetic area, NY'),'Manual search area depends on home/GPS settings';
 foreach role_in in array array['anon','authenticated','service_role','pebble_location_catalog_publisher'] loop
  assert not has_table_privilege(role_in::name,'location_private.map_signing_key','SELECT,INSERT,UPDATE,DELETE');
  assert not has_any_column_privilege(role_in::name,'location_private.map_signing_key','SELECT');
  assert not has_table_privilege(role_in::name,'location_private.map_selections','SELECT,INSERT,UPDATE,DELETE');
  assert not has_function_privilege(role_in::name,'location_private.purge_map_locations()','EXECUTE');
 end loop;
 assert not has_function_privilege('anon','public.confirm_map_search_location(jsonb)','EXECUTE');
 assert not has_function_privilege('anon','public.get_search_location_map(text,uuid)','EXECUTE');
end $$;
update location_private.assertions set issued_at=statement_timestamp()-interval '31 days',expires_at=statement_timestamp()-interval '1 day' where actor_id::text like 'af000000-%' and method='selected-area';
select location_private.purge_map_locations();
do $$ begin
 assert not exists(select 1 from location_private.map_selections);
 assert not exists(select 1 from public.friends_search_location_refs where user_id::text like 'af000000-%');
 assert not exists(select 1 from public.dating_search_location_refs where user_id::text like 'af000000-%');
end $$;
rollback;
