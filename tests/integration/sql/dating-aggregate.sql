-- ACCEPTANCE SOURCE ONLY, never executed by agent. Parent separately installs
-- reviewed candidate/prerequisites in verified network-none disposable PostgreSQL.
-- Requires executor-owned marker with exactly (true,'network-none-dating-v1'),
-- no browser mutation grants, and separate SESSION pebble.dating_test_target.
-- Marker/GUC prove intent, NOT actual network isolation. All fixtures roll back.
\set ON_ERROR_STOP on
begin isolation level read committed;
do $$ declare r text; begin
  if current_database()<>'pebble_dating_disposable' or current_setting('pebble.dating_test_target',true) is distinct from 'network-none-dating-v1'
    or to_regclass('public.dating_disposable_marker') is null then raise exception 'Wrong Dating disposable target'; end if;
  if (select pg_get_userbyid(relowner) from pg_class where oid='public.dating_disposable_marker'::regclass)<>current_user
    or (select count(*) from public.dating_disposable_marker)<>1
    or not exists(select 1 from public.dating_disposable_marker where singleton and purpose='network-none-dating-v1') then raise exception 'Invalid marker'; end if;
  foreach r in array array['anon','authenticated'] loop
    if has_table_privilege(r::name,'public.dating_disposable_marker','INSERT,UPDATE,DELETE,TRUNCATE')
      or has_any_column_privilege(r::name,'public.dating_disposable_marker','INSERT')
      or has_any_column_privilege(r::name,'public.dating_disposable_marker','UPDATE')
      or exists(select 1 from pg_roles where rolname=r and (rolsuper or rolbypassrls)) then raise exception 'Unsafe disposable role/marker'; end if;
  end loop;
  if to_regprocedure('public.save_dating_preferences(jsonb)') is null then raise exception 'Install reviewed candidate separately'; end if;
  if exists(select 1 from auth.users where id in ('da000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000002','da000000-0000-4000-8000-000000000003','da000000-0000-4000-8000-000000000004'))
    or exists(select 1 from public.profiles where username in ('dating-fixture-a','dating-fixture-b'))
    or exists(select 1 from public.dating_search_location_refs where id in ('da100000-0000-4000-8000-000000000001','da100000-0000-4000-8000-000000000002')) then raise exception 'Fixture namespace occupied'; end if;
