\set ON_ERROR_STOP on
begin;
set local plpgsql.check_asserts=on;
do $$ begin
  if current_setting('pebble.allowance_test_target',true) is distinct from 'local-allowance-rollback-v1'
    or current_database()<>'postgres' or current_user<>'postgres'
    or exists(select 1 from auth.users where id='ce310000-0000-4000-8000-000000000001') then
    raise exception 'Wrong target or occupied synthetic identity';
  end if;
end $$;
insert into auth.users(id,is_anonymous) values('ce310000-0000-4000-8000-000000000001',false);
select set_config('request.jwt.claim.sub','ce310000-0000-4000-8000-000000000001',true);
-- Exercise the exact production trigger without creating relationships/chats.
create temporary table allowance_probe(initiated_by uuid not null,valid boolean not null default true check(valid));
create trigger allowance_probe_guard before insert on allowance_probe
  for each row execute function public.canonical_connection_allowance_guard();
do $$ declare actor uuid:='ce310000-0000-4000-8000-000000000001';begin
  assert public.get_connection_request_allowance()->>'remaining'='10';
  begin
    insert into allowance_probe values(actor,false);
    raise exception 'Invalid probe succeeded';
  exception when check_violation then null;end;
  assert public.get_connection_request_allowance()->>'used'='0','Failed writes consumed allowance';
  insert into allowance_probe(initiated_by) select actor from generate_series(1,10);
  assert public.get_connection_request_allowance()->>'remaining'='0';
  assert public.get_connection_request_allowance()->>'availableAt' is not null;
  begin
    insert into allowance_probe(initiated_by) values(actor);
    raise exception 'Eleventh request succeeded';
  exception when sqlstate 'CON04' then null;end;
  update allowance_probe set valid=true;
  assert public.get_connection_request_allowance()->>'used'='10','Updates consumed allowance';
  delete from allowance_probe;
  assert public.get_connection_request_allowance()->>'remaining'='0','Cancellation refunded allowance';
  update public.connection_request_log set created_at=now()-interval '25 hours' where initiated_by=actor;
  assert public.get_connection_request_allowance()->>'remaining'='10','Rolling window did not expire';
  assert not has_table_privilege('authenticated','public.connection_request_log','SELECT');
  assert not has_table_privilege('authenticated','public.connection_request_log','INSERT');
  assert not has_function_privilege('anon','public.get_connection_request_allowance()','EXECUTE');
end $$;
rollback;
