-- ACCEPTANCE SOURCE ONLY; agent never executes. Parent installs exact historical
-- core contact tables, real migrations 04/08/07 definitions, reviewed partial
-- candidate ONLY in verified network-none PG17. This file installs the NEW
-- candidate inside rollback scope, after guarded negative install/history cases.
-- Marker and session GUC attest intent, NOT actual network isolation/full replay.
\set ON_ERROR_STOP on
begin isolation level read committed;
do $$ declare r text; begin
  if current_database()<>'pebble_safety_owner_disposable' or current_setting('pebble.safety_owner_test_target',true) is distinct from 'network-none-safety-owner-v1'
    or to_regclass('public.safety_owner_disposable_marker') is null then raise exception 'Wrong safety disposable target'; end if;
  if (select pg_get_userbyid(relowner) from pg_class where oid='public.safety_owner_disposable_marker'::regclass)<>current_user
    or (select count(*) from public.safety_owner_disposable_marker)<>1
    or not exists(select 1 from public.safety_owner_disposable_marker where singleton and purpose='network-none-safety-owner-v1') then raise exception 'Invalid executor-owned marker'; end if;
  foreach r in array array['anon','authenticated'] loop
    if has_table_privilege(r::name,'public.safety_owner_disposable_marker','INSERT,UPDATE,DELETE,TRUNCATE') or has_any_column_privilege(r::name,'public.safety_owner_disposable_marker','INSERT') or has_any_column_privilege(r::name,'public.safety_owner_disposable_marker','UPDATE')
      or exists(select 1 from pg_roles where rolname=r and (rolsuper or rolbypassrls)) then raise exception 'Unsafe marker/browser role'; end if;
  end loop;
  if to_regclass('auth.users') is null or to_regprocedure('auth.uid()') is null
    or to_regclass('public.user_interests') is null or to_regprocedure('public.shared_interest_labels(uuid,uuid)') is null
    or to_regprocedure('public.safety_pair_allowed(uuid,uuid)') is null or to_regprocedure('public.get_owner_blocklist()') is null
    or to_regprocedure('public.connections_before_insert()') is null or to_regprocedure('public.get_my_conversations()') is null then raise exception 'Install prior candidate and actual historical definitions/dependencies first'; end if;
  if to_regnamespace('safety_private') is not null or to_regprocedure('public.block_owner_target(uuid)') is not null
    or exists(select 1 from pg_catalog.pg_roles where rolname='safety_owner_inherited_sequence_fixture') then raise exception 'Fresh install-negative namespace required'; end if;
  if exists(select 1 from auth.users where id in ('ca000000-0000-4000-8000-000000000001','ca000000-0000-4000-8000-000000000002','ca000000-0000-4000-8000-000000000003'))
    or exists(select 1 from public.profiles where username in ('safety-owner-fixture-a','safety-owner-fixture-b','safety-owner-fixture-c')) then raise exception 'Fixture namespace occupied'; end if;
end $$;
set local plpgsql.check_asserts=on;
set local search_path=public,pg_catalog;
-- Client-side source only, no server file/program/provider access. Strip only
-- the two outer boundaries so ALL positive/negative installations roll back.
create temporary table safety_owner_candidate_source(line_number bigint generated always as identity,line text not null);
\copy safety_owner_candidate_source(line) from 'supabase/schema-sources/safety-owner-contact-migration.sql' with (format csv,delimiter E'\x01',quote E'\x02',escape E'\x02',null E'\x03')
create temporary table safety_owner_install_source(body text not null);
do $$ begin
  assert (select count(*) from safety_owner_candidate_source where lower(btrim(line))='begin;')=1;
  assert (select count(*) from safety_owner_candidate_source where lower(btrim(line))='commit;')=1;
end $$;
insert into safety_owner_install_source select string_agg(line,E'\n' order by line_number)||E'\n' from safety_owner_candidate_source where lower(btrim(line)) not in ('begin;','commit;');

