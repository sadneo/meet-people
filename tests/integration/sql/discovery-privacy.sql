-- Real PostgreSQL acceptance. Use only the guarded network-none disposable.
\set ON_ERROR_STOP on
begin isolation level read committed;
set local plpgsql.check_asserts=on;
do $$ begin
 if current_database()<>'pebble_safety_owner_disposable' or current_setting('pebble.safety_owner_test_target',true) is distinct from 'network-none-safety-owner-v1'
 or not exists(select 1 from public.safety_owner_disposable_marker where singleton and purpose='network-none-safety-owner-v1') then raise exception 'Wrong disposable'; end if;
 if exists(select 1 from auth.users where id in('fa000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000002','fa000000-0000-4000-8000-000000000003')) or exists(select 1 from pg_catalog.pg_roles where rolname='privacy_inherited_fixture') then raise exception 'Fixture occupied'; end if;
end $$;
create temporary table privacy_candidate(line_number bigint generated always as identity,line text not null);
\copy privacy_candidate(line) from 'supabase/schema-sources/discovery-privacy-migration.sql' with (format csv,delimiter E'\x01',quote E'\x02',escape E'\x02',null E'\x03')
create role privacy_inherited_fixture nologin nosuperuser nobypassrls;
do $$ declare candidate text;role_in text;seq text;t text;privilege_in text;failure text;before_acl aclitem[];begin
 select string_agg(line,E'\n' order by line_number) into candidate from privacy_candidate where lower(btrim(line)) not in('begin;','commit;');
 foreach role_in in array array['anon','authenticated'] loop
  execute format('grant privacy_inherited_fixture to %I with inherit true',role_in);
  execute 'grant select(birthdate) on public.profiles to privacy_inherited_fixture';
  select relacl into before_acl from pg_catalog.pg_class where oid='public.profiles'::regclass;
  begin execute candidate;raise exception 'Inherited private column accepted';
  exception when insufficient_privilege then get stacked diagnostics failure=message_text;assert failure='Inherited raw privacy bypass: '||role_in||' profiles',failure;end;
  assert (select relacl is not distinct from before_acl from pg_catalog.pg_class where oid='public.profiles'::regclass);
  assert has_column_privilege(role_in::name,'public.profiles','birthdate','SELECT');
  revoke select(birthdate) on public.profiles from privacy_inherited_fixture;
  foreach t in array array['user_interests','availability','meetups','interaction_outcomes'] loop
   seq:=pg_get_serial_sequence('public.'||t,'id');
   foreach privilege_in in array array['SELECT','USAGE','UPDATE'] loop
    execute format('grant %s on sequence %s to privacy_inherited_fixture',privilege_in,seq);
    begin execute candidate;raise exception 'Inherited privacy sequence accepted';
    exception when insufficient_privilege then get stacked diagnostics failure=message_text;assert failure='Inherited privacy sequence bypass: '||role_in||' '||seq,failure;end;
    assert has_sequence_privilege(role_in::name,seq,privilege_in);
    execute format('revoke %s on sequence %s from privacy_inherited_fixture',privilege_in,seq);
   end loop;
  end loop;
  execute format('revoke privacy_inherited_fixture from %I',role_in);
 end loop;
end $$;
drop role privacy_inherited_fixture;
insert into auth.users values('fa000000-0000-4000-8000-000000000001'),('fa000000-0000-4000-8000-000000000002'),('fa000000-0000-4000-8000-000000000003');
insert into public.profiles(id,username,display_name,birthdate,location_city) values
 ('fa000000-0000-4000-8000-000000000001','privacy-fixture-a','Synthetic privacy A','2000-01-01','Synthetic campus'),
 ('fa000000-0000-4000-8000-000000000002','privacy-fixture-b','Synthetic privacy B','2000-01-01','Synthetic campus'),
 ('fa000000-0000-4000-8000-000000000003','privacy-fixture-c','Synthetic privacy C','2000-01-01','Synthetic campus');
