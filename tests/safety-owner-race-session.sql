-- MANUAL MULTI-SESSION ACCEPTANCE SOURCE ONLY. Never executed by agent.
-- Same independently network-none disposable/marker/candidates as safety-owner-contact.sql.
-- psql variables: mode=setup|run|hold_row|observe|inspect|cleanup;
-- scenario=request|accept|send|receipt|block_delete;
-- operation=block|legacy_block|legacy_unblock|request|accept|send|receipt|report|profile_delete;
-- participant=winner|loser. hold_row also needs row_kind=block|connection|message.
-- run mode prompts before COMMIT/ROLLBACK so a separate loser and observer can
-- establish a REAL wait, not sleeps/source assertions. See backend doc matrix.
\set ON_ERROR_STOP on
\set VERBOSITY verbose
-- Optional distinct report id for serialized quota-boundary acceptance.
\if :{?report_request_id}
\else
\set report_request_id cb100000-0000-4000-8000-000000000001
\endif
begin isolation level read committed;
set local lock_timeout='60s';
set local statement_timeout='90s';
do $$ declare r text; begin
  if current_database()<>'pebble_safety_owner_disposable' or current_setting('pebble.safety_owner_test_target',true) is distinct from 'network-none-safety-owner-v1'
    or to_regclass('public.safety_owner_disposable_marker') is null then raise exception 'Wrong safety race target'; end if;
  if (select pg_get_userbyid(relowner) from pg_class where oid='public.safety_owner_disposable_marker'::regclass)<>current_user
    or (select count(*) from public.safety_owner_disposable_marker)<>1
    or not exists(select 1 from public.safety_owner_disposable_marker where singleton and purpose='network-none-safety-owner-v1') then raise exception 'Invalid safety race marker'; end if;
  if to_regprocedure('public.block_owner_target(uuid)') is null then raise exception 'Install reviewed safety candidate first'; end if;
  foreach r in array array['anon','authenticated'] loop
    if has_table_privilege(r::name,'public.safety_owner_disposable_marker','INSERT,UPDATE,DELETE,TRUNCATE') or has_any_column_privilege(r::name,'public.safety_owner_disposable_marker','INSERT') or has_any_column_privilege(r::name,'public.safety_owner_disposable_marker','UPDATE')
      or exists(select 1 from pg_roles where rolname=r and (rolsuper or rolbypassrls)) then raise exception 'Unsafe race marker/browser role'; end if;
  end loop;
end $$;
select :'mode'='setup' as setup_mode, :'mode' in ('run','hold_row') as run_mode, :'mode'='hold_row' as hold_row_mode, :'mode'='observe' as observe_mode, :'mode'='inspect' as inspect_mode, :'mode'='cleanup' as cleanup_mode \gset
\if :setup_mode
select set_config('pebble.safety_race_scenario', :'scenario',true);
do $$ begin
  if current_setting('pebble.safety_race_scenario') not in ('request','accept','send','receipt','block_delete') then raise exception 'Invalid scenario'; end if;
  if to_regnamespace('safety_race_fixture') is not null or exists(select 1 from auth.users where id in ('ca100000-0000-4000-8000-000000000001','ca100000-0000-4000-8000-000000000002'))
    or exists(select 1 from public.profiles where username in ('safety-race-a','safety-race-b')) then raise exception 'Race namespace occupied'; end if;
end $$;
create schema safety_race_fixture;
revoke all on schema safety_race_fixture from public,anon;
grant usage on schema safety_race_fixture to authenticated;
insert into auth.users(id) values('ca100000-0000-4000-8000-000000000001'),('ca100000-0000-4000-8000-000000000002');
insert into public.profiles(id,username,display_name) values('ca100000-0000-4000-8000-000000000001','safety-race-a','Synthetic race A'),('ca100000-0000-4000-8000-000000000002','safety-race-b','Synthetic race B');
create table safety_race_fixture.connection_ids(id bigint primary key);
create function safety_race_fixture.request() returns void language sql security definer set search_path='' as $$
 insert into public.connections(user_a,user_b,initiated_by) values('ca100000-0000-4000-8000-000000000001','ca100000-0000-4000-8000-000000000002',auth.uid()); $$;
