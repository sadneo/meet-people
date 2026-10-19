-- ACCEPTANCE SOURCE ONLY. NOT EXECUTED BY THE AGENT. Parent runs with psql -X
-- in an independently verified network-none disposable PostgreSQL instance.
-- Prerequisites/candidate are installed SEPARATELY; this is not migration replay.
-- Parent creates public.detailed_settings_disposable_marker(singleton boolean
-- primary key, purpose text not null), owned by the executor, with exactly one
-- (true,'network-none-detailed-settings-v1') row and no browser mutation grants.
-- Parent separately sets SESSION pebble.detailed_settings_test_target to that
-- same purpose. Marker/GUC attest intent; they do NOT prove network isolation.
-- All synthetic fixture data/settings below roll back. No provider/queue calls.
\set ON_ERROR_STOP on
begin isolation level read committed;
do $$ declare browser_role text; begin
  if current_database() <> 'pebble_detailed_settings_disposable'
    or current_setting('pebble.detailed_settings_test_target',true) is distinct from 'network-none-detailed-settings-v1'
    or to_regclass('public.detailed_settings_disposable_marker') is null then raise exception 'Wrong disposable Settings target'; end if;
  if (select pg_get_userbyid(relowner) from pg_class where oid='public.detailed_settings_disposable_marker'::regclass) <> current_user
    or (select count(*) from public.detailed_settings_disposable_marker) <> 1
    or not exists(select 1 from public.detailed_settings_disposable_marker where singleton and purpose='network-none-detailed-settings-v1') then raise exception 'Invalid parent-owned marker'; end if;
  foreach browser_role in array array['anon','authenticated'] loop
    if has_table_privilege(browser_role::name,'public.detailed_settings_disposable_marker','INSERT,UPDATE,DELETE,TRUNCATE')
      or has_any_column_privilege(browser_role::name,'public.detailed_settings_disposable_marker','INSERT')
      or has_any_column_privilege(browser_role::name,'public.detailed_settings_disposable_marker','UPDATE')
      or exists(select 1 from pg_roles where rolname=browser_role and (rolsuper or rolbypassrls)) then raise exception 'Unsafe marker/browser role'; end if;
  end loop;
  if to_regprocedure('public.get_detailed_settings()') is null or to_regprocedure('public.save_detailed_settings(jsonb)') is null then raise exception 'Install reviewed candidate separately'; end if;
  if exists(select 1 from auth.users where id in ('d1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000002')) then raise exception 'Fixture namespace occupied; do not overwrite'; end if;
end $$;
set local plpgsql.check_asserts = on;

do $$ declare browser_role text; signature text; begin
  foreach browser_role in array array['anon','authenticated'] loop
    assert not has_table_privilege(browser_role::name,'public.detailed_settings','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');
    assert not has_any_column_privilege(browser_role::name,'public.detailed_settings','SELECT');
    assert not has_any_column_privilege(browser_role::name,'public.detailed_settings','INSERT');
    assert not has_any_column_privilege(browser_role::name,'public.detailed_settings','UPDATE');
    foreach signature in array array['public.valid_detailed_settings(jsonb)','public.detailed_settings_masters(jsonb)','public.effective_detailed_settings(jsonb,jsonb)'] loop
      assert not has_function_privilege(browser_role::name,signature,'EXECUTE'), 'Exposed helper';
    end loop;
  end loop;
  assert (select relrowsecurity from pg_class where oid='public.detailed_settings'::regclass);
  assert not has_function_privilege('anon','public.get_detailed_settings()','EXECUTE');
  assert not has_function_privilege('anon','public.save_detailed_settings(jsonb)','EXECUTE');
  assert has_function_privilege('authenticated','public.get_detailed_settings()','EXECUTE');
  assert has_function_privilege('authenticated','public.save_detailed_settings(jsonb)','EXECUTE');
end $$;
insert into auth.users(id) values ('d1000000-0000-4000-8000-000000000001'),('d1000000-0000-4000-8000-000000000002');

set local role authenticated;
do $$ declare off_in jsonb := '{"messages":false,"plans":false,"matches":false,"friendsDiscovery":false,"datingDiscovery":false}'; begin
  perform set_config('request.jwt.claim.sub','',true); perform set_config('request.jwt.claims','{}',true);
  begin perform public.get_detailed_settings(); raise exception 'No-JWT read accepted'; exception when sqlstate '28000' then null; end;
  begin perform public.save_detailed_settings('{}'); raise exception 'No-JWT save accepted'; exception when sqlstate '28000' then null; end;
  perform set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
  assert public.get_detailed_settings()=jsonb_build_object('revision',0,'settings',off_in,'masters',null,'effective',off_in), 'Virtual settings/default consent mismatch';
  assert public.save_detailed_settings('{"expectedRevision":0,"settings":{"messages":true,"plans":true,"matches":true,"friendsDiscovery":true,"datingDiscovery":true}}')->'effective'=off_in, 'Missing masters enabled effects';
