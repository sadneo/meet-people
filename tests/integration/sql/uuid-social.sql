-- Run ONLY in the empty schema-only pebble_uuid_check_* database. Synthetic
-- Auth/profile rows and all mutations are rolled back. No provider calls.
\set ON_ERROR_STOP on
begin;
set local statement_timeout='30s';
do $$ begin
 if current_database() not like 'pebble_uuid_check_%' then raise exception 'Disposable database required';end if;
 if exists(select 1 from auth.users) then raise exception 'Empty synthetic Auth fixture required';end if;
end $$;
insert into auth.users(id,email,aud,role,is_anonymous) values
 ('d7100000-0000-4000-8000-000000000001','uuid-one@example.test','authenticated','authenticated',false),
 ('d7100000-0000-4000-8000-000000000002','uuid-two@example.test','authenticated','authenticated',false),
 ('d7100000-0000-4000-8000-000000000003','uuid-outsider@example.test','authenticated','authenticated',false);
set local role authenticated;
do $$ declare actor uuid; chapter integer; account jsonb; saved jsonb;begin
 foreach actor in array array['d7100000-0000-4000-8000-000000000001'::uuid,'d7100000-0000-4000-8000-000000000002'::uuid] loop
  perform set_config('request.jwt.claim.sub',actor::text,true);
  account:=public.get_account();
  account:=jsonb_set(account,'{settings}','{"notifications":false,"availability":false,"discoverable":true,"location":false}');
  account:=jsonb_set(account,'{profile}',jsonb_build_object('username','uuid_'||replace(actor::text,'-',''),'display_name','Synthetic UUID Account','bio','Disposable integration fixture','avatar_url',null,'birthdate',null,'location_city',null,'interests','[]'::jsonb,'availability','[]'::jsonb));
  for chapter in 0..3 loop
   if chapter=1 then account:=jsonb_set(account,'{profile,interests}','["Music","Coffee","Art"]');end if;
   if chapter=2 then account:=jsonb_set(account,'{preferences,intents}','["Meet new people"]');end if;
   if chapter=3 then
    account:=jsonb_set(account,'{profile,birthdate}','"2000-01-01"');
    account:=jsonb_set(account,'{profile,location_city}','"Synthetic campus"');
    account:=jsonb_set(account,'{profile,availability}','[{"dow":1,"start_time":"12:00:00","end_time":"17:00:00"}]');
    account:=jsonb_set(account,'{preferences,distance}','"Nearby"');
    account:=jsonb_set(account,'{preferences,group}','"Either"');
   end if;
   account:=jsonb_set(account,'{completed}',(select jsonb_agg(value) from generate_series(0,chapter) value));
   saved:=public.save_account(account);
   assert jsonb_array_length(saved->'completed')=chapter+1,'Onboarding chapter not saved';
   assert saved=public.get_account(),'Account readback mismatch';
   account:=saved;
  end loop;
  perform public.save_profile_details('{"expectedRevision":0,"facts":{"education":"Synthetic student","occupation":"","languages":["English"],"visibility":{"education":true,"occupation":false,"languages":true}}}');
  assert public.get_profile_details()->>'revision'='1','Profile facts not persisted';
  perform public.save_detailed_settings('{"expectedRevision":0,"settings":{"messages":false,"plans":false,"matches":false,"friendsDiscovery":true,"datingDiscovery":false}}');
  assert public.get_detailed_settings()->>'revision'='1','Detailed settings not persisted';
  assert public.get_friends_runtime()->>'available'='true','Friends capability missing';
  assert public.get_dating_runtime()->>'available'='true','Dating capability missing';
  perform public.get_profile_photo_state();
  perform public.get_friends_search_preferences();
  perform public.get_dating_preferences();
  perform public.search_location_places('Synthetic');
  assert public.get_owner_blocklist()->'blocks'='[]'::jsonb,'Unexpected block fixture';
 end loop;
