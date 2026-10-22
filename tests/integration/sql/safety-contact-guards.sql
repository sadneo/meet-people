-- ACCEPTANCE SOURCE ONLY. NOT EXECUTED BY THE AGENT. Parent uses psql -X from
-- the approved repository root in an independently verified network-none DB.
-- This installs ONLY the actual historical 04/08 prerequisite files plus the
-- candidate inside one rolled-back test transaction. NOT full migration replay,
-- live Auth/PostgREST, block-race closure or application to an existing app DB.
-- Parent prepares matching CORE TABLES/RLS/roles/auth.uid and the unrelated pure
-- shared_interest_labels(uuid,uuid) dependency (not exercised here). Historical
-- 04/08 functions/triggers and this candidate must NOT already be installed.
-- Parent separately creates public.safety_contact_disposable_marker(singleton
-- boolean primary key,purpose text not null), executor-owned, browser mutations
-- denied, with exactly (true,'network-none-safety-contact-v1'). Parent separately
-- sets SESSION pebble.safety_contact_test_target to that purpose. These are intent
-- attestations, NOT proof of network isolation. No marker/GUC self-authorization.
-- Fixed synthetic fixture namespaces must be absent. Fixture rows/DDL roll back;
-- existing identity sequences may advance inside this disposable scaffold.
\set ON_ERROR_STOP on
begin isolation level read committed;
do $$
declare role_in text; signature text; table_in text;
begin
  if current_database()<>'pebble_safety_contact_disposable'
    or current_setting('pebble.safety_contact_test_target',true) is distinct from 'network-none-safety-contact-v1'
    or to_regclass('public.safety_contact_disposable_marker') is null then raise exception 'Wrong explicit disposable safety target'; end if;
  if (select pg_get_userbyid(relowner) from pg_class where oid='public.safety_contact_disposable_marker'::regclass)<>current_user
    or (select count(*) from public.safety_contact_disposable_marker)<>1
    or not exists(select 1 from public.safety_contact_disposable_marker where singleton and purpose='network-none-safety-contact-v1') then raise exception 'Invalid parent-owned safety marker'; end if;
  foreach role_in in array array['anon','authenticated'] loop
    if has_table_privilege(role_in::name,'public.safety_contact_disposable_marker','INSERT,UPDATE,DELETE,TRUNCATE')
      or has_any_column_privilege(role_in::name,'public.safety_contact_disposable_marker','INSERT')
      or has_any_column_privilege(role_in::name,'public.safety_contact_disposable_marker','UPDATE')
      or exists(select 1 from pg_roles where rolname=role_in and (rolsuper or rolbypassrls)) then raise exception 'Unsafe marker/browser role'; end if;
  end loop;
  foreach table_in in array array['public.profiles','public.user_interests','public.connections','public.conversations','public.messages','public.blocks'] loop
    if to_regclass(table_in) is null then raise exception 'Reviewed core table prerequisite missing'; end if;
  end loop;
  if to_regprocedure('auth.uid()') is null or to_regprocedure('public.shared_interest_labels(uuid,uuid)') is null then raise exception 'Reviewed unrelated historical dependency missing'; end if;
  foreach table_in in array array['public.profiles','public.blocks'] loop
    if not (select relrowsecurity from pg_class where oid=table_in::regclass)
      or not has_table_privilege('authenticated',table_in,'SELECT') then raise exception 'Historical RLS/read privilege prerequisite missing'; end if;
  end loop;
  -- Fresh scaffold only: never overwrite an unknown existing function/trigger.
  foreach signature in array array['public.profiles_set_updated_at()','public.can_connect(uuid,uuid)',
    'public.connection_requests_today()','public.connections_before_insert()','public.connections_after_update()',
    'public.get_incoming_requests()','public.get_sent_requests()','public.search_people(text,integer)',
    'public.get_my_conversations()','public.mark_conversation_read(bigint)','public.get_unread_count()',
    'public.safety_pair_allowed(uuid,uuid)','public.get_owner_blocklist()',
    'public.safety_incompatible_mark_read_fixture(bigint)','public.safety_incompatible_can_connect_fixture(uuid,uuid)',
    'public.safety_historical_mark_read_fixture(bigint)','public.safety_incompatible_set_mark_fixture(bigint)',
    'public.safety_historical_can_connect_fixture(uuid,uuid)'] loop
    if to_regprocedure(signature) is not null then raise exception 'Fixture/function namespace occupied; do not overwrite'; end if;
  end loop;
  if exists(select 1 from pg_trigger where not tgisinternal and tgname in ('trg_profiles_set_updated_at','trg_connections_before_insert','trg_connections_after_update'))
    or exists(select 1 from auth.users where id::text like 'c3100000-0000-4000-8000-%')
    or exists(select 1 from public.profiles where username in ('safety-acceptance-a','safety-acceptance-b','safety-acceptance-c')) then raise exception 'Synthetic namespace occupied'; end if;
