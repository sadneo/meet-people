-- Disposable database only. No production seed or external embedding call.
begin;
do $$ begin
 assert to_regprocedure('public.get_matchmaking_profile()') is not null, 'Missing profile getter RPC';
 assert to_regprocedure('public.save_matchmaking_profile(jsonb)') is not null, 'Missing profile save RPC';
end $$;
-- Fail closed at the provider boundary: new interest must abort instead of networking.
create or replace function public.get_gemini_embedding(interest_text text)
returns double precision[] language plpgsql as $$ begin
 raise exception 'Test-only embedding boundary rejection' using errcode='P0001';
end $$;
insert into auth.users(id) values
 ('f0000000-0000-4000-8000-000000000001'),
 ('f0000000-0000-4000-8000-000000000002');
insert into public.profiles(id,username,display_name,latitude,longitude,is_active,last_seen_at)
values ('f0000000-0000-4000-8000-000000000002','other','Other',40,-73,true,now());
-- Fixture setup only: retain a known synthetic vector without invoking HTTP.
alter table public.user_interests disable trigger trg_user_interests_embed;
insert into public.user_interests(profile_id,text,embedding) values
 ('f0000000-0000-4000-8000-000000000002',E'Board games\nstrategy',array[1.0,0.0]);
alter table public.user_interests enable trigger trg_user_interests_embed;
set local role authenticated;
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000001',true);
do $$
declare p jsonb; result jsonb;
begin
 assert public.get_matchmaking_profile() is null, 'Missing profile must return SQL NULL';
 p := '{"username":"first","display_name":"First","bio":null,"birthdate":null,"location_city":null,"avatar_url":null,"interests":[],"availability":[{"dow":6,"start_time":"21:00:00","end_time":"24:00:00"}]}'::jsonb;
 result := public.save_matchmaking_profile(p);
 assert result = p, 'Profile round trip/midnight normalization failed';
 assert public.get_matchmaking_profile()=p;
 begin
  perform public.save_matchmaking_profile(p || '{"user_id":"f0000000-0000-4000-8000-000000000002"}'::jsonb);
  raise exception 'Unknown actor key accepted';
 exception when sqlstate '22023' then null; end;
 begin
  perform public.save_matchmaking_profile(jsonb_set(p,'{avatar_url}','"http://unsafe.example/avatar"'));
  raise exception 'HTTP avatar accepted';
 exception when sqlstate '22023' then null; end;
 begin
  perform public.save_matchmaking_profile(jsonb_set(p,'{availability}','[{"dow":1,"start_time":"17:00:00","end_time":"21:00:00"},{"dow":1,"start_time":"20:00:00","end_time":"22:00:00"}]'));
  raise exception 'Overlapping windows accepted';
 exception when sqlstate '22023' then null; end;
 begin
  perform public.save_matchmaking_profile(jsonb_set(p,'{interests}','["Coffee"," Coffee "]'));
  raise exception 'Duplicate normalized interest accepted';
 exception when sqlstate '22023' then null; end;
 begin
  perform public.save_matchmaking_profile(p || '{"username":"other"}');
  raise exception 'Duplicate username accepted';
 exception when unique_violation then null; end;
 assert public.get_matchmaking_profile()=p, 'Failed validation/uniqueness changed profile';
 begin
  perform public.save_matchmaking_profile(p || '{"display_name":"Changed","interests":["New interest"]}');
  raise exception 'Embedding failure did not abort save';
 exception when sqlstate 'P0001' then
  if sqlerrm <> 'Test-only embedding boundary rejection' then raise; end if;
 end;
 assert public.get_matchmaking_profile()=p, 'Provider failure partially saved profile';
 perform set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000002',true);
 p:=public.get_matchmaking_profile();
 assert p->>'username'='other';
 p:=p || '{"display_name":"Updated name","availability":[]}';
 result:=public.save_matchmaking_profile(p);
 assert result=p, 'Unchanged interests should not invoke embedding';
 assert not(result ? 'latitude') and not(result ? 'longitude') and not(result ? 'is_active');
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.get_matchmaking_profile(); raise exception 'Missing identity accepted';
 exception when sqlstate '28000' then null; end;
 begin perform public.save_matchmaking_profile(p); raise exception 'Missing identity accepted';
 exception when sqlstate '28000' then null; end;