-- Real malformed historical data BEFORE the new guard exists, not trigger-
-- disabled inserts or repaired/deleted post-install history. Separate A/C pair.
insert into auth.users(id) values ('ca000000-0000-4000-8000-000000000001'),('ca000000-0000-4000-8000-000000000002'),('ca000000-0000-4000-8000-000000000003');
insert into public.profiles(id,username,display_name,is_active) values
 ('ca000000-0000-4000-8000-000000000001','safety-owner-fixture-a','Synthetic A',true),
 ('ca000000-0000-4000-8000-000000000002','safety-owner-fixture-b','Never expose this hidden live name',false),
 ('ca000000-0000-4000-8000-000000000003','safety-owner-fixture-c','Synthetic C',true);
select set_config('request.jwt.claim.sub','ca000000-0000-4000-8000-000000000001',true),set_config('request.jwt.claims','{}',true);
insert into public.connections(user_a,user_b,initiated_by,status,created_at) values('ca000000-0000-4000-8000-000000000001','ca000000-0000-4000-8000-000000000003','ca000000-0000-4000-8000-000000000001','accepted','2020-01-01T00:00:00Z');
insert into public.conversations(user_a,user_b) values('ca000000-0000-4000-8000-000000000001','ca000000-0000-4000-8000-000000000003');
insert into public.messages(conversation_id,sender_id,body,created_at)
 select id,null,'Synthetic malformed NULL sender history','2020-01-01T00:00:00Z' from public.conversations where user_a='ca000000-0000-4000-8000-000000000001' and user_b='ca000000-0000-4000-8000-000000000003';
insert into public.messages(conversation_id,sender_id,body,created_at)
 select id,'ca000000-0000-4000-8000-000000000002','Synthetic malformed third-party sender history','2020-01-01T00:00:00Z' from public.conversations where user_a='ca000000-0000-4000-8000-000000000001' and user_b='ca000000-0000-4000-8000-000000000003';
create temporary table safety_owner_malformed_history as select m.* from public.messages m join public.conversations c on c.id=m.conversation_id where c.user_a='ca000000-0000-4000-8000-000000000001' and c.user_b='ca000000-0000-4000-8000-000000000003';
select set_config('pebble.safety_owner_null_history_id',(select id::text from safety_owner_malformed_history where sender_id is null),true),
 set_config('pebble.safety_owner_foreign_history_id',(select id::text from safety_owner_malformed_history where sender_id is not null),true);
create function pg_temp.safety_install_snapshot() returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object(
  'functions',(select jsonb_agg(jsonb_build_array(p.oid,p.proname,p.proowner,p.proacl,p.prosrc,p.proconfig,p.prosecdef,p.provolatile,p.prorettype,p.proretset,p.proargnames) order by p.oid) from pg_catalog.pg_proc p where p.pronamespace='public'::regnamespace),
  'relations',(select jsonb_agg(jsonb_build_array(c.oid,c.relname,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity) order by c.oid) from pg_catalog.pg_class c where c.relnamespace='public'::regnamespace),
  'columns',(select jsonb_agg(jsonb_build_array(a.attrelid,a.attnum,a.attacl,a.attname,a.atttypid) order by a.attrelid,a.attnum) from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid=a.attrelid where c.relnamespace='public'::regnamespace and a.attnum>0 and not a.attisdropped),
  'triggers',(select jsonb_agg(jsonb_build_array(t.oid,t.tgrelid,t.tgname,t.tgfoid,t.tgtype,t.tgenabled) order by t.oid) from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid where c.relnamespace in ('public'::regnamespace,'auth'::regnamespace)));