end $$;
set local plpgsql.check_asserts = on;
set local standard_conforming_strings = on;
-- Real historical files use unqualified CREATE names, so reproduce public schema
-- placement in this trusted disposable scaffold, not an operator's custom path.
set local search_path = public, pg_catalog;

-- Client-side source reads only; no server filesystem read, shell/program, env or
-- provider configuration. CSV control delimiters preserve SQL quotes/backslashes.
create temporary table safety_hist_connections_source(line_number bigint generated always as identity,line text not null);
create temporary table safety_hist_messaging_source(line_number bigint generated always as identity,line text not null);
create temporary table safety_candidate_source(line_number bigint generated always as identity,line text not null);
\copy safety_hist_connections_source(line) from 'supabase/migrations/20260925000004_connection_logic.sql' with (format csv,delimiter E'\x01',quote E'\x02',escape E'\x02',null E'\x03')
\copy safety_hist_messaging_source(line) from 'supabase/migrations/20260925000008_messaging.sql' with (format csv,delimiter E'\x01',quote E'\x02',escape E'\x02',null E'\x03')
\copy safety_candidate_source(line) from 'docs/safety-contact-guards-migration.sql' with (format csv,delimiter E'\x01',quote E'\x02',escape E'\x02',null E'\x03')
create temporary table safety_install_source(kind text primary key,body text not null);
insert into safety_install_source values
  ('connections',(select string_agg(line,E'\n' order by line_number)||E'\n' from safety_hist_connections_source)),
  ('messaging',(select string_agg(line,E'\n' order by line_number)||E'\n' from safety_hist_messaging_source));
do $$ begin
  assert (select count(*) from safety_candidate_source where lower(btrim(line))='begin;')=1;
  assert (select count(*) from safety_candidate_source where lower(btrim(line))='commit;')=1;
end $$;
-- Execute the actual candidate contents, omitting ONLY its two outer transaction
-- boundary lines so installations/rejection cases stay in our rollback scope.
insert into safety_install_source values ('candidate_without_transaction',
  (select string_agg(line,E'\n' order by line_number)||E'\n' from safety_candidate_source where lower(btrim(line)) not in ('begin;','commit;')));
do $$ declare source_in text; begin
  select body into source_in from safety_install_source where kind='connections';
  execute source_in; -- Actual historical can_connect and its historical companions.
  assert (select prorettype='pg_catalog.bool'::regtype and not proretset and proargmodes is null and proargnames=array['user1','user2']::text[]
    from pg_proc where oid='public.can_connect(uuid,uuid)'::regprocedure);
end $$;
create temporary table safety_original_oids(name text primary key,function_oid oid not null);
insert into safety_original_oids values ('can_connect','public.can_connect(uuid,uuid)'::regprocedure::oid);

