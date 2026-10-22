-- Real SQL acceptance, synthetic places ONLY inside rollback scope.
\set ON_ERROR_STOP on
begin isolation level read committed;
set local plpgsql.check_asserts=on;
do $$ begin
 if current_database()<>'pebble_safety_owner_disposable' or current_setting('pebble.safety_owner_test_target',true) is distinct from 'network-none-safety-owner-v1'
 or not exists(select 1 from public.safety_owner_disposable_marker where singleton and purpose='network-none-safety-owner-v1') then raise exception 'Wrong disposable';end if;
 if exists(select 1 from auth.users where id in('ab000000-0000-4000-8000-000000000001','ab000000-0000-4000-8000-000000000002')) or exists(select 1 from location_private.places where id='ac000000-0000-4000-8000-000000000001') then raise exception 'Fixture occupied';end if;
end $$;
insert into auth.users values('ab000000-0000-4000-8000-000000000001'),('ab000000-0000-4000-8000-000000000002');
insert into public.profiles(id,username,display_name,birthdate,location_city) values
 ('ab000000-0000-4000-8000-000000000001','location-fixture-a','Synthetic location A','2000-01-01','Synthetic campus A'),
 ('ab000000-0000-4000-8000-000000000002','location-fixture-b','Synthetic location B','2000-01-01','Other synthetic home');
