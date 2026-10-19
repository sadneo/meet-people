-- Real SQL acceptance; fresh reviewed social/safety/settings candidates required.
\set ON_ERROR_STOP on
begin isolation level read committed;
set local plpgsql.check_asserts=on;
do $$ begin
 if current_database()<>'pebble_safety_owner_disposable' or current_setting('pebble.safety_owner_test_target',true) is distinct from 'network-none-safety-owner-v1'
 or not exists(select 1 from public.safety_owner_disposable_marker where singleton and purpose='network-none-safety-owner-v1') then raise exception 'Wrong disposable'; end if;
 if exists(select 1 from auth.users where id in('da000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000002','da000000-0000-4000-8000-000000000003')) then raise exception 'Fixture occupied'; end if;
end $$;
insert into auth.users(id) values('da000000-0000-4000-8000-000000000001'),('da000000-0000-4000-8000-000000000002'),('da000000-0000-4000-8000-000000000003');
insert into public.profiles(id,username,display_name,birthdate,location_city) values
 ('da000000-0000-4000-8000-000000000001','social-fixture-a','Synthetic A','2000-01-01','Synthetic campus'),
 ('da000000-0000-4000-8000-000000000002','social-fixture-b','Synthetic B','2000-01-01','Synthetic campus'),
 ('da000000-0000-4000-8000-000000000003','social-fixture-c','Synthetic C','2000-01-01','Synthetic campus');
insert into public.account_settings(user_id,preferences,settings,completed) select id,'{"distance":"Nearby","group":"One-on-one","intents":["Activity partners"],"usual":[]}','{"notifications":false,"availability":false,"discoverable":true,"location":false}','[0,1,2,3]' from public.profiles where username like 'social-fixture-%';
insert into public.user_interests(profile_id,text) select p.id,x from public.profiles p cross join unnest(array['Art','Coffee','Music']) x where p.username like 'social-fixture-%';
insert into public.availability(profile_id,dow,start_time,end_time) select p.id,1,'12:00','17:00' from public.profiles p where p.username like 'social-fixture-%';
set local role authenticated;
do $$ declare a uuid:='da000000-0000-4000-8000-000000000001';b uuid:='da000000-0000-4000-8000-000000000002';c uuid:='da000000-0000-4000-8000-000000000003';chat uuid;msg jsonb;history jsonb;state jsonb;key uuid:='db000000-0000-4000-8000-000000000001';n bigint; begin
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.social_connection_list(); raise exception 'No JWT list accepted'; exception when sqlstate '28000' then null; end;
 perform set_config('request.jwt.claim.sub',a::text,true);
 assert public.social_connection(b,'get')->>'status'='none';
 assert public.social_connection(b,'request')->>'status'='sent';
 assert jsonb_array_length(public.social_connection_list()->'sent')=1;
 begin perform public.social_connection(b,'accept'); raise exception 'Self accept'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub',b::text,true);
 assert public.social_connection(a,'get')->>'status'='incoming';
 assert jsonb_array_length(public.social_connection_list()->'incoming')=1;
 state:=public.social_connection(a,'accept');assert state->>'status'='connected';chat:=(state->>'conversationId')::uuid;
 assert public.social_connection(a,'accept')=state;
 perform set_config('request.jwt.claim.sub',a::text,true);
 begin perform public.social_send(chat,E'\t\n',key); raise exception 'Whitespace-only message accepted'; exception when sqlstate '22023' then null; end;
 begin perform public.social_send(chat,repeat('🪨',1001),key); raise exception 'UTF16 message bound bypass'; exception when sqlstate '22023' then null; end;
 msg:=public.social_send(chat,'Exact synthetic history 🪨',key);
 assert public.social_send(chat,'Exact synthetic history 🪨',key)=msg;
 begin perform public.social_send(chat,'Changed',key); raise exception 'Key collision accepted'; exception when sqlstate 'SC409' then null; end;
 n:=(msg->>'seq')::bigint;
 assert msg->>'sender_id'=a::text and msg->>'conversation_id'=chat::text;
 perform set_config('request.jwt.claim.sub',c::text,true);
 begin perform public.social_history(chat); raise exception 'Foreign history'; exception when insufficient_privilege then null; end;
 begin perform public.social_send(chat,'Forbidden',key); raise exception 'Foreign send'; exception when insufficient_privilege then null; end;
 begin perform public.social_read(chat,n); raise exception 'Foreign receipt'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub',b::text,true);
 assert public.social_activity()->>'unreadConversations'='1';
 assert public.social_read(chat,n)->>'lastReadSeq'=n::text;
 assert public.social_read(chat,0)->>'lastReadSeq'=n::text;
 assert public.social_activity()->>'unreadConversations'='0';
 assert public.social_history(chat)->'messages'->0=msg;
 assert public.social_history(chat,n,null)->'messages'='[]';
 assert public.social_history(chat,null,n)->'messages'='[]';
 perform public.block_owner_target(a);
 history:=public.social_history(chat);
 assert history->>'canSend'='false' and history->'messages'->0=msg;
 assert history->'participants'->0->>'display_name'='Account '||a::text;
 assert jsonb_array_length(public.social_inbox(1)->'conversations')=1;
 assert public.social_inbox(1)->'conversations'->0->>'unread_count'='0';
 assert public.social_connection_list()='{"incoming":[],"sent":[],"connected":[]}'::jsonb;
 begin perform public.social_send(chat,'Blocked',key); raise exception 'Blocked send'; exception when insufficient_privilege then null; end;
 begin perform public.social_read(chat,n); raise exception 'Blocked read'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub',a::text,true);
 begin perform public.social_send(chat,'Reverse blocked',key); raise exception 'Reverse blocked send'; exception when insufficient_privilege then null; end;
 begin perform public.social_connection(b,'request'); raise exception 'Reverse blocked request'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub',b::text,true);perform public.unblock_owner_target(a);
 assert public.social_history(chat)->>'canSend'='false';
 begin perform public.social_send(chat,'Unblock cannot resurrect',key); raise exception 'Resurrected'; exception when insufficient_privilege then null; end;
 assert public.social_history(chat)->'messages'->0=msg;
