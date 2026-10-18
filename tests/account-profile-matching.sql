-- REVIEW CANDIDATE ONLY. Parent runs in a disposable database after candidate install.
-- No real user rows, queue lookup, HTTP, provider or embedding requests.
begin;
insert into auth.users(id) values
 ('e0000000-0000-4000-8000-000000000001'),
 ('e0000000-0000-4000-8000-000000000002');
insert into public.profiles(id, username, display_name, latitude, longitude, is_active)
values ('e0000000-0000-4000-8000-000000000002', 'candidate-other', 'Other', 40, -73, true);
set local role authenticated;
select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000001',true);
do $$
declare p jsonb := '{"username":"candidate-sam","display_name":"Sam","bio":null,"avatar_url":null}';
 legacy jsonb; before_account jsonb; patch jsonb;
begin
 assert public.get_account_profile() is null, 'No fabricated account identity';
 assert public.get_matchmaking_profile() is null, 'No fabricated matching profile';
 assert public.save_account_profile(p) = p, 'Account round trip';
 assert public.get_matchmaking_profile() is null, 'Account save must not create legacy matching profile';
 for patch in select value from jsonb_array_elements('[
  {"username":""},{"display_name":null},{"bio":42},{"avatar_url":"http://unsafe.test/avatar"},
  {"avatar_url":"https://example.test:99999/avatar"},{"interests":[]},{"id":"other"}
 ]'::jsonb) loop
  begin
   perform public.save_account_profile(p || patch);
   raise exception 'Invalid identity accepted';
  exception when sqlstate '22023' then null; end;
  assert public.get_account_profile() = p, 'Invalid save changed identity';
 end loop;
 legacy := p || '{"birthdate":null,"location_city":null,"interests":[],"availability":[{"dow":6,"start_time":"21:00:00","end_time":"24:00:00"}]}'::jsonb;
 assert public.save_matchmaking_profile(legacy) = legacy, 'Old RPC full shape still works';
 -- Direct/old clients cannot change canonical identity through matching writes.
 perform public.save_matchmaking_profile(legacy || '{"display_name":"Stale","bio":"Stale bio"}');
 assert public.get_account_profile() = p, 'Old matching write changed canonical account';
 assert public.get_matchmaking_profile()->>'display_name' = 'Sam', 'Legacy projection diverged';
 p := p || '{"display_name":"New Sam","bio":"Real account bio"}';
 assert public.save_account_profile(p) = p;
 legacy := public.get_matchmaking_profile();
 assert legacy->>'display_name' = 'New Sam' and legacy->>'bio' = 'Real account bio';
 assert legacy->'availability' = '[{"dow":6,"start_time":"21:00:00","end_time":"24:00:00"}]'::jsonb;
 before_account := p;
 begin
  perform public.save_account_profile(p || '{"username":"candidate-other"}');
  raise exception 'Legacy username collision accepted';
 exception when unique_violation then null; end;
 assert public.get_account_profile() = before_account, 'Collision partially changed canonical identity';
 assert public.get_matchmaking_profile() = legacy, 'Collision partially changed legacy projection';
 perform set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000002',true);
 assert public.get_account_profile() is null, 'Getter leaked another account';
 assert not exists(select 1 from public.account_profiles), 'RLS leaked account';
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.get_account_profile(); raise exception 'Missing auth accepted';
 exception when sqlstate '28000' then null; end;
 begin perform public.save_account_profile(p); raise exception 'Missing auth write accepted';
 exception when sqlstate '28000' then null; end;
end $$;
reset role;
do $$ begin
 assert (select latitude=40 and longitude=-73 and is_active from public.profiles where username='candidate-other'), 'Protected legacy fields changed';
 assert not has_function_privilege('anon','public.get_account_profile()','EXECUTE');
 assert not has_function_privilege('anon','public.save_account_profile(jsonb)','EXECUTE');
 assert not has_table_privilege('authenticated','public.account_profiles','INSERT');
 assert not has_table_privilege('authenticated','public.account_profiles','UPDATE');
  assert not has_table_privilege('authenticated','public.account_profiles','DELETE');
  assert not has_table_privilege('authenticated','public.profiles','INSERT,UPDATE,DELETE'), 'Legacy browser DML bypass';
  assert not has_any_column_privilege('authenticated','public.profiles','INSERT'), 'Legacy column INSERT bypass';
  assert not has_any_column_privilege('authenticated','public.profiles','UPDATE'), 'Legacy column UPDATE bypass';
  assert not has_table_privilege('anon','public.profiles','INSERT,UPDATE,DELETE'), 'Anonymous legacy DML bypass';
end $$;
set local role anon;
do $$ begin
 begin perform public.get_account_profile(); raise exception 'Anonymous getter accepted';
 exception when insufficient_privilege then null; end;
 begin perform public.save_account_profile('{}'); raise exception 'Anonymous write accepted';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