insert into public.account_settings(user_id,preferences,settings,completed) select id,'{"distance":"Nearby","group":"One-on-one","intents":[],"usual":[]}','{"notifications":false,"availability":false,"discoverable":false,"location":false}','[]' from public.profiles where username like 'location-fixture-%';
create temporary table location_profiles_before as select p.* from public.profiles p where username like 'location-fixture-%';
set local role pebble_location_catalog_publisher;
select public.publish_search_location_place(jsonb_build_object('id','ac000000-0000-4000-8000-000000000001','label','Synthetic campus A','region','Synthetic test region','aliases',jsonb_build_array('Synthetic campus A'),'latitude',0,'longitude',0,'provenance','Synthetic offline fixture, not a real place','verifiedUntil',to_char(statement_timestamp()+interval '2 days','YYYY-MM-DD"T"HH24:MI:SS.USOF'),'enabled',true));
reset role;
set local role authenticated;
do $$ declare a uuid:='ab000000-0000-4000-8000-000000000001';b uuid:='ab000000-0000-4000-8000-000000000002';home_receipt jsonb;dating_receipt jsonb;payload jsonb;device jsonb;begin
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.search_location_places('Synthetic');raise exception 'No JWT lookup';exception when sqlstate '28000' then null;end;
 perform set_config('request.jwt.claim.sub',a::text,true);
 begin perform public.publish_search_location_place('{}');raise exception 'Browser publisher';exception when insufficient_privilege then null;end;
 assert jsonb_array_length(public.search_location_places('Synthetic')->'places')=1;
 assert not (public.search_location_places('Synthetic')->'places'->0) ? 'latitude';
 payload:='{"requestId":"ad000000-0000-4000-8000-000000000001","mode":"friends","source":"home","placeId":"ac000000-0000-4000-8000-000000000001"}';
 home_receipt:=public.resolve_search_area(payload);
 assert home_receipt->>'usable'='true' and home_receipt->>'areaLabel'='Synthetic campus A';
 assert home_receipt->>'method'='geocoded-area' and not home_receipt ? 'latitude';
 assert public.resolve_search_area(payload)=home_receipt,'Replay changed receipt';
 begin perform public.resolve_search_area(payload||'{"source":"temporary"}');raise exception 'Request retargeted';exception when sqlstate 'LC409' then null;end;
 perform set_config('pebble.location_home_ref',home_receipt->>'id',true);
 assert public.save_friends_search_preferences(jsonb_build_object('expectedRevision',0,'preferences',jsonb_build_object('ageMin',18,'ageMax',99,'radiusMiles',15,'goals','[]'::jsonb,'searchArea',jsonb_build_object('source','home','resolvedLocationRef',home_receipt->>'id'))))->>'revision'='1';
 dating_receipt:=public.resolve_search_area(payload||'{"requestId":"ad000000-0000-4000-8000-000000000002","mode":"dating","source":"temporary"}');
 perform set_config('pebble.location_dating_ref',dating_receipt->>'id',true);
 assert dating_receipt->>'id'<>home_receipt->>'id';
 assert public.save_dating_preferences(jsonb_build_object('expectedProfileRevision',0,'expectedSearchRevision',0,'profile',public.get_dating_preferences()->'profile','search',jsonb_build_object('ageMin',18,'ageMax',99,'radiusMiles',15,'searchArea',jsonb_build_object('source','temporary','areaLabel','Synthetic campus A','resolvedLocationRef',dating_receipt->>'id'))))->'profile'->>'enabled'='false';
 begin perform public.get_search_location_receipt('dating',(home_receipt->>'id')::uuid);raise exception 'Cross-mode receipt';exception when sqlstate 'PT404' then null;end;
 perform set_config('request.jwt.claim.sub',b::text,true);
 begin perform public.get_search_location_receipt('friends',(home_receipt->>'id')::uuid);raise exception 'Cross-owner receipt';exception when sqlstate 'PT404' then null;end;
 begin perform public.save_friends_search_preferences(jsonb_build_object('expectedRevision',0,'preferences',jsonb_build_object('ageMin',18,'ageMax',99,'radiusMiles',15,'goals','[]'::jsonb,'searchArea',jsonb_build_object('source','home','resolvedLocationRef',home_receipt->>'id'))));raise exception 'Cross-owner ref saved';exception when sqlstate '22023' then null;end;
 perform set_config('request.jwt.claim.sub',a::text,true);
 device:=jsonb_build_object('requestId','ad000000-0000-4000-8000-000000000003','mode','friends','latitude',0,'longitude',0,'accuracyMeters',20,'observedAt',to_char(statement_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'consent',true);
 perform set_config('pebble.location_device_payload',device::text,true);
 begin perform public.issue_browser_search_location(device);raise exception 'No device opt-in';exception when sqlstate 'LC403' then null;end;
end $$;
reset role;
update public.account_settings set settings=settings||'{"location":true}' where user_id='ab000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ declare device jsonb:=current_setting('pebble.location_device_payload')::jsonb;receipt jsonb;bad jsonb;payload jsonb;n int;begin
 perform set_config('request.jwt.claim.sub','ab000000-0000-4000-8000-000000000001',true);
 receipt:=public.issue_browser_search_location(device);
 perform set_config('pebble.location_device_ref',receipt->>'id',true);
 assert receipt->>'source'='temporary' and receipt->>'method'='device-reported' and receipt->>'usable'='true';
 assert public.issue_browser_search_location(device)=receipt;
 assert public.get_friends_search_preferences()->'preferences'->'searchArea'->>'resolvedLocationRef'=current_setting('pebble.location_home_ref'),'Issuance changed saved filters';
 assert public.get_dating_preferences()->'profile'->>'enabled'='false','Location activated Dating';
 begin perform public.issue_browser_search_location(device||'{"latitude":1}');raise exception 'Device key changed content';exception when sqlstate 'LC409' then null;end;
 foreach bad in array array[device||'{"actorId":"ab000000-0000-4000-8000-000000000002"}',device||'{"requestId":"ad000000-0000-4000-8000-000000000004","observedAt":"now"}',device||'{"requestId":"ad000000-0000-4000-8000-000000000004","accuracyMeters":1001}',device||'{"requestId":"ad000000-0000-4000-8000-000000000004","consent":false}',device||jsonb_build_object('requestId','ad000000-0000-4000-8000-000000000004','observedAt',to_char(statement_timestamp()-interval '6 minutes','YYYY-MM-DD"T"HH24:MI:SS.USOF'))] loop
  begin perform public.issue_browser_search_location(bad);raise exception 'Invalid device evidence accepted';exception when sqlstate '22023' then null;end;
 end loop;
 payload:='{"requestId":"ad000000-0000-4000-8000-000000000010","mode":"friends","source":"temporary","placeId":"ac000000-0000-4000-8000-000000000001"}';
 for n in 10..16 loop perform public.resolve_search_area(payload||jsonb_build_object('requestId','ad000000-0000-4000-8000-'||lpad(n::text,12,'0')));end loop;
 begin perform public.resolve_search_area(payload||'{"requestId":"ad000000-0000-4000-8000-000000000017"}');raise exception 'Issuance rate bypass';exception when sqlstate 'LC429' then null;end;
 assert public.issue_browser_search_location(device)=receipt,'Replay incorrectly rate limited';
end $$;
reset role;
do $$ begin
 assert (select count(*) from public.profiles p join location_profiles_before b on b.id=p.id where to_jsonb(p)=to_jsonb(b))=2,'Resolution changed shared profile';
 assert exists(select 1 from public.friends_search_location_refs where id=current_setting('pebble.location_device_ref')::uuid and latitude=0 and longitude=0),'Zero coordinates lost';
end $$;
-- Independently exercise the rolling daily cap with an empty hourly bucket.
update location_private.requests set created_at=statement_timestamp()-interval '2 hours' where actor_id='ab000000-0000-4000-8000-000000000001';
insert into location_private.requests(actor_id,request_id,fingerprint,mode,reference_id,created_at)
select r.actor_id,('ae000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,r.fingerprint,r.mode,r.reference_id,statement_timestamp()-interval '2 hours'
from location_private.requests r cross join generate_series(1,40) n where r.actor_id='ab000000-0000-4000-8000-000000000001' and r.request_id='ad000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
 perform set_config('request.jwt.claim.sub','ab000000-0000-4000-8000-000000000001',true);
 begin perform public.resolve_search_area('{"requestId":"ad000000-0000-4000-8000-000000000018","mode":"friends","source":"home","placeId":"ac000000-0000-4000-8000-000000000001"}');raise exception 'Daily limit bypass';exception when sqlstate 'LC429' then null;end;
 assert public.issue_browser_search_location(current_setting('pebble.location_device_payload')::jsonb)->>'id'=current_setting('pebble.location_device_ref'),'Daily cap blocked replay';
end $$;
reset role;
update public.account_settings set settings=settings||'{"location":false}' where user_id='ab000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
 perform set_config('request.jwt.claim.sub','ab000000-0000-4000-8000-000000000001',true);
 assert public.get_search_location_receipt('friends',current_setting('pebble.location_device_ref')::uuid)->>'usable'='false','Device opt-out ignored';
 assert public.get_search_location_receipt('friends',current_setting('pebble.location_home_ref')::uuid)->>'usable'='true','Device opt-out disabled geocoded home';
end $$;
reset role;
update public.account_settings set settings=settings||'{"location":true}' where user_id='ab000000-0000-4000-8000-000000000001';
update public.profiles set location_city='Changed synthetic home' where id='ab000000-0000-4000-8000-000000000001';
update location_private.assertions set issued_at=statement_timestamp()-interval '2 hours',expires_at=statement_timestamp()-interval '1 hour' where id=current_setting('pebble.location_device_ref')::uuid;
set local role authenticated;
do $$ declare saved jsonb;begin
 perform set_config('request.jwt.claim.sub','ab000000-0000-4000-8000-000000000001',true);
 assert public.get_search_location_receipt('friends',current_setting('pebble.location_home_ref')::uuid)->>'usable'='false','Home changed but proof usable';
 assert public.get_search_location_receipt('friends',current_setting('pebble.location_device_ref')::uuid)->>'usable'='false','Expired device proof usable';
 saved:=public.get_friends_search_preferences();
 begin perform public.save_friends_search_preferences(jsonb_build_object('expectedRevision',1,'preferences',(saved->'preferences')||jsonb_build_object('searchArea',jsonb_build_object('source','temporary','areaLabel','Current approximate location','resolvedLocationRef',current_setting('pebble.location_device_ref')))));raise exception 'Expired reference saved';exception when sqlstate 'LC409' then null;end;
 assert public.get_friends_search_preferences()=saved,'Rejected expiry changed revision';
 assert public.get_dating_preferences()->'eligibility'->>'locationResolved'='true','Temporary Dating depends on home';
end $$;
reset role;
update location_private.places set enabled=false where id='ac000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
 perform set_config('request.jwt.claim.sub','ab000000-0000-4000-8000-000000000001',true);
 assert public.get_search_location_receipt('dating',current_setting('pebble.location_dating_ref')::uuid)->>'usable'='false','Revoked catalogue proof usable';
 assert public.get_dating_preferences()->'eligibility'->>'locationResolved'='false','Dating ignored current proof';
 assert public.get_dating_preferences()->'profile'->>'enabled'='false';
end $$;
reset role;
do $$ declare r text;t text;begin
 foreach r in array array['anon','authenticated','pebble_location_catalog_publisher'] loop
  assert not has_schema_privilege(r::name,'location_private','USAGE');
  foreach t in array array['places','assertions','requests'] loop
   assert not has_table_privilege(r::name,'location_private.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');
   assert not has_any_column_privilege(r::name,'location_private.'||t,'SELECT,INSERT,UPDATE,REFERENCES');
  end loop;
 end loop;
end $$;
rollback;