end $$;
set local plpgsql.check_asserts=on;
do $$ declare r text; t text; f text; h numeric; begin
  foreach r in array array['anon','authenticated'] loop
    foreach t in array array['public.dating_owner_aggregates','public.dating_search_location_refs'] loop
      assert (select relrowsecurity from pg_class where oid=t::regclass);
      assert not has_table_privilege(r::name,t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');
      assert not has_any_column_privilege(r::name,t,'SELECT');
      assert not has_any_column_privilege(r::name,t,'INSERT');
      assert not has_any_column_privilege(r::name,t,'UPDATE');
    end loop;
    foreach f in array array['public.dating_default_profile()','public.dating_clear_targets(jsonb)','public.dating_targets(jsonb)','public.dating_complete(jsonb)','public.dating_reciprocal_targets(jsonb,jsonb)','public.valid_dating_profile(jsonb)','public.valid_dating_search(jsonb)','public.dating_campus_date(timestamptz)','public.dating_adult_on(date,date)','public.dating_location_resolved(uuid,jsonb,text)'] loop
      assert not has_function_privilege(r::name,f,'EXECUTE');
    end loop;
  end loop;
  assert not has_function_privilege('anon','public.get_dating_preferences()','EXECUTE');
  assert not has_function_privilege('anon','public.save_dating_preferences(jsonb)','EXECUTE');
  assert has_function_privilege('authenticated','public.get_dating_preferences()','EXECUTE');
  assert (select provolatile='s' from pg_proc where oid='public.dating_campus_date(timestamptz)'::regprocedure);
  assert public.dating_campus_date(timestamptz '2026-01-15 04:59:59+00')=date '2026-01-14';
  assert public.dating_campus_date(timestamptz '2026-01-15 05:00:00+00')=date '2026-01-15';
  assert public.dating_campus_date(timestamptz '2026-07-15 03:59:59+00')=date '2026-07-14';
  assert public.dating_campus_date(timestamptz '2026-07-15 04:00:00+00')=date '2026-07-15';
  assert not public.dating_adult_on(date '2008-01-15',public.dating_campus_date(timestamptz '2026-01-15 04:59:59+00'));
  assert public.dating_adult_on(date '2008-01-15',public.dating_campus_date(timestamptz '2026-01-15 05:00:00+00'));
  assert not public.dating_adult_on(date '2008-07-15',public.dating_campus_date(timestamptz '2026-07-15 03:59:59+00'));
  assert public.dating_adult_on(date '2008-07-15',public.dating_campus_date(timestamptz '2026-07-15 04:00:00+00'));
  assert public.valid_dating_profile(public.dating_default_profile()); -- null height
  foreach h in array array[24::numeric,60,107] loop
    assert public.valid_dating_profile(jsonb_set(public.dating_default_profile(),'{heightInches}',to_jsonb(h)));
  end loop;
  foreach h in array array[0::numeric,23,108,24.5] loop
    assert not public.valid_dating_profile(jsonb_set(public.dating_default_profile(),'{heightInches}',to_jsonb(h)));
  end loop;
  assert public.dating_adult_on(date '2008-10-19',date '2026-10-19');
  assert not public.dating_adult_on(date '2008-10-20',date '2026-10-19');
  assert not public.dating_adult_on(date '2008-02-29',date '2026-02-28');
  assert public.dating_adult_on(date '2008-02-29',date '2026-03-01');
  assert not public.dating_adult_on('infinity'::date,date '2026-10-19');
  assert not public.dating_adult_on(null,date '2026-10-19');
  assert not public.dating_adult_on(date '2027-01-01',date '2026-10-19');
  assert public.dating_clear_targets('{"gender":"Man","sexuality":"Straight"}')='["Woman"]'::jsonb;
  assert public.dating_clear_targets('{"gender":"Woman","sexuality":"Gay"}')='["Woman"]'::jsonb;
  assert public.dating_clear_targets('{"gender":"Legacy identity","sexuality":"Straight"}') is null;
  assert public.dating_clear_targets('{"gender":"man","sexuality":"Straight"}') is null;
  assert public.dating_targets('{"gender":"Legacy identity","sexuality":"Queer","clarifiedTargets":["Man"]}')='["Man"]'::jsonb;
  assert public.dating_reciprocal_targets('{"gender":"Man","sexuality":"Straight"}','{"gender":"Woman","sexuality":"Straight"}');
  assert not public.dating_reciprocal_targets('{"gender":"Man","sexuality":"Straight"}','{"gender":"Woman","sexuality":"Lesbian"}');
  assert public.dating_reciprocal_targets('{"gender":"Legacy identity","sexuality":"Queer","clarifiedTargets":["Man"]}','{"gender":"Man","sexuality":"Queer","clarifiedTargets":["Legacy identity"]}');
end $$;
insert into auth.users(id) values ('da000000-0000-4000-8000-000000000001'),('da000000-0000-4000-8000-000000000002'),('da000000-0000-4000-8000-000000000003'),('da000000-0000-4000-8000-000000000004');
insert into public.profiles(id,username,display_name,birthdate,location_city) values
  ('da000000-0000-4000-8000-000000000001','dating-fixture-a','Synthetic A',null,'Fixture home'),
  ('da000000-0000-4000-8000-000000000002','dating-fixture-b','Synthetic B',date '2000-01-01','Fixture home');
-- Explicit trusted resolver fixtures; no real geography or issuance API involved.
insert into public.dating_search_location_refs(id,user_id,source,area_label,latitude,longitude,usable) values
  ('da100000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000001','temporary','Synthetic campus',0,0,true),
  ('da100000-0000-4000-8000-000000000002','da000000-0000-4000-8000-000000000002','temporary','Synthetic campus',0,0,true);
set local role authenticated;
do $$ declare before_in jsonb; p jsonb; s jsonb; payload jsonb; result jsonb; begin
  perform set_config('request.jwt.claim.sub','',true); perform set_config('request.jwt.claims','{}',true);
  begin perform public.get_dating_preferences(); raise exception 'No-JWT GET accepted'; exception when sqlstate '28000' then null; end;
  begin perform public.save_dating_preferences('{}'); raise exception 'No-JWT PUT accepted'; exception when sqlstate '28000' then null; end;
  perform set_config('request.jwt.claim.sub','da000000-0000-4000-8000-000000000001',true);
  before_in:=public.get_dating_preferences();
  assert before_in->>'profileRevision'='0' and before_in->>'searchRevision'='0';
  assert before_in->'eligibility'->>'adult'='false' and before_in->>'effectiveEnabled'='false';
  assert not before_in ? 'birthdate';
  p:='{"gender":" Legacy identity 🪨 ","sexuality":"Queer","intent":"Long-term relationship","style":"Monogamy","heightInches":60,"visibility":{"gender":true,"sexuality":true,"height":true},"clarifiedTargets":["Man"],"enabled":false}';
  s:='{"ageMin":18,"ageMax":99,"radiusMiles":5,"searchArea":{"source":"temporary","areaLabel":"Synthetic campus","resolvedLocationRef":null}}';
  payload:=jsonb_build_object('expectedProfileRevision',0,'expectedSearchRevision',0,'profile',p,'search',s);
  result:=public.save_dating_preferences(payload);
  assert result->'profile'=p and result->'search'=s and result->>'profileRevision'='1' and result->>'searchRevision'='1';
  assert result->'profile'->>'heightInches'='60' and result->>'effectiveEnabled'='false', 'First clarified identity/zero remainder rejected';
  p:=jsonb_set(p,'{clarifiedTargets}','["Man"]');
  payload:=jsonb_build_object('expectedProfileRevision',1,'expectedSearchRevision',1,'profile',p,'search',s);
  result:=public.save_dating_preferences(payload);
  assert result->>'profileRevision'='2' and result->>'searchRevision'='2';
  before_in:=result;
  begin perform public.save_dating_preferences(jsonb_set(payload,'{expectedProfileRevision}','2')); raise exception 'Stale search accepted'; exception when sqlstate 'DA409' then null; end;
  begin perform public.save_dating_preferences(jsonb_set(payload,'{expectedSearchRevision}','2')); raise exception 'Stale profile accepted'; exception when sqlstate 'DA409' then null; end;
  payload:=jsonb_set(jsonb_set(payload,'{expectedProfileRevision}','2'),'{expectedSearchRevision}','2');
  begin perform public.save_dating_preferences(payload||'{"user_id":"da000000-0000-4000-8000-000000000002"}'); raise exception 'Actor injection accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.save_dating_preferences(jsonb_set(payload,'{search,ageMin}','100')); raise exception 'Invalid search accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.save_dating_preferences(jsonb_set(payload,'{profile,heightInches}','0.5')); raise exception 'Fractional height accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.save_dating_preferences(jsonb_set(payload,'{profile,sexuality}','"Questioning"')); raise exception 'Stale clarification accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.save_dating_preferences(jsonb_set(payload,'{profile,enabled}','true')); raise exception 'Unresolved enable accepted'; exception when sqlstate '22023' then null; end;
  payload:=jsonb_set(payload,'{search,searchArea,resolvedLocationRef}','"da100000-0000-4000-8000-000000000002"');
  begin perform public.save_dating_preferences(payload); raise exception 'Foreign ref accepted'; exception when sqlstate '22023' then null; end;
  payload:=jsonb_set(payload,'{search,searchArea,resolvedLocationRef}','"da100000-0000-4000-8000-000000000001"');
  begin perform public.save_dating_preferences(jsonb_set(payload,'{search,searchArea,areaLabel}','"Different label"')); raise exception 'Wrong-label ref accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.save_dating_preferences(jsonb_set(payload,'{profile,enabled}','true')); raise exception 'Missing DOB enable accepted'; exception when sqlstate '22023' then null; end;
  assert public.get_dating_preferences()=before_in, 'Failed aggregate partially changed a resource';
  begin perform 1 from public.dating_owner_aggregates; raise exception 'Direct SELECT accepted'; exception when insufficient_privilege then null; end;
  begin update public.dating_owner_aggregates set profile='{}'; raise exception 'Direct UPDATE accepted'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub','da000000-0000-4000-8000-000000000002',true);
  assert public.get_dating_preferences()->>'profileRevision'='0', 'Cross-actor leak';
end $$;
reset role;
-- Authoritative DOB only; a Dating request never supplies/rewrites it.
update public.profiles set birthdate=date '2000-01-01' where id='da000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ declare v jsonb; payload jsonb; begin
  perform set_config('request.jwt.claim.sub','da000000-0000-4000-8000-000000000001',true);
  v:=public.get_dating_preferences();
  payload:=jsonb_build_object('expectedProfileRevision',2,'expectedSearchRevision',2,'profile',jsonb_set(v->'profile','{enabled}','true'),
    'search',jsonb_set(v->'search','{searchArea,resolvedLocationRef}','"da100000-0000-4000-8000-000000000001"'));
  v:=public.save_dating_preferences(payload);
  assert v->>'profileRevision'='3' and v->>'searchRevision'='3' and v->>'effectiveEnabled'='true';
end $$;
reset role;
update public.dating_search_location_refs set usable=false where id='da100000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ declare v jsonb; begin
  v:=public.get_dating_preferences();
  assert v->'profile'->>'enabled'='true' and v->>'effectiveEnabled'='false', 'Revoked ref failed to mask stored consent';
end $$;
reset role;
update public.profiles set birthdate=(public.dating_campus_date(transaction_timestamp()) - interval '17 years')::date where id='da000000-0000-4000-8000-000000000001';
update public.dating_search_location_refs set usable=true where id='da100000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ declare v jsonb; begin
  v:=public.get_dating_preferences();
  assert v->'eligibility'->>'adult'='false' and v->>'effectiveEnabled'='false';
  begin
    perform public.save_dating_preferences(jsonb_build_object('expectedProfileRevision',3,'expectedSearchRevision',3,'profile',v->'profile','search',v->'search'));
    raise exception 'Underage enable accepted';
  exception when sqlstate '22023' then null; end;
  assert public.get_dating_preferences()=v, 'Underage save partially wrote';
end $$;
reset role;
-- Canonical fields and other resources were never written by aggregate saves.
do $$ begin
  assert (select username='dating-fixture-a' and display_name='Synthetic A' and location_city='Fixture home' and bio is null and avatar_url is null from public.profiles where id='da000000-0000-4000-8000-000000000001');
  assert not exists(select 1 from public.dating_owner_aggregates where user_id='da000000-0000-4000-8000-000000000002');
end $$;
-- A persisted empty identity also permits initial clarification in one save.
-- Partial prior identities (either label set) retain the conservative edit guard.
set local role authenticated;
do $$ declare v jsonb; p jsonb; payload jsonb; field_in text; owner_in text; begin
  perform set_config('request.jwt.claim.sub','da000000-0000-4000-8000-000000000002',true);
  v:=public.get_dating_preferences();
  perform public.save_dating_preferences(jsonb_build_object('expectedProfileRevision',0,'expectedSearchRevision',0,'profile',v->'profile','search',null));
  p:='{"gender":"Legacy identity","sexuality":"Queer","intent":"Long-term relationship","style":"Monogamy","heightInches":60,"visibility":{"gender":false,"sexuality":false,"height":false},"clarifiedTargets":["Man"],"enabled":false}';
  payload:=jsonb_build_object('expectedProfileRevision',1,'expectedSearchRevision',1,'profile',p,'search',null);
  v:=public.save_dating_preferences(payload);
  assert v->'profile'=p and v->>'profileRevision'='2' and v->>'searchRevision'='2', 'First clarification from empty draft rejected';
  foreach field_in in array array['gender','sexuality'] loop
    owner_in:=case when field_in='gender' then 'da000000-0000-4000-8000-000000000003' else 'da000000-0000-4000-8000-000000000004' end;
    perform set_config('request.jwt.claim.sub',owner_in,true);
    v:=public.get_dating_preferences();
    v:=public.save_dating_preferences(jsonb_build_object('expectedProfileRevision',0,'expectedSearchRevision',0,'profile',jsonb_set(v->'profile',array[field_in],p->field_in),'search',null));
    begin perform public.save_dating_preferences(payload); raise exception 'Partial identity reused clarification'; exception when sqlstate '22023' then null; end;
    assert public.get_dating_preferences()=v, 'Partial transition wrote one side';
    v:=public.save_dating_preferences(jsonb_set(payload,'{profile,clarifiedTargets}','[]'));
    assert v->>'profileRevision'='2' and v->>'searchRevision'='2';
    v:=public.save_dating_preferences(payload||'{"expectedProfileRevision":2,"expectedSearchRevision":2}');
    assert v->'profile'=p and v->>'profileRevision'='3' and v->>'searchRevision'='3';
  end loop;
end $$;
reset role;
rollback;
