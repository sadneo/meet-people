-- Keep the cluster cron timezone unchanged: existing jobs use UTC.
create table hosting_private.dining_schedule_state (
  singleton boolean primary key default true check (singleton),
  last_scheduled_date date,
  request_id bigint,
  scheduled_at timestamptz
);
insert into hosting_private.dining_schedule_state(singleton) values(true);
alter table hosting_private.dining_schedule_state enable row level security;
revoke all on hosting_private.dining_schedule_state from public,anon,authenticated,service_role;

-- Both UTC candidates fire, but only 06:00 America/New_York enqueues a request.
-- The row lock prevents concurrent/manual cron retries from importing twice.
-- Operators may force a run; p_at also makes DST behavior testable in a rollback.
create function hosting_private.ingest_dining(p_force boolean default false, p_at timestamptz default clock_timestamp()) returns bigint
language plpgsql security definer set search_path='' as $$
declare local_time timestamp; previous_date date; project_url text; token text; request bigint;
begin
  if p_force is null or p_at is null then raise exception 'Explicit dining run parameters required'; end if;
  local_time := p_at at time zone 'America/New_York';
  if not p_force and extract(hour from local_time) <> 6 then return null; end if;
  select last_scheduled_date into previous_date from hosting_private.dining_schedule_state where singleton for update;
  if not p_force and previous_date >= local_time::date then return null; end if;
  select decrypted_secret into project_url from vault.decrypted_secrets where name='pebble_project_url';
  select decrypted_secret into token from vault.decrypted_secrets where name='pebble_ingest_token';
  if project_url is distinct from 'https://wacgxhsdhrqigrmqaonc.supabase.co' or coalesce(token,'')='' then
    raise exception 'Production dining Vault configuration required';
  end if;
  request := net.http_post(url:=project_url||'/functions/v1/ingest-dining',
    headers:=jsonb_build_object('Content-Type','application/json','x-ingest-token',token),
    body:='{"mode":"full","dryRun":false}'::jsonb,timeout_milliseconds:=120000);
  update hosting_private.dining_schedule_state set last_scheduled_date=local_time::date,request_id=request,scheduled_at=p_at where singleton;
  return request;
end $$;
revoke all on function hosting_private.ingest_dining(boolean,timestamptz) from public,anon,authenticated,service_role;

-- Enabled only by the production release after Edge Functions and Vault exist.
create function hosting_private.configure_dining_schedule() returns void
language plpgsql security definer set search_path='' as $$
declare project_url text; token text;
begin
  select decrypted_secret into project_url from vault.decrypted_secrets where name='pebble_project_url';
  select decrypted_secret into token from vault.decrypted_secrets where name='pebble_ingest_token';
  if project_url is distinct from 'https://wacgxhsdhrqigrmqaonc.supabase.co' or coalesce(token,'')='' then
    raise exception 'Production dining Vault configuration required';
  end if;
  if coalesce(current_setting('cron.timezone',true),'GMT') not in ('GMT','UTC','Etc/UTC') then
    raise exception 'Dining cron requires the existing UTC scheduler timezone';
  end if;
  perform cron.schedule('pebble-ingest-dining','0 10,11 * * *','select hosting_private.ingest_dining()');
end $$;
revoke all on function hosting_private.configure_dining_schedule() from public,anon,authenticated,service_role;