create function safety_race_fixture.accept() returns void language plpgsql security definer set search_path='' as $$
declare n int; begin
 update public.connections set status='accepted' where user_a='ca100000-0000-4000-8000-000000000001' and user_b='ca100000-0000-4000-8000-000000000002';
 get diagnostics n=row_count; if n<>1 then raise exception 'Missing race connection' using errcode='22023'; end if; end $$;
create function safety_race_fixture.send() returns void language plpgsql security definer set search_path='' as $$
declare n int; begin
 insert into public.messages(conversation_id,sender_id,body) select id,auth.uid(),'Synthetic race message' from public.conversations where user_a='ca100000-0000-4000-8000-000000000001' and user_b='ca100000-0000-4000-8000-000000000002';
 get diagnostics n=row_count; if n<>1 then raise exception 'Missing race conversation' using errcode='22023'; end if; end $$;
create function safety_race_fixture.receipt() returns void language plpgsql security definer set search_path='' as $$
declare n int; begin
 update public.messages set read_at=statement_timestamp() where conversation_id in(select id from public.conversations where user_a='ca100000-0000-4000-8000-000000000001' and user_b='ca100000-0000-4000-8000-000000000002');
 get diagnostics n=row_count; if n<>1 then raise exception 'Missing race message' using errcode='22023'; end if; end $$;
create function safety_race_fixture.legacy_block() returns void language sql security definer set search_path='' as $$
 insert into public.blocks(blocker_id,blocked_id) values(auth.uid(),'ca100000-0000-4000-8000-000000000001'); $$;
create function safety_race_fixture.legacy_unblock() returns void language plpgsql security definer set search_path='' as $$
declare n int; begin
 delete from public.blocks where blocker_id=auth.uid() and blocked_id='ca100000-0000-4000-8000-000000000001';
 get diagnostics n=row_count; if n<>1 then raise exception 'Missing race block' using errcode='22023'; end if; end $$;
create function safety_race_fixture.social_send() returns void language plpgsql security definer set search_path='' as $$
begin perform public.social_send((select alias.id from social_private.conversations alias join public.conversations c on c.id=alias.legacy_id where c.user_a='ca100000-0000-4000-8000-000000000001' and c.user_b='ca100000-0000-4000-8000-000000000002'),'Synthetic race message','cd100000-0000-4000-8000-000000000001'); end $$;
create function safety_race_fixture.social_read() returns void language plpgsql security definer set search_path='' as $$
begin perform public.social_read((select alias.id from social_private.conversations alias join public.conversations c on c.id=alias.legacy_id where c.user_a='ca100000-0000-4000-8000-000000000001' and c.user_b='ca100000-0000-4000-8000-000000000002'),(select max(m.id) from public.messages m join public.conversations c on c.id=m.conversation_id where c.user_a='ca100000-0000-4000-8000-000000000001' and c.user_b='ca100000-0000-4000-8000-000000000002')); end $$;
create function safety_race_fixture.profile_delete() returns void language plpgsql security definer set search_path='' as $$
declare n int; begin
 if auth.uid() is distinct from 'ca100000-0000-4000-8000-000000000001'::uuid then raise exception 'Fixture profile owner required' using errcode='42501'; end if;
 delete from public.profiles where id='ca100000-0000-4000-8000-000000000001';
 get diagnostics n=row_count; if n<>1 then raise exception 'Missing race profile' using errcode='22023'; end if; end $$;