end $$;
reset role;
do $$ begin
  assert (select revision=1 from public.detailed_settings where user_id='d1000000-0000-4000-8000-000000000001');
  assert not exists(select 1 from public.account_settings where user_id='d1000000-0000-4000-8000-000000000001'), 'Detailed save created legacy masters';
  assert not exists(select 1 from public.detailed_settings where user_id='d1000000-0000-4000-8000-000000000002');
end $$;
-- The owner B default read must not insert a resource or copy owner A settings.
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000002',true);
  assert public.get_detailed_settings()->>'revision'='0';
  assert public.get_detailed_settings()->'settings'->>'datingDiscovery'='false';
end $$;
reset role;
do $$ begin assert not exists(select 1 from public.detailed_settings where user_id='d1000000-0000-4000-8000-000000000002'), 'GET wrote defaults'; end $$;

-- Synthetic persisted legacy row, not get_account's defaulted document. This is
-- a stand-in for legacy writer effects, NOT proof of full legacy RPC integration.
insert into public.account_settings(user_id,preferences,settings,completed) values
 ('d1000000-0000-4000-8000-000000000001','{"intents":[],"usual":[],"distance":"5 miles","group":"Either"}',
  '{"notifications":true,"availability":true,"discoverable":true,"location":false}','[]');
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
  assert public.get_detailed_settings()->'effective'=public.get_detailed_settings()->'settings', 'Persisted on masters not applied';
end $$;
reset role;
update public.account_settings set settings='{"notifications":false,"availability":true,"discoverable":true,"location":false}' where user_id='d1000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
  assert public.get_detailed_settings()->'effective'='{"messages":false,"plans":false,"matches":false,"friendsDiscovery":true,"datingDiscovery":true}'::jsonb, 'Masters crossed category/mode domains';
end $$;
reset role;
update public.account_settings set settings='{"notifications":false,"availability":false,"discoverable":false,"location":true}' where user_id='d1000000-0000-4000-8000-000000000001';
create temporary table detailed_settings_legacy_before as select to_jsonb(a) as snapshot from public.account_settings a where user_id='d1000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$
declare base jsonb; choices jsonb := '{"messages":true,"plans":true,"matches":true,"friendsDiscovery":true,"datingDiscovery":true}';
  field_name text; bad jsonb; patch jsonb;
begin
  perform set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
  base := public.get_detailed_settings();
  assert base->>'revision'='1' and base->'settings'=choices, 'Legacy masters overwrote detailed choices';
  assert base->'effective'='{"messages":false,"plans":false,"matches":false,"friendsDiscovery":false,"datingDiscovery":false}'::jsonb, 'Global off did not dominate';
  foreach field_name in array array['messages','plans','matches','friendsDiscovery','datingDiscovery'] loop
    for patch in select value from jsonb_array_elements('[null,1,"true",{},[]]'::jsonb) loop
      bad := jsonb_set(choices,array[field_name],patch);
      begin perform public.save_detailed_settings(jsonb_build_object('expectedRevision',1,'settings',bad)); raise exception 'Invalid detailed boolean accepted'; exception when sqlstate '22023' then null; end;
      assert public.get_detailed_settings()=base;
    end loop;
    begin perform public.save_detailed_settings(jsonb_build_object('expectedRevision',1,'settings',choices-field_name)); raise exception 'Missing choice accepted'; exception when sqlstate '22023' then null; end;
    assert public.get_detailed_settings()=base;
  end loop;
  for patch in select value from jsonb_array_elements('[{"user_id":"other"},{"actorId":"other"},{"id":"other"},{"masters":{}},{"effective":{}},{"downtime":true},{"revision":2},{"expectedRevision":null},{"expectedRevision":-1},{"expectedRevision":1.5},{"expectedRevision":"1"},{"expectedRevision":9007199254740991},{"settings":null},{"settings":[]}]'::jsonb) loop
    begin perform public.save_detailed_settings(jsonb_build_object('expectedRevision',1,'settings',choices)||patch); raise exception 'Invalid envelope accepted'; exception when sqlstate '22023' then null; end;
    assert public.get_detailed_settings()=base;
  end loop;
  foreach field_name in array array['expectedRevision','settings'] loop
    begin perform public.save_detailed_settings(jsonb_build_object('expectedRevision',1,'settings',choices)-field_name); raise exception 'Missing envelope key accepted'; exception when sqlstate '22023' then null; end;
  end loop;
  begin perform public.save_detailed_settings(null); raise exception 'SQL NULL accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.save_detailed_settings('null'); raise exception 'JSON null accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.save_detailed_settings(jsonb_build_object('expectedRevision',1,'settings',choices||'{"availability":true}'::jsonb)); raise exception 'Legacy operational field accepted'; exception when sqlstate '22023' then null; end;
  choices := '{"messages":false,"plans":true,"matches":false,"friendsDiscovery":false,"datingDiscovery":false}';
  base := public.save_detailed_settings(jsonb_build_object('expectedRevision',1,'settings',choices));
  assert base->>'revision'='2' and base->'settings'=choices;
  foreach field_name in array array['0','1','99'] loop
    begin perform public.save_detailed_settings(jsonb_build_object('expectedRevision',field_name::int,'settings',choices)); raise exception 'Stale CAS accepted'; exception when sqlstate 'DS409' then null; end;
    assert public.get_detailed_settings()=base, 'Stale CAS changed settings';
  end loop;