-- Deliberately incompatible NEGATIVE fixture, never a substitute for the actual
-- historical positive case. Rename fixtures instead of dropping dependencies.
create function public.mark_conversation_read(conv_id bigint) returns void language plpgsql as $$ begin return; end $$;
do $$ declare candidate_in text; message_in text; begin
  select body into candidate_in from safety_install_source where kind='candidate_without_transaction';
  begin execute candidate_in; raise exception 'Incompatible mark signature accepted';
  exception when sqlstate '42P13' then
    get stacked diagnostics message_in = message_text;
    assert message_in='Historical safety function signature mismatch', 'Expected explicit preflight, not incidental replacement failure';
  end;
  assert to_regprocedure('public.safety_pair_allowed(uuid,uuid)') is null, 'Rejected install left helper';
  assert to_regprocedure('public.get_owner_blocklist()') is null, 'Rejected install left getter';
  assert (select prorettype='pg_catalog.void'::regtype from pg_proc where oid='public.mark_conversation_read(bigint)'::regprocedure);
end $$;
alter function public.mark_conversation_read(bigint) rename to safety_incompatible_mark_read_fixture;
do $$ declare source_in text; begin
  select body into source_in from safety_install_source where kind='messaging';
  execute source_in; -- Actual historical mark_conversation_read, RETURNS int.
  assert (select prorettype='pg_catalog.int4'::regtype and not proretset and proargmodes is null and proargnames=array['conv_id']::text[]
    from pg_proc where oid='public.mark_conversation_read(bigint)'::regprocedure);
end $$;
insert into safety_original_oids values ('mark_read','public.mark_conversation_read(bigint)'::regprocedure::oid);

-- A SETOF int4 has the same element type but is NOT the historical scalar shape.
alter function public.mark_conversation_read(bigint) rename to safety_historical_mark_read_fixture;
create function public.mark_conversation_read(conv_id bigint) returns setof int language sql as $$ select 1; $$;
do $$ declare candidate_in text; message_in text; begin
  select body into candidate_in from safety_install_source where kind='candidate_without_transaction';
  begin execute candidate_in; raise exception 'SETOF mark signature accepted';
  exception when sqlstate '42P13' then
    get stacked diagnostics message_in=message_text;
    assert message_in='Historical safety function signature mismatch';
  end;
  assert to_regprocedure('public.safety_pair_allowed(uuid,uuid)') is null;
end $$;
alter function public.mark_conversation_read(bigint) rename to safety_incompatible_set_mark_fixture;
alter function public.safety_historical_mark_read_fixture(bigint) rename to mark_conversation_read;

alter function public.can_connect(uuid,uuid) rename to safety_historical_can_connect_fixture;
create function public.can_connect(user1 uuid,user2 uuid) returns int language sql as $$ select 1; $$;
do $$ declare candidate_in text; message_in text; begin
  select body into candidate_in from safety_install_source where kind='candidate_without_transaction';
  begin execute candidate_in; raise exception 'Incompatible can_connect signature accepted';
  exception when sqlstate '42P13' then
    get stacked diagnostics message_in = message_text;
    assert message_in='Historical safety function signature mismatch';
  end;
  assert to_regprocedure('public.safety_pair_allowed(uuid,uuid)') is null;
end $$;
alter function public.can_connect(uuid,uuid) rename to safety_incompatible_can_connect_fixture;
alter function public.safety_historical_can_connect_fixture(uuid,uuid) rename to can_connect;
do $$ declare candidate_in text; begin
  select body into candidate_in from safety_install_source where kind='candidate_without_transaction';
  execute candidate_in;
  assert 'public.can_connect(uuid,uuid)'::regprocedure::oid=(select function_oid from safety_original_oids where name='can_connect'), 'Changed historical can_connect OID';
  assert 'public.mark_conversation_read(bigint)'::regprocedure::oid=(select function_oid from safety_original_oids where name='mark_read'), 'Changed historical mark_read OID';
  assert (select prorettype='pg_catalog.int4'::regtype and not proretset and prosecdef and provolatile='v'
    from pg_proc where oid='public.mark_conversation_read(bigint)'::regprocedure), 'Installed scalar int4 signature/security mismatch';
  assert (select prorettype='pg_catalog.bool'::regtype and not proretset and prosecdef and provolatile='s'
    from pg_proc where oid='public.can_connect(uuid,uuid)'::regprocedure);
  assert not has_function_privilege('authenticated','public.safety_pair_allowed(uuid,uuid)','EXECUTE');
  assert not has_function_privilege('anon','public.safety_pair_allowed(uuid,uuid)','EXECUTE');
  assert not has_function_privilege('anon','public.can_connect(uuid,uuid)','EXECUTE');
  assert not has_function_privilege('anon','public.mark_conversation_read(bigint)','EXECUTE');
  assert not has_function_privilege('anon','public.get_owner_blocklist()','EXECUTE');
  assert public.safety_pair_allowed(null,null) is false;
  assert public.safety_pair_allowed('c3100000-0000-4000-8000-000000000001','c3100000-0000-4000-8000-000000000001') is false;