$$;
create role safety_owner_inherited_sequence_fixture nologin nosuperuser nobypassrls nocreatedb nocreaterole;
do $$ declare t text; seq_in text; role_in text; privilege_in text; before_in jsonb; candidate_in text; failure text; begin
  select body into candidate_in from safety_owner_install_source;
  foreach t in array array['connections','conversations','messages','dating_matches'] loop
    seq_in:=pg_get_serial_sequence('public.'||t,'id');
    assert seq_in is not null;
    foreach role_in in array array['anon','authenticated'] loop
      foreach privilege_in in array array['SELECT','USAGE','UPDATE'] loop
        execute format('grant %s on sequence %s to safety_owner_inherited_sequence_fixture',privilege_in,seq_in);
        execute format('grant safety_owner_inherited_sequence_fixture to %I with inherit true',role_in);
        assert pg_has_role(role_in::name,'safety_owner_inherited_sequence_fixture','USAGE');
        assert has_sequence_privilege('safety_owner_inherited_sequence_fixture',seq_in,privilege_in);
        assert not exists(select 1 from pg_catalog.pg_auth_members where member='safety_owner_inherited_sequence_fixture'::regrole), 'Sequence fixture unexpectedly inherits another role';
        assert not exists(select 1 from pg_catalog.pg_class c cross join lateral pg_catalog.aclexplode(coalesce(c.relacl,'{}'::aclitem[])) acl where c.oid=('public.'||t)::regclass and acl.grantee='safety_owner_inherited_sequence_fixture'::regrole), 'Sequence fixture has an explicit table grant';
        before_in:=pg_temp.safety_install_snapshot();
        begin
          execute candidate_in;
          raise exception 'Inherited sequence-only grant accepted';
        exception when sqlstate '42501' then
          get stacked diagnostics failure=message_text;
          assert failure=format('Inherited sequence bypass requires review: %s %s',role_in,seq_in), 'Wrong negative-install failure';
        end;
        assert to_regnamespace('safety_private') is null and to_regprocedure('public.block_owner_target(uuid)') is null;
        assert pg_temp.safety_install_snapshot()=before_in, 'Rejected install was not atomic';
        assert has_sequence_privilege(role_in::name,seq_in,privilege_in), 'Failed install changed original sequence grant';
        execute format('revoke safety_owner_inherited_sequence_fixture from %I',role_in);
        execute format('revoke %s on sequence %s from safety_owner_inherited_sequence_fixture',privilege_in,seq_in);
      end loop;
    end loop;
  end loop;
end $$;
drop role safety_owner_inherited_sequence_fixture;
do $$ declare candidate_in text; begin select body into candidate_in from safety_owner_install_source; execute candidate_in; end $$;

