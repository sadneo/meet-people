-- Every environment may scrape SB Engaged itself (producer) so scraper changes are
-- exercised in sandbox. Mirror mode stays pinned to sandbox as a fallback.
create or replace function hosting_private.configure_sbengaged_schedules(p_mode text) returns void
language plpgsql security definer set search_path='' as $$
declare target text; old_job bigint;
begin
 select decrypted_secret into target from vault.decrypted_secrets where name='pebble_project_url';
 if (p_mode='producer' and coalesce(target,'') !~ '^https://[a-z]{20}\.supabase\.co$')
  or (p_mode='mirror' and target<>'https://wixdiotkntapwrbibaom.supabase.co') or target is null or p_mode not in('producer','mirror') then
  raise exception 'Explicit matching hosted source mode required';
 end if;
 update ingestion_private.sbengaged_control set mode=p_mode where singleton;
 perform cron.schedule('pebble-ingest-sbengaged',case when p_mode='producer' then '17 * * * *' else '20 * * * *' end,'select hosting_private.ingest_sbengaged()');
 if p_mode='producer' then perform cron.schedule('pebble-enrich-sbengaged','*/5 * * * *','select hosting_private.enrich_sbengaged()');
 else
  select jobid into old_job from cron.job where jobname='pebble-enrich-sbengaged';
  if old_job is not null then perform cron.unschedule(old_job); end if;
 end if;
end $$;
revoke all on function hosting_private.configure_sbengaged_schedules(text) from public,anon,authenticated,service_role;
