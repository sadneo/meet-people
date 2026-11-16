-- Runs in the disposable native and legacy schema replay databases only.
begin;
insert into auth.users(id, email, is_anonymous) values
 ('ce000000-0000-4000-8000-000000000001','typing-a@example.test',false),
 ('ce000000-0000-4000-8000-000000000002','typing-b@example.test',false),
 ('ce000000-0000-4000-8000-000000000003','typing-c@example.test',false);
insert into public.profiles(id,username,display_name,birthdate,location_city) values
 ('ce000000-0000-4000-8000-000000000001','typing-test-a','Typing A','2000-01-01','Synthetic campus'),
 ('ce000000-0000-4000-8000-000000000002','typing-test-b','Typing B','2000-01-01','Synthetic campus'),
 ('ce000000-0000-4000-8000-000000000003','typing-test-c','Typing C','2000-01-01','Synthetic campus');
insert into public.account_settings(user_id,preferences,settings,completed)
 select id,'{"distance":"Nearby","group":"Either","intents":["Meet new people"],"usual":[]}',
 '{"notifications":false,"availability":false,"discoverable":true,"location":false}','[0,1,2,3]'
 from public.profiles where username like 'typing-test-%';
insert into public.user_interests(profile_id,text)
 select p.id,label from public.profiles p cross join unnest(array['Art','Coffee','Music']) label where username like 'typing-test-%';
insert into public.availability(profile_id,dow,start_time,end_time)
 select id,1,'12:00','17:00' from public.profiles where username like 'typing-test-%';
do $$
declare a uuid := 'ce000000-0000-4000-8000-000000000001';
 b uuid := 'ce000000-0000-4000-8000-000000000002';
 c uuid := 'ce000000-0000-4000-8000-000000000003';
 chat uuid; target_group uuid := gen_random_uuid();
begin
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform public.social_connection(b,'request');
 perform set_config('request.jwt.claim.sub',b::text,true);
 chat := (public.social_connection(a,'accept')->>'conversationId')::uuid;
 delete from realtime.messages;
 perform set_config('request.jwt.claim.sub',a::text,true);
 assert public.messaging_typing(chat,false,true) = '{"ok":true}'::jsonb;
 assert (select count(*) = 1 from realtime.messages), 'Typing must notify only the other member';
 assert exists(select 1 from realtime.messages where topic='messaging:'||b::text and private and event='typing'
   and payload-'id'=jsonb_build_object('conversationId',chat,'userId',a,'isGroup',false,'typing',true)), 'Incorrect typing payload';
 delete from realtime.messages;
 perform public.messaging_typing(chat,false,false);
 assert exists(select 1 from realtime.messages where payload->>'typing'='false'), 'Stop typing not delivered';
 perform set_config('request.jwt.claim.sub',c::text,true);
 begin perform public.messaging_typing(chat,false,true); raise exception 'Outsider typing accepted'; exception when insufficient_privilege or sqlstate 'MSG03' then null; end;

 insert into active_friends_private.groups(id,target_size) values(target_group,3);
 insert into active_friends_private.group_members(group_id,user_id,maximum_size) values(target_group,a,3),(target_group,b,3),(target_group,c,3);
 delete from realtime.messages;
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform public.messaging_typing(target_group,true,true);
 assert (select count(*)=2 from realtime.messages), 'Group typing missing';
 perform public.block_owner_target(b);
 delete from realtime.messages;
 begin perform public.messaging_typing(chat,false,true); raise exception 'Blocked typing accepted'; exception when insufficient_privilege or sqlstate 'MSG03' then null; end;
 perform public.messaging_typing(target_group,true,true);
 assert (select count(*)=1 from realtime.messages where topic='messaging:'||c::text), 'Group peer did not receive typing';
 assert not exists(select 1 from realtime.messages where topic='messaging:'||b::text), 'Blocked member received typing';
 update active_friends_private.group_members set left_at=now() where group_id=target_group and user_id=c;
 perform set_config('request.jwt.claim.sub',c::text,true);
 begin perform public.messaging_typing(target_group,true,true); raise exception 'Departed member typing accepted'; exception when insufficient_privilege then null; end;
 assert not has_function_privilege('anon','public.messaging_typing(uuid,boolean,boolean)','execute');
 assert has_function_privilege('authenticated','public.messaging_typing(uuid,boolean,boolean)','execute');
end $$;
rollback;