end $$;
reset role;
do $$ begin
  assert (select to_jsonb(a)=(select snapshot from detailed_settings_legacy_before) from public.account_settings a where user_id='d1000000-0000-4000-8000-000000000001'), 'Detailed save changed legacy operational/private fields';
end $$;
-- Malformed persisted legacy settings are UNKNOWN, never default-on.
update public.account_settings set settings='{"notifications":true,"discoverable":true}' where user_id='d1000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
  assert public.get_detailed_settings()->'masters'='null'::jsonb;
  assert public.get_detailed_settings()->'effective'='{"messages":false,"plans":false,"matches":false,"friendsDiscovery":false,"datingDiscovery":false}'::jsonb;
end $$;
reset role;

set local role authenticated;
do $$ declare owner_a jsonb; result jsonb; begin
  perform set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
  owner_a := public.get_detailed_settings();
  perform set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000002',true);
  assert public.get_detailed_settings()->>'revision'='0';
  result := public.save_detailed_settings('{"expectedRevision":0,"settings":{"messages":false,"plans":false,"matches":false,"friendsDiscovery":false,"datingDiscovery":false}}');
  assert result->>'revision'='1' and result->'masters'='null'::jsonb, 'Owner B inherited A masters or revision';
  perform set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
  assert public.get_detailed_settings()=owner_a, 'Owner B write overwrote A';
end $$;
reset role;

set local role authenticated;
do $$ declare sql_in text; begin
  foreach sql_in in array array[
    'select * from public.detailed_settings','select settings from public.detailed_settings',
    'insert into public.detailed_settings(user_id,revision,settings) values (''d1000000-0000-4000-8000-000000000001'',1,''{}'')',
    'update public.detailed_settings set revision=revision','delete from public.detailed_settings','truncate public.detailed_settings',
    'select public.valid_detailed_settings(''{}'')','select public.detailed_settings_masters(''{}'')','select public.effective_detailed_settings(''{}'',null)'
  ] loop begin execute sql_in; raise exception 'Authenticated direct access accepted'; exception when insufficient_privilege then null; end; end loop;
end $$;
reset role;
set local role anon;
do $$ declare sql_in text; begin
  foreach sql_in in array array[
    'select public.get_detailed_settings()','select public.save_detailed_settings(''{}'')',
    'select * from public.detailed_settings','select revision from public.detailed_settings',
    'update public.detailed_settings set revision=revision','delete from public.detailed_settings','truncate public.detailed_settings',
    'select public.valid_detailed_settings(''{}'')','select public.detailed_settings_masters(''{}'')','select public.effective_detailed_settings(''{}'',null)'
  ] loop begin execute sql_in; raise exception 'Anonymous access accepted'; exception when insufficient_privilege then null; end; end loop;
end $$;
reset role;
rollback;

-- Separate transactions select unsupported isolation before any query.
begin isolation level repeatable read;
do $$ begin
  if current_database() <> 'pebble_detailed_settings_disposable' or current_setting('pebble.detailed_settings_test_target',true) is distinct from 'network-none-detailed-settings-v1'
    or not exists(select 1 from public.detailed_settings_disposable_marker where singleton and purpose='network-none-detailed-settings-v1') then raise exception 'Wrong disposable target'; end if;
end $$;
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true); perform set_config('request.jwt.claims','{}',true);
  begin perform public.save_detailed_settings('{}'); raise exception 'REPEATABLE READ accepted'; exception when sqlstate '25001' then null; end;
end $$;
reset role;
rollback;
begin isolation level serializable;
do $$ begin
  if current_database() <> 'pebble_detailed_settings_disposable' or current_setting('pebble.detailed_settings_test_target',true) is distinct from 'network-none-detailed-settings-v1'
    or not exists(select 1 from public.detailed_settings_disposable_marker where singleton and purpose='network-none-detailed-settings-v1') then raise exception 'Wrong disposable target'; end if;
end $$;
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true); perform set_config('request.jwt.claims','{}',true);
  begin perform public.save_detailed_settings('{}'); raise exception 'SERIALIZABLE accepted'; exception when sqlstate '25001' then null; end;
end $$;
reset role;
rollback;