end $$;
reset role;
-- A completed marker cannot bypass actual readiness/adult eligibility.
update public.profiles set birthdate='infinity' where id='da000000-0000-4000-8000-000000000003';
set local role authenticated;
do $$ begin
 perform set_config('request.jwt.claim.sub','da000000-0000-4000-8000-000000000001',true);
 begin perform public.social_connection('da000000-0000-4000-8000-000000000003','request'); raise exception 'Infinite DOB admitted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.profiles set birthdate='2000-01-01' where id='da000000-0000-4000-8000-000000000003';
delete from public.user_interests where profile_id='da000000-0000-4000-8000-000000000003' and text='Coffee';
set local role authenticated;
do $$ begin
 perform set_config('request.jwt.claim.sub','da000000-0000-4000-8000-000000000001',true);
 begin perform public.social_connection('da000000-0000-4000-8000-000000000003','request'); raise exception 'Incomplete interests admitted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
insert into public.user_interests(profile_id,text) values('da000000-0000-4000-8000-000000000003','Coffee');
set local role authenticated;
do $$ declare chat uuid; begin
 perform set_config('request.jwt.claim.sub','da000000-0000-4000-8000-000000000001',true);
 perform public.social_connection('da000000-0000-4000-8000-000000000003','request');
 perform set_config('request.jwt.claim.sub','da000000-0000-4000-8000-000000000003',true);
 chat:=(public.social_connection('da000000-0000-4000-8000-000000000001','accept')->>'conversationId')::uuid;
 perform set_config('pebble.social_test_chat',chat::text,true);
 perform set_config('request.jwt.claim.sub','da000000-0000-4000-8000-000000000001',true);
 begin perform public.social_send(chat,'Exact synthetic history 🪨','db000000-0000-4000-8000-000000000001'); raise exception 'Cross-chat request key reused'; exception when sqlstate 'SC409' then null; end;
 perform public.social_send(chat,'Inactive contact history','db000000-0000-4000-8000-000000000002');
end $$;
reset role;
update public.profiles set is_active=false where id='da000000-0000-4000-8000-000000000003';
set local role authenticated;
do $$ declare chat uuid:=current_setting('pebble.social_test_chat')::uuid; begin
 perform set_config('request.jwt.claim.sub','da000000-0000-4000-8000-000000000001',true);
 assert public.social_history(chat)->>'canSend'='false';
 assert public.social_history(chat)->'messages'->0->>'body'='Inactive contact history';
 begin perform public.social_send(chat,'Inactive denied','db000000-0000-4000-8000-000000000003'); raise exception 'Inactive contact admitted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ declare r text;t text; begin
 foreach r in array array['anon','authenticated'] loop
  assert not has_schema_privilege(r::name,'social_private','USAGE');
  foreach t in array array['conversations','messages','read_states','send_requests'] loop
   assert not has_table_privilege(r::name,'social_private.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');
   assert not has_any_column_privilege(r::name,'social_private.'||t,'SELECT,INSERT,UPDATE,REFERENCES');
  end loop;
 end loop;
 assert not has_function_privilege('anon','public.social_history(uuid,bigint,bigint)','EXECUTE');
 assert (select count(*) from public.messages m join social_private.messages x on x.legacy_id=m.id where m.body='Exact synthetic history 🪨')=1;
end $$;
rollback;