end $$;
reset role;
do $$ begin
 assert (select latitude=40 and longitude=-73 and is_active and last_seen_at is not null from public.profiles where username='other');
 assert (select embedding=array[1.0,0.0]::double precision[] from public.user_interests where profile_id='f0000000-0000-4000-8000-000000000002');
 assert not has_function_privilege('anon','public.get_matchmaking_profile()','EXECUTE');
 assert not has_function_privilege('anon','public.save_matchmaking_profile(jsonb)','EXECUTE');
 assert has_function_privilege('authenticated','public.save_matchmaking_profile(jsonb)','EXECUTE');
 assert (select tgenabled='O' from pg_trigger where tgname='trg_user_interests_embed');
end $$;
-- Input and ownership matrix; every invalid payload must leave the snapshot intact.
set local role authenticated;
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000001',true);
do $$
declare base jsonb:=public.get_matchmaking_profile(); patch jsonb; invalid_payload jsonb;
begin
 for patch in select value from jsonb_array_elements('[
  {"username":null},{"username":""},{"display_name":false},{"bio":42},
  {"birthdate":"2026-02-30"},{"location_city":{}},{"avatar_url":[]},
  {"interests":null},{"interests":[1]},{"interests":[""]},
  {"availability":null},{"availability":[{"dow":7,"start_time":"17:00:00","end_time":"21:00:00"}]},
  {"availability":[{"dow":1.5,"start_time":"17:00:00","end_time":"21:00:00"}]},
  {"availability":[{"dow":1,"start_time":"25:00:00","end_time":"26:00:00"}]},
  {"availability":[{"dow":1,"start_time":"21:00:00","end_time":"00:00:00"}]},
  {"availability":[{"dow":1,"start_time":"17:00:00","end_time":"21:00:00","owner":"other"}]}
 ]'::jsonb) loop
  begin
   perform public.save_matchmaking_profile(base || patch);
   raise exception 'Invalid synthetic patch accepted: %', patch;
  exception when sqlstate '22023' then null; end;
  assert public.get_matchmaking_profile()=base;
 end loop;
 -- Explicitly clearing lists does not require a provider call.
 assert public.save_matchmaking_profile(base || '{"availability":[],"interests":[]}'::jsonb)->'availability'='[]'::jsonb;
 -- Adjacent windows and 24:00 are valid; canonical snapshot is ordered.
 invalid_payload:=base || '{"availability":[{"dow":6,"start_time":"21:00:00","end_time":"24:00:00"},{"dow":6,"start_time":"17:00:00","end_time":"21:00:00"}]}'::jsonb;
 assert public.save_matchmaking_profile(invalid_payload)->'availability'->0->>'start_time'='17:00:00';
 perform set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000002',true);
 base:=public.get_matchmaking_profile();
 assert base->>'display_name'='Updated name', 'Other actor changed';
end $$;
reset role;
-- SECURITY DEFINER must never use a schema that anonymous clients can write.
grant create on schema public to anon;
set local role authenticated;
do $$ begin
 begin
  perform public.save_matchmaking_profile(public.get_matchmaking_profile());
  raise exception 'Unsafe public schema accepted';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
revoke create on schema public from anon;
set local role anon;
do $$ begin
 begin perform public.get_matchmaking_profile(); raise exception 'Anonymous getter accepted';
 exception when insufficient_privilege then null; end;
 begin perform public.save_matchmaking_profile('{}'::jsonb); raise exception 'Anonymous save accepted';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000001',true);
do $$ declare base jsonb:=public.get_matchmaking_profile(); begin
 begin perform public.save_matchmaking_profile(base || jsonb_build_object('avatar_url','https://example.test:invalid/avatar'));
  raise exception 'Invalid avatar port accepted'; exception when sqlstate '22023' then null; end;
 begin perform public.save_matchmaking_profile(base || jsonb_build_object('avatar_url','https://example.123/avatar'));
  raise exception 'Numeric-ending hostname accepted'; exception when sqlstate '22023' then null; end;
 begin perform public.save_matchmaking_profile(base || jsonb_build_object('display_name',repeat(chr(128512),121)));
  raise exception 'Overlong Unicode name accepted'; exception when sqlstate '22023' then null; end;
 assert public.save_matchmaking_profile(base || jsonb_build_object('avatar_url','HTTPS://example.test/avatar'))->>'avatar_url'='HTTPS://example.test/avatar';
 assert public.save_matchmaking_profile(base || jsonb_build_object('display_name',repeat(chr(128512),120)))->>'display_name'=repeat(chr(128512),120);
end $$;
reset role;
rollback;
