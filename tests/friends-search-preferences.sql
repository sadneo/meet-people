-- ACCEPTANCE SOURCE ONLY. NOT EXECUTED BY THE AGENT. Parent runs with psql -X
-- against an independently verified NETWORK-NONE disposable PostgreSQL instance.
-- This is NOT an installer, full migration replay, live PostgREST or concurrency test.
-- Parent must separately install reviewed prerequisites/candidate and create:
-- public.friends_preferences_disposable_marker(singleton boolean primary key,
-- purpose text not null), containing ONLY (true,'network-none-friends-preferences-v1'),
-- owned by the test executor, with no anon/authenticated mutation grants.
-- Parent must also SET the SESSION (outside this file/transaction) GUC
-- pebble.friends_preferences_test_target = 'network-none-friends-preferences-v1'.
-- A marker is an operator attestation, NOT proof of network isolation by itself.
-- Fixed fixture UUIDs/usernames must be absent. All fixture changes roll back.
\set ON_ERROR_STOP on
begin;
do $$
declare browser_role text;
begin
  if current_database() <> 'pebble_friends_preferences_disposable'
    or current_setting('pebble.friends_preferences_test_target',true) is distinct from 'network-none-friends-preferences-v1'
    or current_setting('server_encoding') <> 'UTF8'
    or to_regclass('public.friends_preferences_disposable_marker') is null then
    raise exception 'Wrong/missing explicitly approved disposable target';
  end if;
  if (select pg_get_userbyid(relowner) from pg_class where oid='public.friends_preferences_disposable_marker'::regclass) <> current_user
    or (select count(*) from public.friends_preferences_disposable_marker) <> 1
    or not exists(select 1 from public.friends_preferences_disposable_marker where singleton and purpose='network-none-friends-preferences-v1') then
    raise exception 'Invalid parent-owned disposable marker';
  end if;
  foreach browser_role in array array['anon','authenticated'] loop
    if has_table_privilege(browser_role::name,'public.friends_preferences_disposable_marker','INSERT,UPDATE,DELETE,TRUNCATE')
      or has_any_column_privilege(browser_role::name,'public.friends_preferences_disposable_marker','INSERT')
      or has_any_column_privilege(browser_role::name,'public.friends_preferences_disposable_marker','UPDATE')
      or exists(select 1 from pg_roles where rolname=browser_role and (rolsuper or rolbypassrls)) then
      raise exception 'Unsafe marker/browser role fixture';
    end if;
  end loop;
  if to_regprocedure('public.get_friends_search_preferences()') is null
    or to_regprocedure('public.save_friends_search_preferences(jsonb)') is null
    or to_regprocedure('public.valid_friends_search_preferences(jsonb)') is null then
    raise exception 'Reviewed candidate must be installed separately';
  end if;
  if exists(select 1 from auth.users where id in ('e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002'))
    or exists(select 1 from public.profiles where username in ('friends-acceptance-a','friends-acceptance-b'))
    or exists(select 1 from public.friends_search_location_refs where id::text like 'e2000000-0000-4000-8000-%') then
    raise exception 'Synthetic fixture namespace already occupied; do not overwrite';
  end if;
end $$;
set local plpgsql.check_asserts = on;
set local standard_conforming_strings = on;