end $$;

-- Synthetic only, rolled back. No actual provider, Auth HTTP or matching calls.
insert into auth.users(id) values ('c3100000-0000-4000-8000-000000000001'),('c3100000-0000-4000-8000-000000000002'),('c3100000-0000-4000-8000-000000000003');
insert into public.profiles(id,username,display_name,is_active) values
 ('c3100000-0000-4000-8000-000000000001','safety-acceptance-a','Synthetic A',true),
 ('c3100000-0000-4000-8000-000000000002','safety-acceptance-b','Synthetic B',true),
 ('c3100000-0000-4000-8000-000000000003','safety-acceptance-c','Synthetic C',true);
do $$ declare first_conv bigint; foreign_conv bigint; begin
  insert into public.conversations(user_a,user_b) values('c3100000-0000-4000-8000-000000000001','c3100000-0000-4000-8000-000000000002') returning id into first_conv;
  insert into public.conversations(user_a,user_b) values('c3100000-0000-4000-8000-000000000002','c3100000-0000-4000-8000-000000000003') returning id into foreign_conv;
  perform set_config('pebble.safety_conv_ab',first_conv::text,true);
  perform set_config('pebble.safety_conv_bc',foreign_conv::text,true);
  insert into public.messages(conversation_id,sender_id,body) values
    (first_conv,'c3100000-0000-4000-8000-000000000002','Synthetic incoming'),
    (first_conv,'c3100000-0000-4000-8000-000000000001','Synthetic outgoing'),
    (foreign_conv,'c3100000-0000-4000-8000-000000000002','Synthetic foreign');
end $$;

set local role authenticated;
do $$ declare conv bigint := current_setting('pebble.safety_conv_ab')::bigint; message_in text; begin
  perform set_config('request.jwt.claim.sub','',true); perform set_config('request.jwt.claims','{}',true);
  begin perform public.can_connect('c3100000-0000-4000-8000-000000000001','c3100000-0000-4000-8000-000000000002'); raise exception 'No-JWT pair accepted'; exception when sqlstate '28000' then null; end;
  begin perform public.mark_conversation_read(conv); raise exception 'No-JWT read accepted'; exception when sqlstate '28000' then null; end;
  begin perform public.get_owner_blocklist(); raise exception 'No-JWT list accepted'; exception when sqlstate '28000' then null; end;
  perform set_config('request.jwt.claim.sub','c3100000-0000-4000-8000-000000000003',true);
  begin perform public.can_connect('c3100000-0000-4000-8000-000000000001','c3100000-0000-4000-8000-000000000002'); raise exception 'Third-pair probe accepted'; exception when insufficient_privilege then null; end;
  begin perform public.mark_conversation_read(conv); raise exception 'Cross-actor read accepted'; exception when insufficient_privilege then null; end;
  begin perform public.safety_pair_allowed('c3100000-0000-4000-8000-000000000001','c3100000-0000-4000-8000-000000000002'); raise exception 'Private helper exposed'; exception when insufficient_privilege then null; end;
  -- Even a genuinely empty outgoing set stays unavailable, never fake [] success.
  begin perform public.get_owner_blocklist(); raise exception 'Unavailable empty resource returned success'; exception when sqlstate 'PT503' then null; end;
end $$;
reset role;
do $$ begin assert not exists(select 1 from public.messages where read_at is not null), 'Denied read changed receipts'; end $$;

