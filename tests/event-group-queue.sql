-- DISPOSABLE ONLY: apply the candidate first. This file is one rollback-only
-- transaction. Deterministic rank/interest-trigger replacements below are TEST
-- FIXTURES, NOT Winso ranking, embedding or runtime/provider proof.
\set ON_ERROR_STOP on
begin;
set local plpgsql.check_asserts=on;
create temporary table group_test_context(key text primary key,value jsonb);
grant select,insert,update on group_test_context to authenticated;
create sequence pg_temp.forbidden_provider_calls;
create or replace function public.get_gemini_embedding(interest_text text)
returns double precision[] language plpgsql as $$
begin perform nextval('pg_temp.forbidden_provider_calls'); raise exception 'Forbidden provider call'; end $$;

do $$ declare n integer; a uuid; begin
 for n in 1..11 loop
  a:=('c1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
  insert into auth.users(id) values(a);
  insert into public.profiles(id,username,display_name) values(a,'group_test_'||n,'Person '||n);
 end loop;
 insert into auth.users(id) values('c4000000-0000-4000-8000-000000000001'),('c4000000-0000-4000-8000-000000000002');
 insert into event_group_private.workers(actor_id,worker_id) values
  ('c4000000-0000-4000-8000-000000000001','test-worker'),('c4000000-0000-4000-8000-000000000002','other-worker');
 insert into public.listings(id,title,source,external_id,starts_at) values
  ('c2000000-0000-4000-8000-000000000001','Group source test','test','group-main',now()+interval '1 day'),
  ('c2000000-0000-4000-8000-000000000002','Singleton test','test','group-singleton',now()+interval '1 day');
end $$;

-- Private rows/helpers are inaccessible, anonymous actor RPCs are denied.
do $$ declare t text; f text; begin
 for t in select tablename from pg_tables where schemaname='event_group_private' loop
  assert not has_table_privilege('authenticated',format('event_group_private.%I',t),'SELECT,INSERT,UPDATE,DELETE');
  assert not has_table_privilege('anon',format('event_group_private.%I',t),'SELECT');
  assert (select relrowsecurity from pg_class where oid=format('event_group_private.%I',t)::regclass);
 end loop;
 assert not has_schema_privilege('authenticated','event_group_private','USAGE');
 assert not has_function_privilege('authenticated','event_group_private.isolated_rank(uuid)','EXECUTE');
 foreach f in array array['get_event_group_queue(uuid)','join_event_group_queue(uuid)','leave_event_group_queue(uuid)',
  'get_matching_notifications()','mark_matching_notification_read(uuid)','claim_event_group_job(text,integer)',
  'worker_rank_event_group(uuid,uuid)','complete_event_group_job(uuid,uuid,uuid[])',
  'fail_event_group_job(uuid,uuid,text)','reconcile_event_group_job(uuid,uuid)'] loop
  assert not has_function_privilege('anon','public.'||f,'EXECUTE');
 end loop;
end $$;
set local role anon;
do $$ begin
 begin perform public.get_matching_notifications(); raise exception 'Anon allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
do $$ begin
 assert public.get_event_group_queue('c2000000-0000-4000-8000-000000000001')='{"state":"idle","proposal":null}'::jsonb;
 assert public.get_matching_notifications()='{"notifications":[],"unreadCount":0}'::jsonb;
 assert public.join_event_group_queue('c2000000-0000-4000-8000-000000000002')->>'state'='waiting';
 begin perform public.claim_event_group_job('test-worker',120); raise exception 'Ordinary actor claimed'; exception when insufficient_privilege then null; end;
 begin perform public.worker_rank_event_group('c2000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001'); raise exception 'Ordinary actor ranked'; exception when insufficient_privilege then null; end;
 begin perform 1 from event_group_private.jobs; raise exception 'Private rows exposed'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.get_matching_notifications(); raise exception 'Missing identity allowed'; exception when sqlstate '28000' then null; end;
end $$;
select set_config('request.jwt.claim.sub','c4000000-0000-4000-8000-000000000001',true);
do $$ begin
 begin perform public.claim_event_group_job('test-worker',120); raise exception 'Disabled worker accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update event_group_private.workers set enabled=true;
set local role authenticated;
do $$ begin
 -- Server flag false by default, independently of enabled worker registry.
 assert public.claim_event_group_job('test-worker',120) is null;
 begin perform public.worker_rank_event_group('c2000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001');
  raise exception 'Server scoring gate bypassed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
-- A normal SQL assertion block (no psql/docker invocation in this task).
do $$ begin assert (select not is_called from pg_temp.forbidden_provider_calls); end $$;
update event_group_private.settings set scoring_enabled=true; -- TEST TRANSACTION ONLY.
set local role authenticated;
do $$ begin
 assert public.claim_event_group_job('test-worker',120) is null; -- Zero peers: no lease/rank.
 begin perform public.claim_event_group_job('wrong-worker',120); raise exception 'Wrong registry label'; exception when insufficient_privilege then null; end;
 begin perform public.claim_event_group_job('test-worker',119); raise exception 'Short lease accepted'; exception when insufficient_privilege then null; end;
end $$;
-- New queue consent only, using actual actor functions/roles for each fixture user.
do $$ declare n integer; a uuid; lid uuid:='c2000000-0000-4000-8000-000000000001'; begin
 for n in 1..10 loop
  a:=('c1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
  perform set_config('request.jwt.claim.sub',a::text,true);
  assert public.join_event_group_queue(lid)->>'state'='waiting';
  assert public.join_event_group_queue(lid)->>'state'='waiting'; -- Idempotent, no new revision/job.
 end loop;
end $$;
reset role;
do $$ begin
 assert (select count(*) from event_group_private.queue where listing_id='c2000000-0000-4000-8000-000000000001')=10;
 assert (select count(*) from event_group_private.jobs where listing_id='c2000000-0000-4000-8000-000000000001')=10;
 assert (select bool_and(revision=1) from event_group_private.queue);
 assert (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='event_group_private' and c.relkind='S' and c.relname like 'enroll_%')=11;
 assert not has_sequence_privilege('authenticated',
   (select format('event_group_private.%I','enroll_'||replace(attempt_permit::text,'-',''))
    from event_group_private.queue order by listing_id,actor_id limit 1),'USAGE');
end $$;
-- Seed one unrelated LEGACY meetup/interest as a transaction-only fixture.
with m as (insert into public.meetups(title,starts_at,host_id) values('Legacy unchanged',now()+interval '1 day',null) returning id)
insert into public.event_interest(meetup_id,profile_id) select id,'c1000000-0000-4000-8000-000000000011' from m;
insert into group_test_context values('legacy_counts',jsonb_build_object('meetups',(select count(*) from public.meetups),'interest',(select count(*) from public.event_interest)));

-- Rollback-only deterministic original-RPC replacement: checks ephemeral universe
-- and pinned auth identity but deliberately does NOT test the real score/order.
create or replace function public.get_event_matches(meetup_id_in bigint)
returns table(profile_id uuid,username text,display_name text,avatar_url text,bio text,note text,shared_interests text[],match_score numeric)
language plpgsql stable security definer set search_path='pg_catalog,public,pg_temp' as $$
declare j event_group_private.jobs%rowtype; actual uuid[];
begin
 select * into strict j from event_group_private.jobs where id=((select value from pg_temp.group_test_context where key='job')->>'jobId')::uuid;
 assert auth.uid()=j.anchor_id;
 assert (select host_id is null and not is_public from public.meetups where id=meetup_id_in);
 select array_agg(e.profile_id order by e.profile_id) into actual from public.event_interest e where e.meetup_id=meetup_id_in;
 assert actual=(select array_agg(x order by x) from unnest(j.candidate_ids) x);
 assert cardinality(actual) between 2 and 8;
 return query select p.id,p.username,p.display_name,p.avatar_url,p.bio,null::text,'{}'::text[],0::numeric
  from public.event_interest e join public.profiles p on p.id=e.profile_id where e.meetup_id=meetup_id_in and p.id<>auth.uid() order by p.id desc;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','c4000000-0000-4000-8000-000000000001',true);
insert into group_test_context values('job',public.claim_event_group_job('test-worker',120));
do $$ declare j jsonb:=(select value from group_test_context where key='job'); begin
 assert j is not null;
 begin perform public.complete_event_group_job((j->>'jobId')::uuid,(j->>'leaseToken')::uuid,array[(j->>'anchorId')::uuid,'c1000000-0000-4000-8000-000000000002'::uuid]);
  raise exception 'Unranked completion allowed'; exception when sqlstate 'PT409' then null; end;
 perform set_config('request.jwt.claim.sub','c4000000-0000-4000-8000-000000000002',true);
 begin perform public.reconcile_event_group_job((j->>'jobId')::uuid,(j->>'leaseToken')::uuid); raise exception 'Other worker saw job'; exception when sqlstate 'PT409' then null; end;
 perform set_config('request.jwt.claim.sub','c4000000-0000-4000-8000-000000000001',true);
 begin perform public.worker_rank_event_group((j->>'jobId')::uuid,'c4000000-0000-4000-8000-000000000002'); raise exception 'Forged lease accepted'; exception when sqlstate 'PT409' then null; end;
 insert into group_test_context values('ranks',public.worker_rank_event_group((j->>'jobId')::uuid,(j->>'leaseToken')::uuid));
 assert auth.uid()='c4000000-0000-4000-8000-000000000001'::uuid;
 assert jsonb_array_length((select value from group_test_context where key='ranks'))=7;
 begin perform public.worker_rank_event_group((j->>'jobId')::uuid,(j->>'leaseToken')::uuid); raise exception 'Repeated rank accepted'; exception when sqlstate 'PT409' then null; end;
 begin perform public.complete_event_group_job((j->>'jobId')::uuid,(j->>'leaseToken')::uuid,array[(j->>'anchorId')::uuid,'c1000000-0000-4000-8000-000000000010'::uuid]);
  raise exception 'Spoofed member accepted'; exception when sqlstate 'PT409' then null; end;
end $$;
reset role;
do $$ begin
 assert (select count(*) from public.meetups)=((select value from group_test_context where key='legacy_counts')->>'meetups')::integer;
 assert (select count(*) from public.event_interest)=((select value from group_test_context where key='legacy_counts')->>'interest')::integer;
 assert (select not is_called from pg_temp.forbidden_provider_calls);
 insert into group_test_context select 'members',to_jsonb(array_prepend(anchor_id,ranked_ids[1:3])) from event_group_private.jobs where id=((select value from group_test_context where key='job')->>'jobId')::uuid;
 -- Rank retains both global social-table write fences through this transaction.
 assert (select count(*) from pg_locks where pid=pg_backend_pid() and granted and mode='ShareLock'
   and relation in ('public.blocks'::regclass,'public.connections'::regclass))=2;
 assert position('lock table public.blocks,public.connections in share mode' in
   pg_get_functiondef('event_group_private.lock_profiles(uuid[])'::regprocedure))>0;
 assert position('event_group_private.lock_profiles(j.candidate_ids)' in
   pg_get_functiondef('event_group_private.lock_job(uuid,uuid)'::regprocedure))>0;
 assert position('event_group_private.lock_job(job_id_in,lease_token_in)' in
   pg_get_functiondef('public.worker_rank_event_group(uuid,uuid)'::regprocedure))>0;
 assert position('event_group_private.lock_job(job_id_in,lease_token_in)' in
   pg_get_functiondef('public.complete_event_group_job(uuid,uuid,uuid[])'::regprocedure))>0;
 assert (select bool_and(not event_group_private.permit_available(q.attempt_permit))
   from event_group_private.queue q join event_group_private.jobs j on j.listing_id=q.listing_id
   where j.id=((select value from group_test_context where key='job')->>'jobId')::uuid and q.actor_id=any(j.candidate_ids));
 assert event_group_private.avatar('HTTPS://images.example.test:65535/a')='HTTPS://images.example.test:65535/a';
 assert event_group_private.avatar('http://images.example.test/a') is null;
 assert event_group_private.avatar('https://images.example.test:65536/a') is null;
 assert event_group_private.avatar('https://images.123/a') is null;
end $$;
-- Sync-only metadata must preserve ranked inputs (and later proposals).
update public.listings set last_synced_at=clock_timestamp(),missed_sync_count=missed_sync_count+1,
 updated_at=clock_timestamp() where id='c2000000-0000-4000-8000-000000000001';
-- Peer-to-peer block and anchor connection changes are both rejected at complete.
do $$ declare ids uuid[]; j jsonb:=(select value from group_test_context where key='job'); begin
 select array_agg(x::uuid order by n) into ids from jsonb_array_elements_text((select value from group_test_context where key='members')) with ordinality u(x,n);
 insert into public.blocks(blocker_id,blocked_id) values(ids[2],ids[3]);
 execute 'set local role authenticated';
 begin perform public.complete_event_group_job((j->>'jobId')::uuid,(j->>'leaseToken')::uuid,ids); raise exception 'Peer block ignored'; exception when sqlstate 'PT409' then null; end;
 execute 'reset role';
 delete from public.blocks where blocker_id=ids[2] and blocked_id=ids[3];
 insert into public.connections(user_a,user_b,initiated_by) values(least(ids[1],ids[2]),greatest(ids[1],ids[2]),ids[1]);
 execute 'set local role authenticated';
 begin perform public.complete_event_group_job((j->>'jobId')::uuid,(j->>'leaseToken')::uuid,ids); raise exception 'Anchor connection ignored'; exception when sqlstate 'PT409' then null; end;
 execute 'reset role';
 delete from public.connections where user_a=least(ids[1],ids[2]) and user_b=greatest(ids[1],ids[2]);
end $$;
set local role authenticated;
do $$ declare j jsonb:=(select value from group_test_context where key='job'); ids uuid[]; begin
 select array_agg(x::uuid order by n) into ids from jsonb_array_elements_text((select value from group_test_context where key='members')) with ordinality u(x,n);
 assert public.complete_event_group_job((j->>'jobId')::uuid,(j->>'leaseToken')::uuid,ids)='{"state":"completed"}'::jsonb;
 assert (select count(*) from pg_locks where pid=pg_backend_pid() and granted and mode='ShareLock'
   and relation in ('public.blocks'::regclass,'public.connections'::regclass))=2;
 assert public.complete_event_group_job((j->>'jobId')::uuid,(j->>'leaseToken')::uuid,ids)='{"state":"completed"}'::jsonb;
 assert public.reconcile_event_group_job((j->>'jobId')::uuid,(j->>'leaseToken')::uuid)='{"state":"completed"}'::jsonb;
 begin perform public.fail_event_group_job((j->>'jobId')::uuid,(j->>'leaseToken')::uuid,'completion_uncertain'); raise exception 'Completion undone'; exception when sqlstate 'PT409' then null; end;
 perform set_config('request.jwt.claim.sub',ids[1]::text,true);
 assert public.get_event_group_queue((j->>'eventId')::uuid)->>'state'='proposal';
 assert jsonb_array_length(public.get_event_group_queue((j->>'eventId')::uuid)->'proposal'->'members')=4;
 assert public.get_matching_notifications()->>'unreadCount'='1';
 insert into group_test_context select 'notice',(public.get_matching_notifications()->'notifications')->0;
 perform public.mark_matching_notification_read(((select value from group_test_context where key='notice')->>'id')::uuid);
 insert into group_test_context values('first_read',(public.get_matching_notifications()->'notifications')->0->'readAt');
 perform public.mark_matching_notification_read(((select value from group_test_context where key='notice')->>'id')::uuid);
 assert (public.get_matching_notifications()->'notifications')->0->'readAt'=(select value from group_test_context where key='first_read');
 assert public.get_matching_notifications()->>'unreadCount'='0';
 perform set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000010',true);
 assert public.mark_matching_notification_read(((select value from group_test_context where key='notice')->>'id')::uuid)=public.mark_matching_notification_read('c4000000-0000-4000-8000-000000000002');
end $$;
reset role;
do $$ begin
 assert (select count(*) from event_group_private.proposals where state='active')=1;
 assert (select count(*) from event_group_private.members)=4;
 assert (select count(*) from event_group_private.notifications)=4;
 insert into group_test_context select 'foreign_notice',to_jsonb(id) from event_group_private.notifications where read_at is null order by id limit 1;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000010',true);
do $$ begin
 assert public.mark_matching_notification_read(((select value from group_test_context where key='foreign_notice') #>> '{}')::uuid)='{"notifications":[],"unreadCount":0}'::jsonb;
end $$;
reset role;
do $$ begin assert (select read_at is null from event_group_private.notifications where id=((select value from group_test_context where key='foreign_notice') #>> '{}')::uuid); end $$;
update public.listings set last_synced_at=clock_timestamp(),missed_sync_count=missed_sync_count+1,
 updated_at=clock_timestamp() where id='c2000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
do $$ begin
 assert public.get_event_group_queue('c2000000-0000-4000-8000-000000000001')->>'state'='proposal';
 assert jsonb_array_length(public.get_matching_notifications()->'notifications')=1;
end $$;
reset role;
-- Current read checks suppress an authoritative listing change, no repair write.
update public.listings set title='Changed listing' where id='c2000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
do $$ begin
 assert public.get_event_group_queue('c2000000-0000-4000-8000-000000000001')->>'state'='waiting';
 assert public.get_matching_notifications()->>'unreadCount'='0';
 assert public.get_matching_notifications()->'notifications'='[]'::jsonb;
end $$;
reset role;
-- Restore this same-transaction fixture's exact listing fields, then independently
-- prove that a departed peer cancels/hides the previously visible proposal.
update public.listings set title='Group source test' where id='c2000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ declare peer text:=(select value->>1 from group_test_context where key='members'); begin
 assert public.get_event_group_queue('c2000000-0000-4000-8000-000000000001')->>'state'='proposal';
 perform set_config('request.jwt.claim.sub',peer,true);
 assert public.leave_event_group_queue('c2000000-0000-4000-8000-000000000001')->>'state'='idle';
 perform set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
 assert public.get_event_group_queue('c2000000-0000-4000-8000-000000000001')='{"state":"waiting","proposal":null}'::jsonb;
 assert public.get_matching_notifications()->'notifications'='[]'::jsonb;
end $$;
reset role;
update public.listings set status='cancelled' where id='c2000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
 begin perform public.join_event_group_queue('c2000000-0000-4000-8000-000000000001'); raise exception 'Cancelled join allowed'; exception when sqlstate 'PT409' then null; end;
 assert public.leave_event_group_queue('c2000000-0000-4000-8000-000000000001')->>'state'='idle';
 assert public.leave_event_group_queue('c2000000-0000-4000-8000-000000000001')->>'state'='idle';
end $$;
reset role;
do $$ begin assert (select bool_and(state='cancelled') from event_group_private.proposals); end $$;
update public.listings set starts_at=now()-interval '1 day' where id='c2000000-0000-4000-8000-000000000002';
set local role authenticated;
do $$ begin
 assert public.leave_event_group_queue('c2000000-0000-4000-8000-000000000002')->>'state'='idle';
 begin perform public.join_event_group_queue('c2000000-0000-4000-8000-000000000002'); raise exception 'Expired listing joined'; exception when sqlstate 'PT409' then null; end;
end $$;
reset role;

-- More isolated cases: interests/availability fence, rollback-consumed attempt,
-- expiry, inactive profile prerequisite. No real provider function can run.
-- TEST ONLY replacement of the legacy embedding trigger function: fixture writes
-- can alter an interest without calling Gemini. Rolled back with this file.
create or replace function public.user_interests_embed() returns trigger language plpgsql as $$
begin new.embedding:=array_fill(0::double precision,array[3072]); return new; end $$;
do $$ declare k integer; lid uuid; a uuid; j jsonb; fresh jsonb; ids uuid[]; oldfp text; oldpermits uuid[];
begin
 update event_group_private.jobs set state='failed',failure_reason='invalidated' where state='pending';
 for k in 3..6 loop
  lid:=('c2000000-0000-4000-8000-'||lpad(k::text,12,'0'))::uuid;
  insert into public.listings(id,title,source,external_id,starts_at) values(lid,'Fence '||k,'test','group-fence-'||k,now()+interval '1 day');
  -- Fixture calls under the genuine authenticated role, not a production auth bypass.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true); perform public.join_event_group_queue(lid);
  perform set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000002',true); perform public.join_event_group_queue(lid);
  perform set_config('request.jwt.claim.sub','c4000000-0000-4000-8000-000000000001',true); j:=public.claim_event_group_job('test-worker',120);
  update pg_temp.group_test_context set value=j where key='job';
  assert j->>'eventId'=lid::text;
  if k=5 then
   -- Raising after rank rolls back the jobs state and ephemeral inserts, but NOT
   -- nextval. A second call on this same lease must fail before invoking rank.
   begin perform public.worker_rank_event_group((j->>'jobId')::uuid,(j->>'leaseToken')::uuid); raise exception 'test rollback' using errcode='ZQ002';
   exception when sqlstate 'ZQ002' then null; end;
   begin perform public.worker_rank_event_group((j->>'jobId')::uuid,(j->>'leaseToken')::uuid); raise exception 'Rollback allowed rescore'; exception when sqlstate 'PT409' then null; end;
    assert auth.uid()='c4000000-0000-4000-8000-000000000001'::uuid;
    assert public.fail_event_group_job((j->>'jobId')::uuid,(j->>'leaseToken')::uuid,'scoring_uncertain')->>'state'='failed';
    assert public.claim_event_group_job('test-worker',120) is null; -- Alternate anchor cannot rescore.
    execute 'reset role';
    assert exists(select 1 from event_group_private.jobs where listing_id=lid and state='pending');
    select array_agg(attempt_permit order by actor_id) into oldpermits from event_group_private.queue where listing_id=lid;
    assert (select bool_and(not event_group_private.permit_available(attempt_permit)) from event_group_private.queue where listing_id=lid);
    execute 'set local role authenticated';
    -- Unrelated fresh enrollments on the SAME event can still form their own work.
    perform set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000003',true); perform public.join_event_group_queue(lid);
    perform set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000004',true); perform public.join_event_group_queue(lid);
    perform set_config('request.jwt.claim.sub','c4000000-0000-4000-8000-000000000001',true);
    fresh:=public.claim_event_group_job('test-worker',120); assert fresh is not null;
    execute 'reset role';
    assert (select candidate_ids <@ array['c1000000-0000-4000-8000-000000000003'::uuid,'c1000000-0000-4000-8000-000000000004'::uuid]
      and cardinality(candidate_ids)=2 from event_group_private.jobs where id=(fresh->>'jobId')::uuid);
    execute 'set local role authenticated';
    update pg_temp.group_test_context set value=fresh where key='job';
    perform public.worker_rank_event_group((fresh->>'jobId')::uuid,(fresh->>'leaseToken')::uuid);
    perform public.fail_event_group_job((fresh->>'jobId')::uuid,(fresh->>'leaseToken')::uuid,'completion_uncertain');
    assert public.claim_event_group_job('test-worker',120) is null;
    -- Each spent enrollment needs its own explicit Leave/rejoin, not just one anchor.
    perform set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
    perform public.leave_event_group_queue(lid); perform public.join_event_group_queue(lid);
    perform set_config('request.jwt.claim.sub','c4000000-0000-4000-8000-000000000001',true);
    assert public.claim_event_group_job('test-worker',120) is null;
    perform set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000002',true);
    perform public.leave_event_group_queue(lid); perform public.join_event_group_queue(lid);
    perform set_config('request.jwt.claim.sub','c4000000-0000-4000-8000-000000000001',true);
    fresh:=public.claim_event_group_job('test-worker',120); assert fresh is not null;
    begin perform public.worker_rank_event_group((j->>'jobId')::uuid,(j->>'leaseToken')::uuid); raise exception 'Old token revived'; exception when sqlstate 'PT409' then null; end;
    execute 'reset role';
    assert (select bool_and(revision=2 and attempt_permit<>all(oldpermits) and event_group_private.permit_available(attempt_permit))
      from event_group_private.queue where listing_id=lid and actor_id in ('c1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000002'));
    assert (select bool_and(not event_group_private.permit_available(x)) from unnest(oldpermits) x);
    execute 'set local role authenticated';
    update pg_temp.group_test_context set value=fresh where key='job';
    perform public.worker_rank_event_group((fresh->>'jobId')::uuid,(fresh->>'leaseToken')::uuid);
    perform public.fail_event_group_job((fresh->>'jobId')::uuid,(fresh->>'leaseToken')::uuid,'completion_uncertain');
  else
   perform public.worker_rank_event_group((j->>'jobId')::uuid,(j->>'leaseToken')::uuid);
   execute 'reset role';
   select array_prepend(anchor_id,ranked_ids[1:3]) into ids from event_group_private.jobs where id=(j->>'jobId')::uuid;
   if k=3 then
    a:='c1000000-0000-4000-8000-000000000002'; oldfp:=event_group_private.profile_fingerprint(a);
    insert into public.user_interests(profile_id,text) values(a,'Fixture interest');
    assert event_group_private.profile_fingerprint(a)<>oldfp;
   elsif k=4 then
    a:='c1000000-0000-4000-8000-000000000002'; oldfp:=event_group_private.profile_fingerprint(a);
    insert into public.availability(profile_id,dow,start_time,end_time) values(a,1,'10:00','11:00');
    assert event_group_private.profile_fingerprint(a)<>oldfp;
   else update event_group_private.jobs set lease_until=clock_timestamp()-interval '1 second' where id=(j->>'jobId')::uuid;
   end if;
   execute 'set local role authenticated';
   begin perform public.complete_event_group_job((j->>'jobId')::uuid,(j->>'leaseToken')::uuid,ids); raise exception 'Stale completion allowed'; exception when sqlstate 'PT409' then null; end;
    if k=6 then assert public.reconcile_event_group_job((j->>'jobId')::uuid,(j->>'leaseToken')::uuid)->>'state'='expired';
    else perform public.fail_event_group_job((j->>'jobId')::uuid,(j->>'leaseToken')::uuid,'completion_uncertain'); end if;
    assert public.claim_event_group_job('test-worker',120) is null; -- Failure/expiry cannot switch anchors.
  end if;
  execute 'reset role';
  update event_group_private.jobs set state='failed',failure_reason='invalidated' where state='pending';
 end loop;
 assert (select not is_called from pg_temp.forbidden_provider_calls);
end $$;
-- No saved/active profile cannot join; expired leave remains available.
update public.profiles set is_active=false where id='c1000000-0000-4000-8000-000000000010';
set local role authenticated;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000010',true);
do $$ begin
 begin perform public.join_event_group_queue('c2000000-0000-4000-8000-000000000003'); raise exception 'Inactive profile joined'; exception when sqlstate 'PT409' then null; end;
 assert public.leave_event_group_queue('c2000000-0000-4000-8000-000000000001')->>'state'='idle';
 perform set_config('request.jwt.claim.sub','c4000000-0000-4000-8000-000000000002',true);
 begin perform public.join_event_group_queue('c2000000-0000-4000-8000-000000000003'); raise exception 'Missing saved profile joined'; exception when sqlstate 'PT409' then null; end;
end $$;
reset role;

-- A synthetic failure INSIDE the legacy rank RPC must roll back ephemeral rows,
-- restore JWT context, consume its permit and expose only a fixed safe error.
insert into public.listings(id,title,source,external_id,starts_at)
values('c2000000-0000-4000-8000-000000000007','Synthetic failure','test','group-failure',now()+interval '1 day');
set local role authenticated;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
select public.join_event_group_queue('c2000000-0000-4000-8000-000000000007');
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000002',true);
select public.join_event_group_queue('c2000000-0000-4000-8000-000000000007');
select set_config('request.jwt.claim.sub','c4000000-0000-4000-8000-000000000001',true);
update group_test_context set value=public.claim_event_group_job('test-worker',120) where key='job';
reset role;
create or replace function public.get_event_matches(meetup_id_in bigint)
returns table(profile_id uuid,username text,display_name text,avatar_url text,bio text,note text,shared_interests text[],match_score numeric)
language plpgsql stable security definer as $$ begin raise exception 'Synthetic private rank detail'; end $$;
set local role authenticated;
do $$ declare j jsonb:=(select value from group_test_context where key='job'); begin
 begin perform public.worker_rank_event_group((j->>'jobId')::uuid,(j->>'leaseToken')::uuid);
  raise exception 'Synthetic failure was not propagated'; exception when sqlstate 'PT409' then assert sqlerrm='Ranking outcome uncertain; reconcile only'; end;
 assert auth.uid()='c4000000-0000-4000-8000-000000000001'::uuid;
 begin perform public.worker_rank_event_group((j->>'jobId')::uuid,(j->>'leaseToken')::uuid);
  raise exception 'Failed rank retried'; exception when sqlstate 'PT409' then assert sqlerrm='Rank attempt already consumed; reconcile only'; end;
 perform public.fail_event_group_job((j->>'jobId')::uuid,(j->>'leaseToken')::uuid,'scoring_uncertain');
end $$;
reset role;
do $$ begin
 assert (select count(*) from public.meetups)=((select value from group_test_context where key='legacy_counts')->>'meetups')::integer;
 assert (select count(*) from public.event_interest)=((select value from group_test_context where key='legacy_counts')->>'interest')::integer;
 assert (select not is_called from pg_temp.forbidden_provider_calls);
end $$;

-- Feed bound fixture (not algorithm or completion proof): 201 distinct events /
-- proposals for two real transaction-fixture profiles, all current/new-consented.
do $$ declare n integer; lid uuid; pr uuid; a uuid:='c1000000-0000-4000-8000-000000000001'; b uuid:='c1000000-0000-4000-8000-000000000002';
begin
 for n in 1..201 loop
  lid:=('c3000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
  insert into public.listings(id,title,source,external_id,starts_at) values(lid,'Feed fixture','test','group-feed-'||n,now()+interval '1 day');
  insert into event_group_private.queue(listing_id,actor_id) values(lid,a),(lid,b);
  insert into event_group_private.proposals(listing_id,anchor_id,expected_members,listing_fingerprint)
    select lid,a,array[a,b],event_group_private.listing_fingerprint(l) from public.listings l where l.id=lid returning id into pr;
  insert into event_group_private.members(proposal_id,listing_id,actor_id,queue_revision,profile_fingerprint)
   select pr,lid,x,1,event_group_private.profile_fingerprint(x) from unnest(array[a,b]) x;
  insert into event_group_private.notifications(proposal_id,actor_id) values(pr,a),(pr,b);
 end loop;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
do $$ declare feed jsonb:=public.get_matching_notifications(); n jsonb; begin
 assert jsonb_array_length(feed->'notifications')=200;
 assert feed->>'unreadCount'='200';
 for n in select value from jsonb_array_elements(feed->'notifications') loop
  assert (select count(*) from jsonb_object_keys(n))=6;
  assert n->>'title'='Group proposal to review';
 end loop;
 perform public.mark_matching_notification_read(((feed->'notifications')->0->>'id')::uuid);
 assert public.get_matching_notifications()->>'unreadCount'='199';
end $$;
reset role;
do $$ begin assert (select not is_called from pg_temp.forbidden_provider_calls); end $$;
rollback;