-- Effective privileges include PUBLIC/inherited grants. Do not fix grants here
-- merely to make acceptance pass: failure requires parent ownership/ACL review.
do $$
declare browser_role text; relation_name text;
begin
  foreach browser_role in array array['anon','authenticated'] loop
    foreach relation_name in array array['public.friends_search_preferences','public.friends_search_location_refs'] loop
      assert not has_table_privilege(browser_role::name,relation_name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'), 'Unexpected browser table privilege';
      assert not has_any_column_privilege(browser_role::name,relation_name,'SELECT'), 'Unexpected browser column SELECT';
      assert not has_any_column_privilege(browser_role::name,relation_name,'INSERT'), 'Unexpected browser column INSERT';
      assert not has_any_column_privilege(browser_role::name,relation_name,'UPDATE'), 'Unexpected browser column UPDATE';
      assert (select relrowsecurity from pg_class where oid=relation_name::regclass), 'Missing RLS';
    end loop;
    assert not has_function_privilege(browser_role::name,'public.valid_friends_search_preferences(jsonb)','EXECUTE'), 'Exposed validator';
    assert not has_function_privilege(browser_role::name,'public.profile_language_key(text)','EXECUTE'), 'Exposed comparison helper';
  end loop;
  assert not has_function_privilege('anon','public.get_friends_search_preferences()','EXECUTE');
  assert not has_function_privilege('anon','public.save_friends_search_preferences(jsonb)','EXECUTE');
  assert has_function_privilege('authenticated','public.get_friends_search_preferences()','EXECUTE');
  assert has_function_privilege('authenticated','public.save_friends_search_preferences(jsonb)','EXECUTE');
end $$;

-- Direct internal-validator calls here are by the trusted test executor only.
do $$
declare prefs jsonb := '{"ageMin":18,"ageMax":99,"radiusMiles":100,"goals":[],"searchArea":{"source":"home","resolvedLocationRef":null}}';
  value_in text;
begin
  assert public.valid_friends_search_preferences(null) is false;
  assert public.valid_friends_search_preferences('null') is false;
  foreach value_in in array array['00000000-0000-0000-0000-000000000000','ffffffff-ffff-ffff-ffff-ffffffffffff','E2000000-0000-4000-8000-000000000001'] loop
    assert public.valid_friends_search_preferences(jsonb_set(prefs,'{searchArea,resolvedLocationRef}',to_jsonb(value_in))), 'Valid UUID format rejected';
  end loop;
  foreach value_in in array array['FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF','e2000000-0000-9000-8000-000000000001',E'e2000000-0000-4000-8000-000000000001\n'] loop
    assert public.valid_friends_search_preferences(jsonb_set(prefs,'{searchArea,resolvedLocationRef}',to_jsonb(value_in))) is false, 'Invalid UUID format accepted';
  end loop;
end $$;

-- Synthetic only; no interests, embedding, queue, provider or real Auth requests.
insert into auth.users(id) values
  ('e1000000-0000-4000-8000-000000000001'),('e1000000-0000-4000-8000-000000000002');
insert into public.profiles(id,username,display_name,birthdate,location_city) values
  ('e1000000-0000-4000-8000-000000000001','friends-acceptance-a','Synthetic A','2000-01-01','Fixture home A'),
  ('e1000000-0000-4000-8000-000000000002','friends-acceptance-b','Synthetic B','2001-01-01','Fixture home B');
create temporary table friends_acceptance_profiles_before as
  select id,to_jsonb(p) as snapshot from public.profiles p
    where id in ('e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002');
insert into public.friends_search_location_refs(id,user_id,source,area_label,latitude,longitude,usable) values
  ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','home','Fixture home A',0,0,true),
  ('e2000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000002','home','Fixture home A',0,0,true),
  ('e2000000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000001','home','Fixture home A',0,0,false),
  ('e2000000-0000-4000-8000-000000000004','e1000000-0000-4000-8000-000000000001','temporary',E' Exact temporary\narea ',0,1,true),
  ('e2000000-0000-4000-8000-000000000005','e1000000-0000-4000-8000-000000000001','home','Old fixture home',0,0,true),
  ('e2000000-0000-4000-8000-000000000006','e1000000-0000-4000-8000-000000000001','temporary','Fixture home A',0,0,true);

set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claim.sub','',true); perform set_config('request.jwt.claims','{}',true);
  begin perform public.get_friends_search_preferences(); raise exception 'No-JWT read accepted'; exception when sqlstate '28000' then null; end;
  begin perform public.save_friends_search_preferences('{}'); raise exception 'No-JWT write accepted'; exception when sqlstate '28000' then null; end;
  perform set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000001',true);
  assert public.get_friends_search_preferences()='{"revision":0,"preferences":null}'::jsonb, 'Empty GET invented choices';
end $$;
reset role;
do $$ begin
  assert not exists(select 1 from public.friends_search_preferences where user_id='e1000000-0000-4000-8000-000000000001'), 'Empty GET inserted row';
end $$;
set local role authenticated;
do $$
declare prefs jsonb := '{"ageMin":18,"ageMax":99,"radiusMiles":100,"goals":[" Board games\nstrategy "],"searchArea":{"source":"home","resolvedLocationRef":null}}';
  base jsonb; bad jsonb; patch jsonb; field_name text; null_value jsonb; invalid_json text;
begin
  perform set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000001',true);
  perform set_config('request.jwt.claims','{}',true);
  base := public.save_friends_search_preferences(jsonb_build_object('expectedRevision',0,'preferences',prefs));
  assert base=jsonb_build_object('revision',1,'preferences',prefs), 'First CAS/exact labels failed';
  -- Missing keys and JSON null are different; reject both at every required level.
  foreach field_name in array array['ageMin','ageMax','radiusMiles','goals','searchArea'] loop
    foreach null_value in array array[null::jsonb,'null'::jsonb] loop
      bad := case when null_value is null then prefs-field_name else jsonb_set(prefs,array[field_name],null_value) end;
      begin perform public.save_friends_search_preferences(jsonb_build_object('expectedRevision',1,'preferences',bad)); raise exception 'Missing/null preference field accepted'; exception when sqlstate '22023' then null; end;
      assert public.get_friends_search_preferences()=base, 'Invalid field partially changed snapshot';
    end loop;
  end loop;
  foreach field_name in array array['source','resolvedLocationRef'] loop
    bad := jsonb_set(prefs,'{searchArea}',(prefs->'searchArea')-field_name);
    begin perform public.save_friends_search_preferences(jsonb_build_object('expectedRevision',1,'preferences',bad)); raise exception 'Missing area key accepted'; exception when sqlstate '22023' then null; end;
    assert public.get_friends_search_preferences()=base;
  end loop;
  for patch in select value from jsonb_array_elements('[
    {"ageMin":17},{"ageMax":100},{"ageMin":20,"ageMax":19},{"ageMin":18.5},{"ageMin":"18"},
    {"radiusMiles":0},{"radiusMiles":101},{"radiusMiles":1.5},{"goals":{}},{"goals":[null]},
    {"goals":[""]},{"goals":["\uFEFF\u00A0"]},{"goals":["Same","Same"]},
    {"mode":"dating"},{"interests":[]},{"availability":[]},{"birthdate":"2000-01-01"},
    {"searchArea":null},{"searchArea":[]},{"searchArea":{"source":null,"resolvedLocationRef":null}},
    {"searchArea":{"source":"HOME","resolvedLocationRef":null}},
    {"searchArea":{"source":"home","resolvedLocationRef":false}},
    {"searchArea":{"source":"home","resolvedLocationRef":"not-a-uuid"}},
    {"searchArea":{"source":"home","resolvedLocationRef":"FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF"}},
    {"searchArea":{"source":"home","resolvedLocationRef":"e2000000-0000-4000-8000-000000000001\n"}},
    {"searchArea":{"source":"home","resolvedLocationRef":null,"latitude":0}},
    {"searchArea":{"source":"home","resolvedLocationRef":null,"areaLabel":"Overwrite home"}},
    {"searchArea":{"source":"temporary","resolvedLocationRef":null}},
    {"searchArea":{"source":"temporary","resolvedLocationRef":null,"areaLabel":null}},
    {"searchArea":{"source":"temporary","resolvedLocationRef":null,"areaLabel":" "}}
  ]'::jsonb) loop
    begin perform public.save_friends_search_preferences(jsonb_build_object('expectedRevision',1,'preferences',prefs||patch)); raise exception 'Invalid preference accepted'; exception when sqlstate '22023' then null; end;
    assert public.get_friends_search_preferences()=base;
  end loop;
  for patch in select value from jsonb_array_elements('[null,{},[],42,true,"scalar",{"preferences":null},{"preferences":[]},{"expectedRevision":null},{"expectedRevision":"1"},{"expectedRevision":-1},{"expectedRevision":1.5},{"expectedRevision":9007199254740991},{"actorId":"other"},{"user_id":"other"},{"id":"other"},{"mode":"dating"},{"revision":1}]'::jsonb) loop
    bad := case when jsonb_typeof(patch) <> 'object' or patch='{}'::jsonb then patch else jsonb_build_object('expectedRevision',1,'preferences',prefs)||patch end;
    begin perform public.save_friends_search_preferences(bad); raise exception 'Invalid write envelope accepted'; exception when sqlstate '22023' then null; end;
    assert public.get_friends_search_preferences()=base;
  end loop;
  foreach field_name in array array['expectedRevision','preferences'] loop
    bad := jsonb_build_object('expectedRevision',1,'preferences',prefs)-field_name;
    begin perform public.save_friends_search_preferences(bad); raise exception 'Missing write key accepted'; exception when sqlstate '22023' then null; end;
  end loop;
  begin perform public.save_friends_search_preferences(null); raise exception 'SQL NULL accepted'; exception when sqlstate '22023' then null; end;
  -- Invalid scalar encoding is rejected by JSONB before the RPC can be entered.
  foreach invalid_json in array array['{"goals":["\u0000"]}','{"goals":["\uD800"]}','{"goals":["\uDC00"]}'] loop
    begin perform invalid_json::jsonb; raise exception 'Unrepresentable JSONB string accepted';
    exception when sqlstate '22P05' or sqlstate '22P02' or sqlstate '22021' then null; end;
  end loop;
  bad := jsonb_set(prefs,'{goals}',jsonb_build_array(repeat('x',121)));
  begin perform public.save_friends_search_preferences(jsonb_build_object('expectedRevision',1,'preferences',bad)); raise exception 'Long goal accepted'; exception when sqlstate '22023' then null; end;
  bad := jsonb_set(prefs,'{goals}',(select jsonb_agg(n::text) from generate_series(1,21) n));
  begin perform public.save_friends_search_preferences(jsonb_build_object('expectedRevision',1,'preferences',bad)); raise exception 'Too many goals accepted'; exception when sqlstate '22023' then null; end;
  assert public.get_friends_search_preferences()=base;
  -- Selected ref ownership/usability/source/label: all failures remain atomic.
  foreach field_name in array array['e2000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000003','e2000000-0000-4000-8000-000000000005','e2000000-0000-4000-8000-000000000006','e2000000-0000-4000-8000-000000000088'] loop
    bad := jsonb_set(prefs,'{searchArea,resolvedLocationRef}',to_jsonb(field_name));
    begin perform public.save_friends_search_preferences(jsonb_build_object('expectedRevision',1,'preferences',bad)); raise exception 'Invalid/foreign ref accepted'; exception when sqlstate '22023' then null; end;
    assert public.get_friends_search_preferences()=base;
  end loop;
  prefs := jsonb_set(prefs,'{searchArea,resolvedLocationRef}','"e2000000-0000-4000-8000-000000000001"');
  base := public.save_friends_search_preferences(jsonb_build_object('expectedRevision',1,'preferences',prefs));
  assert base=jsonb_build_object('revision',2,'preferences',prefs), 'Valid home ref failed';
  bad := jsonb_set(prefs,'{searchArea}','{"source":"temporary","resolvedLocationRef":"e2000000-0000-4000-8000-000000000004","areaLabel":"Wrong label"}');
  begin perform public.save_friends_search_preferences(jsonb_build_object('expectedRevision',2,'preferences',bad)); raise exception 'Temporary label mismatch accepted'; exception when sqlstate '22023' then null; end;
  assert public.get_friends_search_preferences()=base;
  prefs := jsonb_set(prefs,'{searchArea}','{"source":"temporary","resolvedLocationRef":"e2000000-0000-4000-8000-000000000004","areaLabel":" Exact temporary\narea "}');
  prefs := jsonb_set(prefs,'{goals}',jsonb_build_array(repeat(chr(128512),120),'Goal',' goal '));
  prefs := prefs || '{"ageMin":18,"ageMax":18,"radiusMiles":1}'::jsonb;
  base := public.save_friends_search_preferences(jsonb_build_object('expectedRevision',2,'preferences',prefs));
  assert base=jsonb_build_object('revision',3,'preferences',prefs), 'Boundary/Unicode/temporary round trip failed';
  foreach field_name in array array['0','1','2','99'] loop
    begin perform public.save_friends_search_preferences(jsonb_build_object('expectedRevision',field_name::int,'preferences',prefs)); raise exception 'Stale/future CAS accepted'; exception when sqlstate 'FP409' then null; end;
    assert public.get_friends_search_preferences()=base, 'Stale CAS partially changed snapshot';
  end loop;
  -- Cross-owner read/write isolation; the caller never supplies a target user ID.
  perform set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000002',true);
  assert public.get_friends_search_preferences()='{"revision":0,"preferences":null}'::jsonb, 'Cross-owner read leak';
  prefs := jsonb_set(prefs,'{searchArea}','{"source":"home","resolvedLocationRef":null}');
  assert public.save_friends_search_preferences(jsonb_build_object('expectedRevision',0,'preferences',prefs))->>'revision'='1';
  perform set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000001',true);
  assert public.get_friends_search_preferences()=base, 'Other owner write changed A';
end $$;
reset role;

-- Coordinate range/non-finite/NULL constraints, using only failed synthetic inserts.
do $$
declare point record;
begin
  for point in select * from (values
    (91::float8,0::float8),(-91,0),(0,181),(0,-181),
    ('NaN'::float8,0),('Infinity'::float8,0),('-Infinity'::float8,0),
    (0,'NaN'::float8),(0,'Infinity'::float8),(0,'-Infinity'::float8),
    (null::float8,0),(0,null::float8)
  ) points(latitude,longitude) loop
    begin
      insert into public.friends_search_location_refs(id,user_id,source,area_label,latitude,longitude,usable)
        values('e2000000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000001','home','Fixture home A',point.latitude,point.longitude,true);
      raise exception 'Invalid coordinates accepted';
    exception when check_violation or not_null_violation then null; end;
  end loop;
  assert not exists(select 1 from public.friends_search_location_refs where id='e2000000-0000-4000-8000-000000000099');
  assert not exists(select 1 from friends_acceptance_profiles_before b join public.profiles p using(id) where b.snapshot is distinct from to_jsonb(p)), 'Preferences modified profile/home/DOB';
  assert (select count(*) from public.friends_search_preferences where user_id in ('e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002'))=2;
end $$;

set local role authenticated;
do $$
declare sql_in text;
begin
  foreach sql_in in array array[
    'select * from public.friends_search_preferences', 'select revision from public.friends_search_preferences',
    'select * from public.friends_search_location_refs', 'select latitude,longitude from public.friends_search_location_refs',
    'insert into public.friends_search_preferences(user_id,revision,preferences) values (''e1000000-0000-4000-8000-000000000001'',1,''{}'')',
    'update public.friends_search_preferences set revision=revision', 'delete from public.friends_search_preferences', 'truncate public.friends_search_preferences',
    'insert into public.friends_search_location_refs(id) values (''e2000000-0000-4000-8000-000000000099'')',
    'update public.friends_search_location_refs set usable=false', 'delete from public.friends_search_location_refs', 'truncate public.friends_search_location_refs',
    'select public.valid_friends_search_preferences(''{}''::jsonb)', 'select public.profile_language_key(''Synthetic'')'
  ] loop
    begin execute sql_in; raise exception 'Authenticated direct access accepted'; exception when insufficient_privilege then null; end;
  end loop;
end $$;
reset role;
set local role anon;
do $$
declare sql_in text;
begin
  perform set_config('request.jwt.claim.sub','',true); perform set_config('request.jwt.claims','{}',true);
  foreach sql_in in array array[
    'select public.get_friends_search_preferences()', 'select public.save_friends_search_preferences(''{}''::jsonb)',
    'select public.valid_friends_search_preferences(''{}''::jsonb)', 'select public.profile_language_key(''Synthetic'')',
    'select * from public.friends_search_preferences', 'select revision from public.friends_search_preferences',
    'select * from public.friends_search_location_refs', 'select latitude from public.friends_search_location_refs',
    'insert into public.friends_search_preferences(user_id,revision,preferences) values (''e1000000-0000-4000-8000-000000000001'',1,''{}'')',
    'update public.friends_search_preferences set revision=revision', 'delete from public.friends_search_preferences', 'truncate public.friends_search_preferences',
    'insert into public.friends_search_location_refs(id) values (''e2000000-0000-4000-8000-000000000099'')',
    'update public.friends_search_location_refs set usable=false', 'delete from public.friends_search_location_refs', 'truncate public.friends_search_location_refs'
  ] loop
    begin execute sql_in; raise exception 'Anonymous direct access accepted'; exception when insufficient_privilege then null; end;
  end loop;
end $$;
reset role;
rollback;

-- Isolation must be selected BEFORE any query in each separate transaction.
-- Fixture rows above have rolled back; these calls test rejection before writes,
-- not real JWT provisioning. Target guards run again; no connection is changed.
begin isolation level repeatable read;
do $$ begin
  if current_database() <> 'pebble_friends_preferences_disposable'
    or current_setting('pebble.friends_preferences_test_target',true) is distinct from 'network-none-friends-preferences-v1'
    or not exists(select 1 from public.friends_preferences_disposable_marker where singleton and purpose='network-none-friends-preferences-v1') then raise exception 'Wrong disposable target'; end if;
end $$;
set local plpgsql.check_asserts = on;
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000001',true); perform set_config('request.jwt.claims','{}',true);
  begin perform public.save_friends_search_preferences('{}'); raise exception 'REPEATABLE READ accepted'; exception when sqlstate '25001' then null; end;
end $$;
reset role;
do $$ begin assert not exists(select 1 from public.friends_search_preferences where user_id='e1000000-0000-4000-8000-000000000001'); end $$;
rollback;

begin isolation level serializable;
do $$ begin
  if current_database() <> 'pebble_friends_preferences_disposable'
    or current_setting('pebble.friends_preferences_test_target',true) is distinct from 'network-none-friends-preferences-v1'
    or not exists(select 1 from public.friends_preferences_disposable_marker where singleton and purpose='network-none-friends-preferences-v1') then raise exception 'Wrong disposable target'; end if;
end $$;
set local plpgsql.check_asserts = on;
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000001',true); perform set_config('request.jwt.claims','{}',true);
  begin perform public.save_friends_search_preferences('{}'); raise exception 'SERIALIZABLE accepted'; exception when sqlstate '25001' then null; end;
end $$;
reset role;
do $$ begin assert not exists(select 1 from public.friends_search_preferences where user_id='e1000000-0000-4000-8000-000000000001'); end $$;
rollback;
