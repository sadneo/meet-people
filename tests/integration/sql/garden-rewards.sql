-- Called only by the disposable product-schema replay, on BOTH messaging tracks.
-- Real tables, safety functions and reward RPC; all fixture writes roll back.
begin;
set local plpgsql.check_asserts=on;
do $$
declare
 a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); chat uuid;
 native_store boolean; result jsonb; command jsonb;
begin
 insert into auth.users(id,email_confirmed_at,created_at,is_anonymous)
 values(a,now(),now()-interval '20 days',false),(b,now(),now()-interval '20 days',false);
 insert into public.profiles(id,username,display_name,birthdate)
 values(a,a::text,'Garden QA A','2000-01-01'),(b,b::text,'Garden QA B','2000-01-01');
 -- Only the disposable administrator can seed historical activity. Normal
 -- request/message triggers stamp today's date; restore them before assertions.
 perform set_config('session_replication_role','replica',true);
 insert into public.connections(user_a,user_b,initiated_by,status,created_at,responded_at)
 values(least(a,b),greatest(a,b),a,'accepted',now()-interval '20 days',now()-interval '20 days');
 select atttypid='uuid'::regtype into native_store from pg_attribute
 where attrelid='public.conversations'::regclass and attname='id' and not attisdropped;
 if native_store then
  insert into public.conversations(kind,source_key,created_at,last_seq)
  values('direct','direct:'||least(a,b)||':'||greatest(a,b),now()-interval '20 days',4) returning id into chat;
  insert into public.conversation_participants(conversation_id,user_id,joined_at)
  values(chat,a,now()-interval '20 days'),(chat,b,now()-interval '20 days');
  insert into public.messages(conversation_id,sender_id,seq,client_request_id,body,created_at)
  select chat,person,row_number() over(),gen_random_uuid(),'QA conversation',at_time
  from unnest(array[a,b]) person cross join unnest(array[now()-interval '3 days',now()-interval '1 day']) at_time;
 else
  insert into public.conversations(user_a,user_b,created_at)
  values(least(a,b),greatest(a,b),now()-interval '20 days');
  insert into public.messages(conversation_id,sender_id,body,created_at)
  select c.id,person,'QA conversation',at_time from public.conversations c
  cross join unnest(array[a,b]) person cross join unnest(array[now()-interval '3 days',now()-interval '1 day']) at_time
  where c.user_a=least(a,b) and c.user_b=greatest(a,b);
 end if;
 perform set_config('session_replication_role','origin',true);
 assert (select count(*)=1 from garden_private.social_candidates(a,false)), 'Mutual conversation must qualify on either schema';
 assert not exists(select 1 from garden_private.social_candidates(a,true)), 'Returning reward needs an earlier connection reward';

 update auth.users set created_at=now() where id=b;
 assert not exists(select 1 from garden_private.social_candidates(a,false)), 'New accounts cannot farm rewards';
 update auth.users set created_at=now()-interval '20 days' where id=b;
 update public.profiles set is_active=false where id=b;
 assert not exists(select 1 from garden_private.social_candidates(a,false)), 'Inactive accounts cannot qualify';
 update public.profiles set is_active=true where id=b;
 if native_store then
  update public.conversation_participants set joined_after_seq=999 where conversation_id=chat;
  assert not exists(select 1 from garden_private.social_candidates(a,false)), 'Hidden history cannot qualify';
  update public.conversation_participants set joined_after_seq=0 where conversation_id=chat;
 end if;

 perform set_config('request.jwt.claim.sub',a::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'is_anonymous',false)::text,true);
 perform set_config('role','authenticated',true);
 result:=public.garden_account(null);
 assert (result#>>'{community,balance}')::integer=300, 'Starting balance changed';
 command:=jsonb_build_object('action','connection-reward','requestId',gen_random_uuid(),'revision',result->'revision');
 result:=public.garden_account(command);
 assert (result#>>'{community,balance}')::integer=330, 'Connection reward failed';
 assert public.garden_account(command)=result, 'Retry must not pay twice';
 begin
  perform public.garden_account(jsonb_build_object('action','connection-reward','requestId',gen_random_uuid(),'revision',result->'revision'));
  raise exception 'Duplicate reward was accepted';
 exception when sqlstate 'GR400' then null;
 end;
 result:=public.garden_account(jsonb_build_object('action','build','id','cave','requestId',gen_random_uuid(),'revision',result->'revision'));
 assert (result#>>'{community,balance}')::integer=180 and (result#>'{community,owned}') ? 'cave', 'Cave purchase failed';
 result:=public.garden_account(jsonb_build_object('action','move','id','cave','position',jsonb_build_object('x',696,'y',660),'requestId',gen_random_uuid(),'revision',result->'revision'));
 assert public.garden_account(null)#>'{community,positions,cave}'='{"x":696,"y":660}'::jsonb, 'Cave move was not saved';
 result:=public.garden_account(jsonb_build_object('action','reset','requestId',gen_random_uuid(),'revision',result->'revision'));
 assert (result#>>'{community,balance}')::integer=330 and not ((result#>'{community,owned}') ? 'cave'), 'Cave reset refund failed';
 perform set_config('role','none',true);
 assert not exists(select 1 from garden_private.social_candidates(a,false)), 'Previously rewarded peer must stay excluded';
 assert exists(select 1 from garden_private.social_candidates(b,false)), 'The other participant has their own reward';
 insert into public.blocks(blocker_id,blocked_id) values(a,b);
 assert not exists(select 1 from garden_private.social_candidates(b,false)), 'Blocked contacts must not qualify';
 delete from public.blocks where blocker_id=a and blocked_id=b;
 assert not exists(select 1 from garden_private.social_candidates(b,false)), 'Unblocking cannot revive revoked rewards';
end $$;
rollback;
