-- Username normalization. Disposable replay only; rolls back.
begin;
set local plpgsql.check_asserts=on;
create or replace function public.get_gemini_embedding(interest_text text)
returns double precision[] language plpgsql as $$ begin raise exception 'Offline test'; end $$;

insert into auth.users(id,email_confirmed_at,is_anonymous) values
('f9b00000-0000-4000-8000-000000000001',now(),false),
('f9b00000-0000-4000-8000-000000000002',now(),false),
('f9b00000-0000-4000-8000-000000000003',now(),false);
-- A legacy mixed-case handle that existed before the policy.
insert into public.profiles(id,username,display_name) values('f9b00000-0000-4000-8000-000000000003','Legacy_Mixed','Legacy');

set local role authenticated;
select set_config('request.jwt.claim.sub','f9b00000-0000-4000-8000-000000000001',true);
do $$
declare account jsonb:=public.get_account(); other jsonb;
begin
 account:=jsonb_set(account,'{profile}','{"username":"  GRACE_Test ","display_name":"First","bio":null,"birthdate":"2000-01-01","location_city":null,"avatar_url":null,"interests":[],"availability":[]}');
 account:=public.save_account(jsonb_set(account,'{completed}','[0]'));
 assert account->'profile'->>'username'='grace_test','Username was not trimmed and lowercased';
 -- Re-saving the same document is stable.
 assert public.save_account(account)->'profile'->>'username'='grace_test';
 -- Whitespace inside a handle is rejected.
 begin
  perform public.save_account(jsonb_set(account,'{profile,username}','"a b"'));
  raise exception 'Handle with a space saved';
 exception when sqlstate '22023' then null; end;
 assert public.get_account()->'profile'->>'username'='grace_test';
end $$;

select set_config('request.jwt.claim.sub','f9b00000-0000-4000-8000-000000000002',true);
do $$
declare account jsonb:=public.get_account();
begin
 account:=jsonb_set(account,'{profile}','{"username":"x","display_name":"Second","bio":null,"birthdate":"2000-01-01","location_city":null,"avatar_url":null,"interests":[],"availability":[]}');
 account:=jsonb_set(account,'{completed}','[0]');
 -- Case-insensitive duplicates of an account handle and of a legacy profile handle.
 begin
  perform public.save_account(jsonb_set(account,'{profile,username}','"GRACE_TEST"'));
  raise exception 'Case-insensitive duplicate saved';
 exception when sqlstate '23505' then null; end;
 begin
  perform public.save_account(jsonb_set(account,'{profile,username}','"legacy_mixed"'));
  raise exception 'Case-insensitive legacy duplicate saved';
 exception when sqlstate '23505' then null; end;
 assert public.save_account(jsonb_set(account,'{profile,username}','"free_name"'))->'profile'->>'username'='free_name';
end $$;

reset role;
-- The database itself refuses case-insensitive duplicates.
do $$ begin
 insert into auth.users(id,email_confirmed_at,is_anonymous) values('f9b00000-0000-4000-8000-000000000004',now(),false);
 begin
  insert into public.profiles(id,username,display_name) values('f9b00000-0000-4000-8000-000000000004','GRACE_TEST','Clone');
  raise exception 'Duplicate profile inserted';
 exception when unique_violation then null; end;
end $$;
-- Verify the stored projections as the test owner.
do $$ begin
 assert (select username from public.profiles where id='f9b00000-0000-4000-8000-000000000001')='grace_test';
 assert (select username from public.profiles where id='f9b00000-0000-4000-8000-000000000003')='Legacy_Mixed';
 assert not has_function_privilege('authenticated','public.username_policy_identity_write(jsonb)','EXECUTE');
 assert not has_function_privilege('authenticated','public.reconciliation_identity_write(jsonb)','EXECUTE');
end $$;
rollback;
