-- Roll back all fixtures, including the offline interest-enrichment stub.
begin;
set local plpgsql.check_asserts=on;
create or replace function public.get_gemini_embedding(interest_text text)
returns double precision[] language plpgsql as $$ begin raise exception 'Offline test'; end $$;

insert into auth.users(id,email_confirmed_at,is_anonymous)
values('f9700000-0000-4000-8000-000000000001',now(),false);
set local role authenticated;
select set_config('request.jwt.claim.sub','f9700000-0000-4000-8000-000000000001',true);
do $$
declare account jsonb := public.get_account();
begin
 assert account->'completed'='[]'::jsonb;
 account:=jsonb_set(account,'{profile}','{"username":"onboarding-test","display_name":"Onboarding test","bio":null,"birthdate":"2000-01-01","location_city":null,"avatar_url":null,"interests":[],"availability":[]}');
 account:=public.save_account(jsonb_set(account,'{completed}','[0]') || '{"initialTimeZone":"America/New_York"}');
 assert account->'completed'='[0,1,2,3]'::jsonb;
 assert public.get_matching_scoring_settings() = '{"revision":1,"timeZone":"America/New_York","showAvailability":false}'::jsonb;
 perform public.save_account(account || '{"initialTimeZone":"Pacific/Honolulu"}');
 assert public.get_matching_scoring_settings()->>'timeZone'='America/New_York';
 assert account->'profile'->'location_city'='null'::jsonb;
 assert public.get_friends_discovery_status()->>'reason'='profile';
 assert public.get_dating_runtime()->>'datingDiscovery'='true';
 assert public.get_dating_runtime()->'aggregate'->'profile'->>'enabled'='false';
 assert public.get_progressive_matching_setup()=
  '{"profileReady":false,"friendsAreaReady":false,"groupScheduleReady":false}'::jsonb;
 begin
  perform public.start_friends_discovery();
  raise exception 'Friends started without setup';
 exception when sqlstate 'FR409' then null;
 end;
 perform public.save_account(jsonb_set(account,'{profile,interests}','["Coffee"]'));
 assert public.get_progressive_matching_setup()->>'profileReady'='false';
end $$;
reset role;

set local role pebble_location_catalog_publisher;
select public.publish_search_location_place(jsonb_build_object(
 'id','f9710000-0000-4000-8000-000000000001','label','Synthetic town','region','Synthetic',
 'aliases','["Synthetic town"]'::jsonb,'latitude',40.7,'longitude',-73.9,
 'provenance','Disposable progressive onboarding fixture',
 'verifiedUntil',to_char(statement_timestamp()+interval '2 days','YYYY-MM-DD"T"HH24:MI:SS.USOF'),'enabled',true));
reset role;

insert into public.listings(id,title,source,external_id,listing_type,status,starts_at)
values('f9750000-0000-4000-8000-000000000001','Matching test event','test','progressive-onboarding','event','active',now()+interval '1 day');
update active_friends_private.policy set enabled=true;

set local role authenticated;
do $$
declare friends_ref text; dating_ref text; dating jsonb; profile jsonb; revision jsonb;
 event_id constant uuid := 'f9750000-0000-4000-8000-000000000001';
 group_command constant jsonb := '{"action":"join","requestId":"f9760000-0000-4000-8000-000000000001","data":{"preferredNewFriends":2,"minimumGroupSize":2,"maximumGroupSize":3,"allowExistingGroups":false}}';