do $$ declare r text; t text; f text; seq_in text; begin
  assert (select prorettype='pg_catalog.int4'::regtype and not proretset and proargnames=array['conv_id']::text[] from pg_proc where oid='public.mark_conversation_read(bigint)'::regprocedure), 'Historical scalar int signature lost';
  assert (select prorettype='pg_catalog.bool'::regtype and not proretset and proargnames=array['user1','user2']::text[] from pg_proc where oid='public.can_connect(uuid,uuid)'::regprocedure);
  assert (select prorettype='pg_catalog.trigger'::regtype and proconfig @> array['search_path=""'] from pg_proc where oid='public.connections_after_update()'::regprocedure);
  foreach r in array array['anon','authenticated'] loop
    assert not has_schema_privilege(r::name,'safety_private','USAGE');
    foreach t in array array['public.blocks','public.connections','public.conversations','public.messages','public.dating_matches','safety_private.reports','safety_private.revoked_connections'] loop
      assert not has_table_privilege(r::name,t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');
      assert not has_any_column_privilege(r::name,t,'SELECT'); assert not has_any_column_privilege(r::name,t,'INSERT'); assert not has_any_column_privilege(r::name,t,'UPDATE');
      assert not has_any_column_privilege(r::name,t,'REFERENCES');
    end loop;
    foreach t in array array['connections','conversations','messages','dating_matches'] loop
      seq_in:=pg_get_serial_sequence('public.'||t,'id');
      assert seq_in is not null;
      assert not has_sequence_privilege(r::name,seq_in,'SELECT,USAGE,UPDATE'), 'Final effective sequence denial missing';
    end loop;
    foreach f in array array['public.get_incoming_requests()','public.get_sent_requests()','public.get_my_conversations()','public.get_unread_count()','public.mark_conversation_read(bigint)','public.get_dating_match()','public.request_dating_match(uuid)','public.accept_dating_match(bigint)','public.end_dating_match(bigint)'] loop
      assert not has_function_privilege(r::name,f,'EXECUTE'), 'Legacy bypass grant remains';
    end loop;
  end loop;
  assert not has_function_privilege('anon','public.block_owner_target(uuid)','EXECUTE');
  assert has_function_privilege('authenticated','public.block_owner_target(uuid)','EXECUTE');
end $$;

-- Disposable-only privileged bridges model legacy definer DML, never shipped RPCs.
-- They intentionally do not implement safety: the installed table guards must.
create function pg_temp.safety_request(target uuid) returns bigint language plpgsql security definer set search_path='' as $$
declare result bigint; actor uuid:=auth.uid(); begin insert into public.connections(user_a,user_b,initiated_by) values(least(actor,target),greatest(actor,target),actor) returning id into result; return result; end $$;
create function pg_temp.safety_accept(connection_in bigint) returns bigint language plpgsql security definer set search_path='' as $$
declare result bigint; begin update public.connections set status='accepted' where id=connection_in; select c.id into result from public.conversations c join public.connections x on x.user_a=c.user_a and x.user_b=c.user_b where x.id=connection_in; return result; end $$;
create function pg_temp.safety_message(conv bigint,sender uuid) returns bigint language plpgsql security definer set search_path='' as $$
declare result bigint; begin insert into public.messages(conversation_id,sender_id,body) values(conv,sender,'Synthetic retained history') returning id into result; return result; end $$;
create function pg_temp.safety_receipt(message_in bigint) returns void language sql security definer set search_path='' as $$ update public.messages set read_at=statement_timestamp() where id=message_in; $$;
create function pg_temp.safety_retarget(connection_in bigint,target uuid) returns void language sql security definer set search_path='' as $$ update public.connections set user_b=target where id=connection_in; $$;
create function pg_temp.safety_rewrite(message_in bigint) returns void language sql security definer set search_path='' as $$ update public.messages set body='Forged rewrite' where id=message_in; $$;
create function pg_temp.safety_legacy_block(blocker uuid,target uuid) returns void language sql security definer set search_path='' as $$ insert into public.blocks(blocker_id,blocked_id) values(blocker,target); $$;
do $$ begin execute format('grant usage on schema %I to authenticated',(select nspname from pg_namespace where oid=pg_my_temp_schema())); end $$;
revoke all on function pg_temp.safety_request(uuid),pg_temp.safety_accept(bigint),pg_temp.safety_message(bigint,uuid),pg_temp.safety_receipt(bigint),pg_temp.safety_retarget(bigint,uuid),pg_temp.safety_rewrite(bigint),pg_temp.safety_legacy_block(uuid,uuid) from public,anon;
grant execute on function pg_temp.safety_request(uuid),pg_temp.safety_accept(bigint),pg_temp.safety_message(bigint,uuid),pg_temp.safety_receipt(bigint),pg_temp.safety_retarget(bigint,uuid),pg_temp.safety_rewrite(bigint),pg_temp.safety_legacy_block(uuid,uuid) to authenticated;
set local role authenticated;
do $$ declare a uuid:='ca000000-0000-4000-8000-000000000001'; b uuid:='ca000000-0000-4000-8000-000000000002'; c uuid:='ca000000-0000-4000-8000-000000000003'; conn bigint; conv bigint; msg bigint; reverse_msg bigint; block_receipt jsonb; receipt jsonb; payload jsonb; n int; failure text; begin
  perform set_config('request.jwt.claim.sub','',true); perform set_config('request.jwt.claims','{}',true);
  begin perform public.get_owner_blocklist(); raise exception 'No-JWT list accepted'; exception when sqlstate '28000' then null; end;
  begin perform public.block_owner_target(b); raise exception 'No-JWT block accepted'; exception when sqlstate '28000' then null; end;
  perform set_config('request.jwt.claim.sub',a::text,true);
  assert public.get_owner_blocklist()='{"enforcement":"contact-mutations-only","blocks":[]}'::jsonb;
  assert public.can_connect(a,c), 'Malformed-history test pair is unexpectedly blocked';
  begin perform pg_temp.safety_receipt(current_setting('pebble.safety_owner_null_history_id')::bigint); raise exception 'NULL historical sender receipt accepted';
  exception when insufficient_privilege then get stacked diagnostics failure=message_text; assert failure='Historical sender unavailable for receipt authorization', 'Wrong NULL-sender rejection'; end;
  begin perform pg_temp.safety_receipt(current_setting('pebble.safety_owner_foreign_history_id')::bigint); raise exception 'Out-of-conversation historical sender receipt accepted';
  exception when insufficient_privilege then get stacked diagnostics failure=message_text; assert failure='Historical sender unavailable for receipt authorization', 'Wrong foreign-sender rejection'; end;
  conn:=pg_temp.safety_request(b);
  begin perform pg_temp.safety_accept(conn); raise exception 'Initiator accepted own request'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',b::text,true);
  conv:=pg_temp.safety_accept(conn);
  perform set_config('request.jwt.claim.sub',c::text,true);
  begin perform pg_temp.safety_message(conv,c); raise exception 'Foreign conversation send accepted'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',a::text,true);
  begin perform pg_temp.safety_message(conv,b); raise exception 'Forged sender accepted'; exception when insufficient_privilege then null; end;
  msg:=pg_temp.safety_message(conv,a);
  begin perform pg_temp.safety_retarget(conn,c); raise exception 'Connection retarget accepted'; exception when insufficient_privilege then null; end;
  begin perform pg_temp.safety_rewrite(msg); raise exception 'Message rewrite accepted'; exception when insufficient_privilege then null; end;
  begin perform pg_temp.safety_receipt(msg); raise exception 'Sender self receipt accepted';
  exception when insufficient_privilege then get stacked diagnostics failure=message_text; assert failure='Recipient read mutation required', 'Wrong sender-self rejection'; end;
  perform set_config('request.jwt.claim.sub',b::text,true);
  perform pg_temp.safety_receipt(msg);
  reverse_msg:=pg_temp.safety_message(conv,b);
  perform set_config('request.jwt.claim.sub',a::text,true);
  perform pg_temp.safety_receipt(reverse_msg); -- actual recipient succeeds unblocked
  perform set_config('request.jwt.claim.sub',b::text,true);
  block_receipt:=public.block_owner_target(a); -- reverse outgoing row under owner B
  assert block_receipt->>'outgoingBlocked'='true';
  assert public.block_owner_target(a)=block_receipt, 'Block replay changed ledger result';
  perform set_config('request.jwt.claim.sub',a::text,true);
  assert public.get_owner_block_state(b)->>'outgoingBlocked'='false', 'Reverse block leaked into owner state';
  assert public.get_owner_blocklist()->'blocks'='[]'::jsonb;
  begin perform pg_temp.safety_message(conv,a); raise exception 'Reverse-blocked send accepted'; exception when insufficient_privilege then null; end;
  assert not public.can_connect(a,b), 'Reverse block predicate did not exclude';
  begin perform pg_temp.safety_receipt(reverse_msg); raise exception 'Reverse-blocked recipient receipt accepted';
  exception when insufficient_privilege then get stacked diagnostics failure=message_text; assert failure='Message unavailable', 'Wrong reverse-blocked recipient rejection'; end;
  begin perform pg_temp.safety_request(b); raise exception 'Blocked request accepted'; exception when insufficient_privilege then null; end;
  begin perform pg_temp.safety_legacy_block(b,c); raise exception 'Legacy definer forged blocker accepted'; exception when insufficient_privilege then null; end;
  begin insert into public.blocks(blocker_id,blocked_id) values(a,c); raise exception 'Direct block DML accepted'; exception when insufficient_privilege then null; end;
  begin perform public.get_my_conversations(); raise exception 'Undecided historical inbox exposed'; exception when insufficient_privilege then null; end;
  begin perform public.request_dating_match(b); raise exception 'Legacy Dating admission exposed'; exception when insufficient_privilege then null; end;
  perform public.block_owner_target(b);
  assert public.get_owner_blocklist()->'blocks'->0->'displayName'='null'::jsonb, 'Hidden metadata exposed';
  assert public.get_owner_blocklist()->'blocks'->0->>'targetId'=b::text;
  perform public.unblock_owner_target(b); perform public.unblock_owner_target(b);
  perform set_config('request.jwt.claim.sub',b::text,true);
  assert public.get_owner_block_state(a)->>'outgoingBlocked'='true', 'Unblock removed reverse row';
  perform public.unblock_owner_target(a);
  perform set_config('request.jwt.claim.sub',a::text,true);
  begin perform pg_temp.safety_message(conv,a); raise exception 'Unblock resurrected old relationship'; exception when insufficient_privilege then null; end;
  payload:=jsonb_build_object('requestId','cb000000-0000-4000-8000-000000000001','targetId',b,'reason','Other','context',E'Exact\ncontext 🪨');
  receipt:=public.submit_safety_report(payload);
  assert receipt->>'status'='received' and not receipt ? 'context';
  assert public.submit_safety_report(payload)=receipt;
  begin perform public.submit_safety_report(payload||'{"context":"Changed"}'); raise exception 'Idempotency collision accepted'; exception when sqlstate 'SR409' then null; end;
  perform set_config('request.jwt.claim.sub',c::text,true);
  begin perform public.get_owner_safety_report('cb000000-0000-4000-8000-000000000001'); raise exception 'Cross-owner report leaked'; exception when sqlstate 'PT404' then null; end;
  perform set_config('request.jwt.claim.sub',a::text,true);
  for n in 2..5 loop perform public.submit_safety_report(payload||jsonb_build_object('requestId','cb000000-0000-4000-8000-'||lpad(n::text,12,'0'))); end loop;
  begin perform public.submit_safety_report(payload||'{"requestId":"cb000000-0000-4000-8000-000000000006"}'); raise exception 'Report rate bypass'; exception when sqlstate 'SR429' then null; end;
  assert public.submit_safety_report(payload)=receipt, 'Replay incorrectly rate-limited';
end $$;
reset role;
-- Daily limit independently of the hourly limit: executor-owned synthetic old
-- intake rows model prior accepted reports. Browser cannot set these timestamps.
insert into safety_private.reports(actor_id,request_id,target_id,reason,context,received_at)
 select 'ca000000-0000-4000-8000-000000000003',('cc000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
   'ca000000-0000-4000-8000-000000000001','Other','Synthetic older report',statement_timestamp()-interval '2 hours'
 from generate_series(1,20) n;
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claim.sub','ca000000-0000-4000-8000-000000000003',true);
  begin
    perform public.submit_safety_report('{"requestId":"cc000000-0000-4000-8000-000000000021","targetId":"ca000000-0000-4000-8000-000000000001","reason":"Other","context":"Synthetic new report"}');
    raise exception 'Daily rate bypass';
  exception when sqlstate 'SR429' then null; end;
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.messages m join public.conversations c on c.id=m.conversation_id where c.user_a='ca000000-0000-4000-8000-000000000001' and c.user_b='ca000000-0000-4000-8000-000000000002' and m.body='Synthetic retained history')=2, 'Historical message changed/deleted';
  assert (select count(*) from public.messages m join safety_owner_malformed_history h on h.id=m.id where to_jsonb(m)=to_jsonb(h))=2, 'Malformed pre-install history changed';
  assert (select count(*) from safety_private.reports where actor_id='ca000000-0000-4000-8000-000000000001')=5;
  assert (select count(*) from public.connections where user_a='ca000000-0000-4000-8000-000000000001' and user_b='ca000000-0000-4000-8000-000000000002')=1, 'Unblock recreated a connection';
end $$;
rollback;
