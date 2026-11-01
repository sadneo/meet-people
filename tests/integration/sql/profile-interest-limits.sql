\set ON_ERROR_STOP on
begin;
set local plpgsql.check_asserts=on;
do $$ begin
 if current_database()<>'pebble_safety_owner_disposable'
 or current_setting('pebble.safety_owner_test_target',true) is distinct from 'network-none-safety-owner-v1'
 or not exists(select 1 from public.safety_owner_disposable_marker where singleton and purpose='network-none-safety-owner-v1') then raise exception 'Wrong disposable';end if;
 assert public.valid_profile_interests('["Coffee","Art","Music"]',true);
 assert public.valid_profile_interests('["Coffee","Art","Music","Outdoors","Gaming"]',true);
 assert public.valid_profile_interests('["Coffee","Art","Music","Custom one","Custom two"]',true);
 assert public.valid_profile_interests('["Coffee"]',true);
 assert public.valid_profile_interests('["Ceramics"]',true);
 assert public.valid_profile_interests('["Custom one","Custom two"]',true);
 assert public.valid_profile_interests('["Coffee","Art","Custom one","Custom two"]',true);
 assert not public.valid_profile_interests('["Coffee","Art","Custom one","Custom two","Custom three"]',false);
 assert not public.valid_profile_interests('["Coffee","Art","Music","Outdoors","Gaming","Movies"]',true);
 assert not public.valid_profile_interests('["Coffee","Coffee","Art"]',true);
 assert not public.valid_profile_interests('["   "]',true);
 assert public.valid_profile_interests('[]',false);
 assert not public.valid_profile_interests('[]',true);
 assert not has_function_privilege('authenticated','public.interest_policy_profile_write(jsonb)','EXECUTE');
 assert not has_function_privilege('authenticated','public.valid_profile_interests(jsonb,boolean)','EXECUTE');
 assert not has_function_privilege('anon','public.reconciliation_profile_write(jsonb)','EXECUTE');
end $$;
insert into auth.users(id) values('ad900000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub','ad900000-0000-4000-8000-000000000001',true);
do $$ declare a jsonb; before_save jsonb; bad jsonb;begin
 a:='{"profile":{"username":"interest-policy-fixture","display_name":"Interest fixture","bio":null,"avatar_url":null,"birthdate":null,"location_city":null,"interests":[],"availability":[]},"preferences":{"intents":[],"usual":[],"distance":"","group":""},"settings":{"notifications":false,"availability":false,"discoverable":false,"location":false},"completed":[0]}';
 perform public.save_account(a);
 before_save:=public.get_account();
 bad:=jsonb_set(a,'{profile,interests}','["Coffee","Art","Music","Food","Movies","Gaming"]');
 begin perform public.save_account(bad);raise exception 'Six interests saved';exception when sqlstate '22023' then null;end;
 assert public.get_account()=before_save,'Rejected write changed account';
 bad:=jsonb_set(jsonb_set(a,'{completed}','[0,1]'),'{profile,interests}','[]');
 begin perform public.save_account(bad);raise exception 'Empty interests completed chapter';exception when sqlstate '22023' then null;end;
 assert public.get_account()=before_save,'Rejected completion changed account';
 -- Fixture labels save without provider I/O; the hook state rolls back below.
end $$;
reset role;
alter table public.user_interests disable trigger trg_user_interests_embed;
set local role authenticated;
do $$ declare a jsonb;begin
 a:=public.get_account();
 a:=jsonb_set(jsonb_set(a,'{completed}','[0,1]'),'{profile,interests}','["Coffee","Art","Music","Custom one","Custom two"]');
 assert public.save_account(a)->'completed'='[0,1]'::jsonb;
 assert jsonb_array_length(public.get_account()->'profile'->'interests')=5;
 a:=jsonb_set(a,'{profile,interests}','["Ceramics"]');
 assert public.save_account(a)->'completed'='[0,1]'::jsonb;
 assert public.get_account()->'profile'->'interests'='["Ceramics"]'::jsonb;
 a:=jsonb_set(a,'{profile,interests}','["Coffee"]');
 assert public.save_account(a)->'completed'='[0,1]'::jsonb;
 assert public.get_account()->'profile'->'interests'='["Coffee"]'::jsonb;
end $$;
rollback;