-- Deliberately model executor row locks taken BEFORE a row trigger can acquire
-- its pair/profile locks. No mutation/admission and no production helper.
create function safety_race_fixture.hold_row(kind text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is distinct from 'ca100000-0000-4000-8000-000000000002'::uuid then raise exception 'Fixture row holder required' using errcode='42501'; end if;
 if kind='block' then
  perform 1 from public.blocks where blocker_id='ca100000-0000-4000-8000-000000000002' and blocked_id='ca100000-0000-4000-8000-000000000001' for update;
 elsif kind='connection' then
  perform 1 from public.connections where user_a='ca100000-0000-4000-8000-000000000001' and user_b='ca100000-0000-4000-8000-000000000002' for update;
 elsif kind='message' then
  perform 1 from public.messages where conversation_id in(select id from public.conversations where user_a='ca100000-0000-4000-8000-000000000001' and user_b='ca100000-0000-4000-8000-000000000002') for update;
 else raise exception 'Invalid fixture row kind' using errcode='22023'; end if;
 if not found then raise exception 'Missing fixture row to hold' using errcode='22023'; end if;
end $$;
revoke all on all functions in schema safety_race_fixture from public,anon;
grant execute on all functions in schema safety_race_fixture to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','ca100000-0000-4000-8000-000000000001',true),set_config('request.jwt.claims','{}',true);
do $$ begin if current_setting('pebble.safety_race_scenario') in ('accept','send','receipt') then perform safety_race_fixture.request(); end if; end $$;
select set_config('request.jwt.claim.sub','ca100000-0000-4000-8000-000000000002',true);
do $$ begin if current_setting('pebble.safety_race_scenario') in ('send','receipt') then perform safety_race_fixture.accept(); end if; end $$;
do $$ begin if current_setting('pebble.safety_race_scenario')='block_delete' then perform public.block_owner_target('ca100000-0000-4000-8000-000000000001'); end if; end $$;
select set_config('request.jwt.claim.sub','ca100000-0000-4000-8000-000000000001',true);
do $$ begin if current_setting('pebble.safety_race_scenario')='receipt' then perform safety_race_fixture.send(); end if; end $$;
reset role;
insert into safety_race_fixture.connection_ids select id from public.connections where user_a='ca100000-0000-4000-8000-000000000001' and user_b='ca100000-0000-4000-8000-000000000002';
commit;
\elif :run_mode
select set_config('pebble.safety_race_operation', :'operation',true),set_config('application_name','pebble-safety-race-'||:'participant',true),set_config('pebble.safety_race_report_request_id',:'report_request_id',true);
do $$ begin if current_setting('pebble.safety_race_operation') not in ('block','legacy_block','legacy_unblock','request','accept','send','receipt','social_send','social_read','report','profile_delete') then raise exception 'Invalid operation'; end if; end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',case when :'operation' in ('block','legacy_block','legacy_unblock','accept','receipt','social_read') then 'ca100000-0000-4000-8000-000000000002' else 'ca100000-0000-4000-8000-000000000001' end,true),set_config('request.jwt.claims','{}',true);
\if :hold_row_mode
select safety_race_fixture.hold_row(:'row_kind');
\echo 'Row held WITHOUT the advisory lock. Start the competing operation and require observer evidence first.'
\prompt 'Type continue only after the competing session is observed waiting: ' continue_step
select :'continue_step'='continue' as continue_mode \gset
\if :continue_mode
\else
rollback;
\quit 3
\endif
\endif
do $$ begin
  case current_setting('pebble.safety_race_operation')
    when 'block' then perform public.block_owner_target('ca100000-0000-4000-8000-000000000001');
    when 'legacy_block' then perform safety_race_fixture.legacy_block();
    when 'legacy_unblock' then perform safety_race_fixture.legacy_unblock();
    when 'request' then perform safety_race_fixture.request();
    when 'accept' then perform safety_race_fixture.accept();
    when 'send' then perform safety_race_fixture.send();
    when 'receipt' then perform safety_race_fixture.receipt();
    when 'social_send' then perform safety_race_fixture.social_send();
    when 'social_read' then perform safety_race_fixture.social_read();
    when 'report' then perform public.submit_safety_report(jsonb_build_object('requestId',current_setting('pebble.safety_race_report_request_id'),'targetId','ca100000-0000-4000-8000-000000000002','reason','Other','context','Synthetic race report'));
    when 'profile_delete' then perform safety_race_fixture.profile_delete();
  end case;
exception
  when deadlock_detected then raise notice '40P01: operation aborted; this is NOT 42501 predicate exclusion. Inspect victim, survivor and poststate.'; raise;
  when insufficient_privilege then raise notice '42501: operation denied; verify expected actor/path, not just error class.'; raise;
end $$;
\echo 'Operation finished; transaction still holds its pair/actor lock. Observe loser before releasing winner.'
\prompt 'Type commit or rollback: ' resolution
select :'resolution'='commit' as commit_resolution, :'resolution'='rollback' as rollback_resolution \gset
\if :commit_resolution
commit;
\elif :rollback_resolution
rollback;
\else
rollback;
\quit 3
\endif
\elif :observe_mode
do $$ begin
  if not exists(select 1 from pg_stat_activity loser join pg_stat_activity winner on winner.application_name='pebble-safety-race-winner'
    where loser.application_name='pebble-safety-race-loser' and loser.wait_event_type='Lock' and winner.pid=any(pg_blocking_pids(loser.pid))) then raise exception 'No observed winner/loser lock wait'; end if;
end $$;
select 'observed winner/loser lock wait' as evidence;
rollback;
\elif :inspect_mode
-- Fixed synthetic namespace only. These are observations for parent assertions,
-- not fabricated application inbox/block responses or automatic pass criteria.
select (select count(*) from public.profiles where id in ('ca100000-0000-4000-8000-000000000001','ca100000-0000-4000-8000-000000000002')) as profiles_alive,
 (select count(*) from public.blocks where blocker_id='ca100000-0000-4000-8000-000000000002' and blocked_id='ca100000-0000-4000-8000-000000000001') as outgoing_blocks,
 (select count(*) from public.connections where user_a='ca100000-0000-4000-8000-000000000001' and user_b='ca100000-0000-4000-8000-000000000002') as connections_alive,
 (select count(*) from public.messages where conversation_id in(select id from public.conversations where user_a='ca100000-0000-4000-8000-000000000001' and user_b='ca100000-0000-4000-8000-000000000002')) as messages_alive,
 (select count(*) from safety_private.revoked_connections where connection_id in(select id from safety_race_fixture.connection_ids)) as quarantined_ids;
select c.id,c.status from public.connections c where c.user_a='ca100000-0000-4000-8000-000000000001' and c.user_b='ca100000-0000-4000-8000-000000000002';
select m.id,m.sender_id,m.body,m.read_at from public.messages m join public.conversations c on c.id=m.conversation_id where c.user_a='ca100000-0000-4000-8000-000000000001' and c.user_b='ca100000-0000-4000-8000-000000000002';
select id,request_id,target_id,received_at from safety_private.reports where actor_id='ca100000-0000-4000-8000-000000000001' and request_id='cb100000-0000-4000-8000-000000000001';
rollback;
\elif :cleanup_mode
-- Synthetic namespace only, parent must ensure all race sessions have ended.
do $$ begin
  if (select count(*) from auth.users where id in ('ca100000-0000-4000-8000-000000000001','ca100000-0000-4000-8000-000000000002'))<>2
    or not exists(select 1 from public.profiles where id='ca100000-0000-4000-8000-000000000002' and username='safety-race-b')
    or exists(select 1 from public.profiles where id='ca100000-0000-4000-8000-000000000001' and username<>'safety-race-a') then raise exception 'Unrecognized race namespace'; end if;
end $$;
delete from safety_private.revoked_connections where connection_id in(select id from safety_race_fixture.connection_ids union select id from public.connections where user_a='ca100000-0000-4000-8000-000000000001' and user_b='ca100000-0000-4000-8000-000000000002');
delete from auth.users where id in ('ca100000-0000-4000-8000-000000000001','ca100000-0000-4000-8000-000000000002');
drop function safety_race_fixture.request(),safety_race_fixture.accept(),safety_race_fixture.send(),safety_race_fixture.receipt(),safety_race_fixture.legacy_block(),safety_race_fixture.legacy_unblock(),safety_race_fixture.profile_delete(),safety_race_fixture.hold_row(text),safety_race_fixture.social_send(),safety_race_fixture.social_read();
drop table safety_race_fixture.connection_ids;
drop schema safety_race_fixture;
commit;
\else
rollback;
\quit 3
\endif