insert into public.blocks(blocker_id,blocked_id) values('c3100000-0000-4000-8000-000000000002','c3100000-0000-4000-8000-000000000001');
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claim.sub','c3100000-0000-4000-8000-000000000001',true);
  assert not exists(select 1 from public.blocks where blocker_id='c3100000-0000-4000-8000-000000000002'), 'Fixture did not reproduce reverse-row RLS hiding';
  assert public.can_connect('c3100000-0000-4000-8000-000000000001','c3100000-0000-4000-8000-000000000002') is false, 'Reverse block missed';
  begin perform public.mark_conversation_read(current_setting('pebble.safety_conv_ab')::bigint); raise exception 'Observed blocked read accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin assert not exists(select 1 from public.messages where read_at is not null); end $$;
delete from public.blocks where blocker_id='c3100000-0000-4000-8000-000000000002' and blocked_id='c3100000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claim.sub','c3100000-0000-4000-8000-000000000001',true);
  assert public.can_connect('c3100000-0000-4000-8000-000000000001','c3100000-0000-4000-8000-000000000002') is true;
  assert exists(select 1 from public.profiles where id='c3100000-0000-4000-8000-000000000002'), 'Active target visibility prerequisite missing';
  assert public.can_connect('c3100000-0000-4000-8000-000000000001',null) is false;
  assert public.mark_conversation_read(current_setting('pebble.safety_conv_ab')::bigint)=1, 'Membership-authorized incoming update failed';
  assert public.mark_conversation_read(current_setting('pebble.safety_conv_ab')::bigint)=0, 'Repeated read changed receipts again';
  begin perform public.mark_conversation_read(current_setting('pebble.safety_conv_bc')::bigint); raise exception 'Foreign conversation read accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  assert exists(select 1 from public.messages where body='Synthetic incoming' and read_at is not null);
  assert not exists(select 1 from public.messages where body in ('Synthetic outgoing','Synthetic foreign') and read_at is not null);
  assert not exists(select 1 from pg_locks where pid=pg_backend_pid() and relation='public.blocks'::regclass
    and mode in ('ShareLock','ShareRowExclusiveLock','ExclusiveLock','AccessExclusiveLock')), 'Reintroduced table-wide block guard';
end $$;

-- Outgoing storage must NOT become a live-name oracle when target is hidden or
-- renamed. Missing/bad legacy metadata also fails the ENTIRE resource unavailable.
insert into public.blocks(blocker_id,blocked_id) values('c3100000-0000-4000-8000-000000000001','c3100000-0000-4000-8000-000000000002');
update public.profiles set is_active=false,display_name='Hidden renamed target' where id='c3100000-0000-4000-8000-000000000002';
set local role authenticated;
do $$ declare message_in text; begin
  perform set_config('request.jwt.claim.sub','c3100000-0000-4000-8000-000000000001',true);
  assert not exists(select 1 from public.profiles where id='c3100000-0000-4000-8000-000000000002'), 'Fixture profile was not hidden by real RLS';
  begin perform public.get_owner_blocklist(); raise exception 'Hidden renamed target disclosed';
  exception when sqlstate 'PT503' then get stacked diagnostics message_in=message_text; assert position('Hidden renamed target' in message_in)=0; end;
end $$;
reset role;
update public.blocks set created_at=null where blocker_id='c3100000-0000-4000-8000-000000000001';
update public.profiles set display_name='' where id='c3100000-0000-4000-8000-000000000002';
set local role authenticated;
do $$ begin
  begin perform public.get_owner_blocklist(); raise exception 'Missing metadata returned fabricated/partial success'; exception when sqlstate 'PT503' then null; end;
end $$;
reset role;
set local role anon;
do $$ declare sql_in text; begin
  perform set_config('request.jwt.claim.sub','',true); perform set_config('request.jwt.claims','{}',true);
  foreach sql_in in array array['select public.can_connect(null,null)','select public.mark_conversation_read(1)','select public.get_owner_blocklist()','select public.safety_pair_allowed(null,null)'] loop
    begin execute sql_in; raise exception 'Anonymous safety execution accepted'; exception when insufficient_privilege then null; end;
  end loop;
end $$;
reset role;
rollback;