begin
 begin
  perform public.join_event_group_queue(event_id);
  raise exception 'Event matching started without a photo and search area';
 exception when sqlstate 'PT409' then null;
 end;
 perform public.save_profile_photo(jsonb_build_object('expectedRevision',0,
  'requestId','f9720000-0000-4000-8000-000000000001',
  'jpegBase64','/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdAB//2Q=='));
 assert public.get_progressive_matching_setup()->>'profileReady'='true';
 friends_ref:=public.resolve_search_area('{"requestId":"f9730000-0000-4000-8000-000000000001","mode":"friends","source":"temporary","placeId":"f9710000-0000-4000-8000-000000000001"}')->>'id';
 perform public.save_friends_search_preferences(jsonb_build_object('expectedRevision',0,'deferDiscovery',true,'preferences',
  jsonb_build_object('ageMin',18,'ageMax',99,'radiusMiles',15,'goals','[]'::jsonb,'searchArea',
   jsonb_build_object('source','temporary','areaLabel','Synthetic town','resolvedLocationRef',friends_ref))));
 assert public.get_progressive_matching_setup()=
  '{"profileReady":true,"friendsAreaReady":true,"groupScheduleReady":false}'::jsonb;
 assert public.get_friends_discovery_status()->>'reason'='preferences';
 assert public.join_event_group_queue(event_id)->>'state'='waiting';
 assert public.leave_event_group_queue(event_id)->>'state'='idle';
 assert public.get_friends_discovery_status()->>'reason'='preferences';
 begin
  perform public.active_friends_command(group_command);
  raise exception 'Group matching started without availability';
 exception when sqlstate 'AF409' then null;
 end;
 -- The previous Android client saves its area without the defer flag.
 begin
  perform public.save_friends_search_preferences(jsonb_build_object(
   'expectedRevision',public.get_friends_search_preferences()->'revision',
   'preferences',public.get_friends_search_preferences()->'preferences'));
  assert public.get_friends_discovery_status()->>'eligible'='true', 'Legacy Friends save no longer starts discovery';
  raise exception 'Rollback compatibility check' using errcode='Z0001';
 exception when sqlstate 'Z0001' then null;
 end;
 assert public.start_friends_discovery()->>'eligible'='true';
 assert public.start_friends_discovery()->>'eligible'='true';
 assert public.get_dating_runtime()->'aggregate'->'profile'->>'enabled'='false';

 dating_ref:=public.resolve_search_area('{"requestId":"f9740000-0000-4000-8000-000000000001","mode":"dating","source":"temporary","placeId":"f9710000-0000-4000-8000-000000000001"}')->>'id';
 assert dating_ref<>friends_ref;
 dating:=public.get_dating_preferences();
 profile:=(dating->'profile')||'{"gender":"Man","sexuality":"Straight","intent":"Long-term relationship","style":"Monogamy"}';
 revision:=public.save_dating_preferences(jsonb_build_object('expectedProfileRevision',dating->'profileRevision',
  'expectedSearchRevision',dating->'searchRevision','profile',profile,'search',
  jsonb_build_object('ageMin',18,'ageMax',99,'radiusMiles',15,'searchArea',
   jsonb_build_object('source','temporary','areaLabel','Synthetic town','resolvedLocationRef',dating_ref))));
 assert public.get_dating_runtime()->>'canStart'='true';
 assert public.set_dating_enabled(jsonb_build_object('expectedProfileRevision',revision->'profileRevision',
  'expectedSearchRevision',revision->'searchRevision','enabled',true))->'aggregate'->>'effectiveEnabled'='true';

 assert public.get_progressive_matching_setup()->>'groupScheduleReady'='false';
 perform public.save_account(jsonb_set(public.get_account(),'{profile,availability}',
  '[{"dow":6,"start_time":"23:40:00","end_time":"24:00:00"},{"dow":0,"start_time":"00:00:00","end_time":"00:40:00"}]'));
 assert public.get_progressive_matching_setup()->>'groupScheduleReady'='true';
 assert public.active_friends_command(group_command)->>'state'='queued', 'Group did not start with a confirmed weekly window';
 assert public.active_friends_command('{"action":"cancel","requestId":"f9760000-0000-4000-8000-000000000002","data":{}}')->>'state'='cancelled', 'Group cancellation was not confirmed';

 -- A saved opt-out is honored even with a complete profile.
 perform public.save_detailed_settings('{"expectedRevision":0,"settings":{"messages":false,"plans":false,"matches":false,"friendsDiscovery":false,"datingDiscovery":false}}');
 assert public.get_friends_discovery_status()->>'reason'='discovery_off';
 assert public.get_dating_runtime()->>'canStart'='false';
 perform public.save_profile_photo('{"expectedRevision":1,"requestId":"f9720000-0000-4000-8000-000000000002","jpegBase64":null}');
 assert public.get_progressive_matching_setup()->>'profileReady'='false';
end $$;
reset role;
do $$ begin
 assert not has_function_privilege('anon','public.get_progressive_matching_setup()','EXECUTE');
 assert not has_function_privilege('anon','public.start_friends_discovery()','EXECUTE');
end $$;
rollback;
