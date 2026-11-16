-- Disposable database only: simulate old minor accounts without changing real data.
begin;
set local plpgsql.check_asserts=on;
do $$
declare a uuid:=gen_random_uuid(); minor_id uuid:=gen_random_uuid();
begin
 insert into auth.users(id,email_confirmed_at,is_anonymous) values(a,now(),false),(minor_id,now(),false);
 begin
  insert into public.profiles(id,username,display_name,birthdate)
  values(a,a::text,'Admission fixture',(current_date-interval '17 years')::date);
  raise exception 'Minor admission unexpectedly allowed';
 exception when sqlstate '22023' then null;
 end;
 insert into public.profiles(id,username,display_name,birthdate)
 values(a,a::text,'Admission fixture',(current_date-interval '18 years')::date);
 perform set_config('request.jwt.claim.sub',a::text,true);
 begin
  update public.profiles set birthdate=(current_date-interval '19 years')::date where id=a;
  raise exception 'Saved birthday change unexpectedly allowed';
 exception when sqlstate '22023' then null;
 end;
 perform set_config('session_replication_role','replica',true);
 insert into public.profiles(id,username,display_name,birthdate)
 values(minor_id,minor_id::text,'Historical minor fixture',(current_date-interval '17 years')::date);
 perform set_config('session_replication_role','origin',true);
 perform set_config('request.jwt.claim.sub',minor_id::text,true);
 perform set_config('role','authenticated',true);
 begin
  perform public.garden_account(null);
  raise exception 'Historical minor accessed Garden';
 exception when insufficient_privilege then null;
 end;
 perform set_config('role','none',true);
 assert not exists(select 1 from garden_private.wallets where owner=minor_id), 'Denied access created a wallet';
end $$;
rollback;