insert into public.account_settings(user_id,preferences,settings,completed) select id,'{"distance":"Nearby","group":"One-on-one","intents":["Activity partners"],"usual":[]}','{"notifications":false,"availability":false,"discoverable":true,"location":false}','[0,1,2,3]' from public.profiles where username like 'privacy-fixture-%';
insert into public.user_interests(profile_id,text) select p.id,x from public.profiles p cross join unnest(array['Art','Coffee','Music']) x where p.username like 'privacy-fixture-%';
insert into public.availability(profile_id,dow,start_time,end_time) select p.id,1,'12:00','17:00' from public.profiles p where p.username like 'privacy-fixture-%';
insert into public.meetups(host_id,title,starts_at,is_public) values('fa000000-0000-4000-8000-000000000002','Synthetic public event',statement_timestamp()+interval '1 day',true);
select set_config('pebble.privacy_event_id',(select id::text from public.meetups where title='Synthetic public event'),true);
set local role authenticated;
create temporary table queue_entries(profile_id uuid primary key,queue_type text,joined_at timestamptz);
insert into queue_entries(profile_id,queue_type) values('fa000000-0000-4000-8000-000000000001','dating');
create temporary table event_interest(meetup_id bigint,profile_id uuid,note text,primary key(meetup_id,profile_id));
insert into event_interest values(999,'fa000000-0000-4000-8000-000000000002','shadow row');
do $$ declare a uuid:='fa000000-0000-4000-8000-000000000001';b uuid:='fa000000-0000-4000-8000-000000000002';n int;status_in record;chat uuid;begin
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.get_queue_status();raise exception 'No JWT status';exception when sqlstate '28000' then null;end;
 begin perform public.search_people('Synthetic');raise exception 'No JWT search';exception when sqlstate '28000' then null;end;
 perform set_config('request.jwt.claim.sub',a::text,true);
 begin perform birthdate from public.profiles;raise exception 'Raw DOB exposed';exception when insufficient_privilege then null;end;
 begin perform * from public.user_interests;raise exception 'Raw interests exposed';exception when insufficient_privilege then null;end;
 begin perform public.shared_interest_labels(a,b);raise exception 'Arbitrary pair labels exposed';exception when insufficient_privilege then null;end;
 select count(*) into n from public.search_people('privacy B');assert n=0,'Unknown Friends consent admitted';
 begin perform public.join_queue('matchmaking');raise exception 'Unknown Friends consent queued';exception when sqlstate 'PF409' then null;end;
 perform public.save_detailed_settings('{"expectedRevision":0,"settings":{"messages":false,"plans":false,"matches":false,"friendsDiscovery":true,"datingDiscovery":false}}');
 perform set_config('request.jwt.claim.sub',b::text,true);
 perform public.save_detailed_settings('{"expectedRevision":0,"settings":{"messages":false,"plans":false,"matches":false,"friendsDiscovery":true,"datingDiscovery":false}}');
 perform set_config('request.jwt.claim.sub',a::text,true);
 select count(*) into n from public.search_people('privacy B');assert n=1,'Consenting search missing';
 perform public.social_connection(b,'request');
 perform set_config('request.jwt.claim.sub',b::text,true);
 chat:=(public.social_connection(a,'accept')->>'conversationId')::uuid;
 perform set_config('pebble.privacy_chat',chat::text,true);
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform public.social_send(chat,'Preserved privacy history','fb000000-0000-4000-8000-000000000001');
 assert public.social_history(chat)->'participants'->1->>'display_name'='Synthetic privacy B';
 perform public.join_queue('downtime');perform public.join_queue('matchmaking');
 select * into status_in from public.get_queue_status();assert status_in.my_queue='matchmaking' and status_in.others_in_my_queue is null;
 assert (select queue_type='dating' from pg_temp.queue_entries where profile_id=a),'Definer wrote shadow queue';
 perform public.leave_queue();select * into status_in from public.get_queue_status();assert status_in.my_queue is null;
 begin perform public.join_queue('dating');raise exception 'Legacy Dating queue admitted';exception when insufficient_privilege then null;end;
 select count(*) into n from public.get_events_with_interest(null,null,30);assert n=1,'Consenting host event missing';
 perform public.express_event_interest(current_setting('pebble.privacy_event_id')::bigint,null);
 perform set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000003',true);
 perform public.express_event_interest(current_setting('pebble.privacy_event_id')::bigint,null);
 perform set_config('request.jwt.claim.sub',a::text,true);
 select interested_count into n from public.get_events_with_interest(null,null,30);assert n=2,'Event reader used a shadow relation';
 assert (select count(*)=1 from pg_temp.event_interest),'Definer wrote shadow interest';
 perform set_config('request.jwt.claim.sub',b::text,true);perform public.block_owner_target(a);
 perform set_config('request.jwt.claim.sub',a::text,true);
 select count(*) into n from public.search_people('privacy B');assert n=0,'Reverse block search bypass';
 select count(*) into n from public.get_events_with_interest(null,null,30);assert n=0,'Reverse block host-event bypass';
 begin perform public.express_event_interest(current_setting('pebble.privacy_event_id')::bigint,'Denied');raise exception 'Blocked hosted event admission';exception when insufficient_privilege then null;end;
 select count(*) into n from public.get_event_matches(current_setting('pebble.privacy_event_id')::bigint);assert n=0,'Blocked event people exposed';
 assert public.social_history(chat)->'participants'->1->>'display_name'='Account '||b::text;
 assert public.social_history(chat)->'messages'->0->>'body'='Preserved privacy history';
 perform set_config('request.jwt.claim.sub',b::text,true);perform public.unblock_owner_target(a);
 perform set_config('request.jwt.claim.sub',a::text,true);
 assert public.social_history(chat)->'participants'->1->>'display_name'='Account '||b::text,'Unblock exposed unapproved live metadata';
 perform public.social_connection('fa000000-0000-4000-8000-000000000003','request');
 -- Canonical owner facts remain readable despite raw table withdrawal.
 assert public.get_profile_details()->>'revision'='0';
end $$;
reset role;
update public.account_settings set settings=settings||'{"discoverable":false}' where user_id='fa000000-0000-4000-8000-000000000003';
set local role authenticated;
do $$ begin
 perform set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000001',true);
 assert public.social_connection_list()->'sent'='[]','Hidden pending peer metadata exposed';
end $$;
reset role;
do $$ declare r text;t text;seq text;begin
 foreach r in array array['anon','authenticated'] loop
  foreach t in array array['profiles','user_interests','availability','queue_entries','event_interest','meetup_attendees','interaction_outcomes','meetups'] loop
   assert not has_table_privilege(r::name,'public.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');
   assert not has_any_column_privilege(r::name,'public.'||t,'SELECT,INSERT,UPDATE,REFERENCES');
  end loop;
  foreach t in array array['user_interests','availability','meetups','interaction_outcomes'] loop
   seq:=pg_get_serial_sequence('public.'||t,'id');assert not has_sequence_privilege(r::name,seq,'SELECT,USAGE,UPDATE');
  end loop;
  assert not has_function_privilege(r::name,'public.get_queue_match()','EXECUTE');
 end loop;
 assert (select note is null from public.event_interest where profile_id='fa000000-0000-4000-8000-000000000001' and meetup_id=current_setting('pebble.privacy_event_id')::bigint);
end $$;
rollback;
