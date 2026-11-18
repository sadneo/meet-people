\set ON_ERROR_STOP on
-- pg_net sends only after commit. All queued fixtures and credentials roll back.
begin;
set local plpgsql.check_asserts=on;
delete from vault.secrets where name in ('pebble_project_url','pebble_ingest_token');
select vault.create_secret('https://wacgxhsdhrqigrmqaonc.supabase.co','pebble_project_url');
select vault.create_secret('fixture-ingestion-token','pebble_ingest_token');
update hosting_private.dining_schedule_state set last_scheduled_date=null,request_id=null,scheduled_at=null;

do $$
declare request bigint; before_timezone text:=current_setting('cron.timezone',true); candidate timestamptz; due_at timestamptz;
begin
  assert not has_function_privilege('anon','hosting_private.ingest_dining(boolean,timestamptz)','execute');
  assert not has_function_privilege('authenticated','hosting_private.configure_dining_schedule()','execute');
  assert not has_function_privilege('service_role','hosting_private.ingest_dining(boolean,timestamptz)','execute');
  assert not has_table_privilege('service_role','hosting_private.dining_schedule_state','select');
  perform hosting_private.configure_dining_schedule();
  perform hosting_private.configure_dining_schedule();
  assert (select count(*)=1 from cron.job where jobname='pebble-ingest-dining' and active and schedule='0 10,11 * * *');
  assert current_setting('cron.timezone',true) is not distinct from before_timezone;

  -- Winter, summer, and both sides of the 2027 DST transitions.
  foreach due_at in array array['2027-01-15 11:00Z'::timestamptz,'2027-03-13 11:00Z','2027-03-14 10:00Z',
    '2027-07-15 10:00Z','2027-11-06 10:00Z','2027-11-07 11:00Z'] loop
    update hosting_private.dining_schedule_state set last_scheduled_date=null;
    candidate:=(date_trunc('day',due_at at time zone 'UTC') at time zone 'UTC')+interval '10 hours';
    if candidate=due_at then candidate:=candidate+interval '1 hour'; end if;
    assert hosting_private.ingest_dining(false,candidate) is null, 'Off-hour UTC candidate must skip';
    request:=hosting_private.ingest_dining(false,due_at);
    assert request is not null, '06:00 New York must enqueue';
    assert (select url='https://wacgxhsdhrqigrmqaonc.supabase.co/functions/v1/ingest-dining'
      and headers->>'x-ingest-token'='fixture-ingestion-token'
      and convert_from(body,'UTF8')::jsonb='{"mode":"full","dryRun":false}'::jsonb
      and timeout_milliseconds=120000 from net.http_request_queue where id=request);
    assert hosting_private.ingest_dining(false,due_at+interval '1 minute') is null, 'Same-day retry must skip';
    assert hosting_private.ingest_dining(false,candidate) is null;
  end loop;
  assert hosting_private.ingest_dining(true,'2027-11-07 18:00Z') is not null, 'Owner can force a run';
end $$;

-- Sandbox/unknown targets cannot enable food cron or send even forced imports.
delete from vault.secrets where name='pebble_project_url';
select vault.create_secret('https://wixdiotkntapwrbibaom.supabase.co','pebble_project_url');
do $$ begin
  begin
    perform hosting_private.configure_dining_schedule();
    raise exception 'Sandbox schedule accepted';
  exception when raise_exception then assert sqlerrm='Production dining Vault configuration required'; end;
  begin
    perform hosting_private.ingest_dining(true);
    raise exception 'Sandbox import accepted';
  exception when raise_exception then assert sqlerrm='Production dining Vault configuration required'; end;
end $$;
rollback;