end $$;
do $$ declare a uuid:='d7100000-0000-4000-8000-000000000001'; b uuid:='d7100000-0000-4000-8000-000000000002'; outsider uuid:='d7100000-0000-4000-8000-000000000003';state jsonb;chat uuid;message jsonb;again jsonb;history jsonb;request_key uuid:='d7200000-0000-4000-8000-000000000001';begin
 perform set_config('request.jwt.claim.sub',a::text,true);
 state:=public.social_connection(b,'request');assert state->>'status'='sent','Connection request failed';
 perform set_config('request.jwt.claim.sub',b::text,true);
 assert jsonb_array_length(public.social_connection_list()->'incoming')=1,'Incoming request missing';
 state:=public.social_connection(a,'accept');assert state->>'status'='connected','Acceptance failed';
 chat:=(state->>'conversationId')::uuid;assert chat is not null,'Native conversation not returned';
 perform set_config('request.jwt.claim.sub',a::text,true);
 message:=public.social_send(chat,'Synthetic UUID message',request_key);
 again:=public.social_send(chat,'Synthetic UUID message',request_key);
 assert message=again,'Idempotent retry changed message';
 assert message->>'conversation_id'=chat::text and message->>'seq'='1','Native sequence/ID not preserved';
 begin perform public.social_send(chat,'Different retry content',request_key);raise exception 'Expected conflict';exception when sqlstate 'SC409' then null;end;
 perform set_config('request.jwt.claim.sub',b::text,true);
 assert public.social_activity()->>'unreadConversations'='1','Unread count missing';
 history:=public.social_history(chat);assert jsonb_array_length(history->'messages')=1,'History missing';
 assert history->>'canSend'='true','Connected direct chat not sendable';
 assert public.social_read(chat,1)->>'lastReadSeq'='1','Native read position missing';
 assert public.social_activity()->>'unreadConversations'='0','Read state not persisted';
 assert jsonb_array_length(public.social_inbox()->'conversations')=1,'Inbox missing native chat';
 perform set_config('request.jwt.claim.sub',outsider::text,true);
 begin perform public.social_history(chat);raise exception 'Outsider history accepted';exception when sqlstate 'MSG03' or insufficient_privilege then null;end;
 begin perform public.social_send(chat,'Forged sender','d7200000-0000-4000-8000-000000000002');raise exception 'Outsider send accepted';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',b::text,true);
 perform public.block_owner_target(a);
 perform set_config('request.jwt.claim.sub',a::text,true);
 assert public.social_connection(b,'get')->>'status'='none','Blocked connection exposed';
 assert public.social_history(chat)->>'canSend'='false','Blocked chat send allowed';
 begin perform public.social_send(chat,'Blocked send','d7200000-0000-4000-8000-000000000003');raise exception 'Blocked send accepted';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',b::text,true);
 perform public.unblock_owner_target(a);
 perform set_config('request.jwt.claim.sub',a::text,true);
 begin perform public.social_send(chat,'Unblock restored contact','d7200000-0000-4000-8000-000000000004');raise exception 'Quarantined contact restored';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$ declare signature text;begin
 foreach signature in array array['public.social_connection(uuid,text)','public.social_inbox(integer)','public.social_history(uuid,bigint,bigint)','public.social_send(uuid,text,uuid)','public.social_read(uuid,bigint)','public.social_activity()'] loop
  assert not has_function_privilege('anon',signature,'EXECUTE'),'Anonymous actor RPC access';
  assert has_function_privilege('authenticated',signature,'EXECUTE'),'Authenticated actor RPC unavailable';
 end loop;
 assert not has_function_privilege('authenticated','public.messaging_send(uuid,uuid,text,uuid)','EXECUTE'),'Raw actor-selection bypass';
 assert not has_table_privilege('authenticated','public.messages','INSERT,UPDATE,DELETE'),'Direct message write bypass';
 assert not has_schema_privilege('authenticated','social_private','USAGE'),'Private helper bypass';
 assert (select count(*)=1 from public.messages),'Retry created duplicate messages';
 assert (select count(*)=1 from public.conversations),'Duplicate conversation';
end $$;
rollback;
select 'PASS synthetic native UUID onboarding, profile/settings, capability reads, request/accept, inbox/history, idempotent send, read position, outsider/anonymous denial and block/unblock quarantine';
