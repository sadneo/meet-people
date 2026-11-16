begin;

create schema if not exists ingestion_private;
revoke all on schema ingestion_private from public, anon, authenticated;

create table ingestion_private.sbengaged_control (
 singleton boolean primary key default true check(singleton),
 mode text not null default 'disabled' check(mode in('disabled','producer','mirror')),
 cooldown_until timestamptz not null default '-infinity',
 sync_token uuid, sync_until timestamptz,
 photo_token uuid, photo_until timestamptz,
 photo_next_run_at timestamptz not null default '-infinity',
 snapshot jsonb,
 updated_at timestamptz not null default now()
);
insert into ingestion_private.sbengaged_control(singleton) values(true);

create table ingestion_private.sbengaged_photos (
 listing_id uuid primary key references public.listings(id) on delete cascade,
 next_attempt_at timestamptz not null default now(),
 checked_at timestamptz,
 outcome text not null default 'pending' check(outcome in('pending','photo','no_photo','unavailable','failed','rate_limited')),
 attempts integer not null default 0,
 failures integer not null default 0,
 lease_token uuid, lease_until timestamptz,
 last_http_status integer
);
create index sbengaged_photos_due on ingestion_private.sbengaged_photos(next_attempt_at);
alter table ingestion_private.sbengaged_control enable row level security;
alter table ingestion_private.sbengaged_photos enable row level security;
revoke all on ingestion_private.sbengaged_control,ingestion_private.sbengaged_photos from public, anon, authenticated, service_role;

create function public.sbengaged_begin_sync(p_mode text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c ingestion_private.sbengaged_control; token uuid := gen_random_uuid();
begin
 select * into c from ingestion_private.sbengaged_control where singleton for update;
 if p_mode not in('producer','mirror') or c.mode<>p_mode then raise exception 'Source mode unavailable'; end if;
 if c.sync_until>clock_timestamp() then return jsonb_build_object('state','busy'); end if;
 if p_mode='producer' and c.cooldown_until>clock_timestamp() then
  return jsonb_build_object('state','cooldown','until',c.cooldown_until);
 end if;
 update ingestion_private.sbengaged_control set sync_token=token,sync_until=clock_timestamp()+interval '3 minutes' where singleton;
 return jsonb_build_object('state','claimed','token',token);
end $$;

-- Fixed public-source fields only. Metadata imports never overwrite a poster
-- concurrently completed by the image worker, or the listing's stable UUID.
create function public.sbengaged_upsert_events(p_token uuid,p_rows jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare c ingestion_private.sbengaged_control; saved integer;
begin
 select * into c from ingestion_private.sbengaged_control where singleton for update;
 if c.sync_token is distinct from p_token or c.sync_until<=clock_timestamp() then raise exception 'Expired sync lease'; end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>100 then raise exception 'Invalid metadata batch'; end if;
 if exists(select 1 from jsonb_array_elements(p_rows) r where r->>'source' is distinct from 'sbengaged'
  or r->>'listing_type' is distinct from 'event' or coalesce(r->>'external_id','')!~'^[0-9]+$'
  or r->>'status' not in('active','rescheduled','inactive','cancelled','postponed','offsale')) then raise exception 'Invalid event source'; end if;
 with saved_rows as (
  insert into public.listings(listing_type,source,external_id,title,description,category,starts_at,ends_at,location_name,source_url,last_synced_at,status,image_url,details_synced_at)
  select 'event','sbengaged',r.external_id,r.title,r.description,r.category,r.starts_at,r.ends_at,r.location_name,r.source_url,r.last_synced_at,r.status,
   case when c.mode='mirror' then r.image_url end,case when c.mode='mirror' then r.details_synced_at end
  from jsonb_to_recordset(p_rows) r(external_id text,title text,description text,category text,starts_at timestamptz,ends_at timestamptz,
   location_name text,source_url text,last_synced_at timestamptz,status text,image_url text,details_synced_at timestamptz)
  on conflict(source,external_id) do update set title=excluded.title,description=excluded.description,category=excluded.category,
   starts_at=excluded.starts_at,ends_at=excluded.ends_at,location_name=excluded.location_name,source_url=excluded.source_url,
   last_synced_at=excluded.last_synced_at,status=excluded.status,
   image_url=case when c.mode='mirror' and excluded.details_synced_at>=coalesce(listings.details_synced_at,'-infinity')
     then coalesce(excluded.image_url,listings.image_url) else listings.image_url end,
   details_synced_at=case when c.mode='mirror' then greatest(excluded.details_synced_at,listings.details_synced_at) else listings.details_synced_at end
  returning id,image_url,details_synced_at,starts_at
 ), queued as (
  insert into ingestion_private.sbengaged_photos(listing_id,checked_at,outcome,next_attempt_at)
  select id,details_synced_at,case when details_synced_at is null then 'pending' when image_url is null then 'no_photo' else 'photo' end,
   coalesce(details_synced_at + case when image_url is not null and starts_at<=clock_timestamp()+interval '2 days' then interval '6 hours' else interval '24 hours' end,clock_timestamp())
  from saved_rows where c.mode='producer'
  on conflict(listing_id) do update set next_attempt_at=case when sbengaged_photos.outcome in('photo','no_photo')
   then least(sbengaged_photos.next_attempt_at,excluded.next_attempt_at) else sbengaged_photos.next_attempt_at end
 ) select count(*)::integer into saved from saved_rows;
 return saved;
end $$;

create function public.sbengaged_finish_sync(p_token uuid,p_starts timestamptz,p_ends timestamptz,p_seen text[],p_full boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c ingestion_private.sbengaged_control; removed integer; lifecycle jsonb := '{}'; payload jsonb;
begin
 select * into c from ingestion_private.sbengaged_control where singleton for update;
 if c.sync_token is distinct from p_token or c.sync_until<=clock_timestamp() then raise exception 'Expired sync lease'; end if;
 if p_starts is null or p_ends is null or p_ends<=p_starts or p_ends-p_starts>interval '31 days' then raise exception 'Invalid sync window'; end if;
 if p_full then
  select to_jsonb(r) into lifecycle from public.reconcile_sbengaged_full_sync(p_starts,p_ends,p_seen) r;
 end if;
 with deleted as(delete from public.listings where source='sbengaged' and listing_type='event'
  and coalesce(ends_at,starts_at)<clock_timestamp()-interval '2 days' returning 1)
 select count(*)::integer into removed from deleted;
 if c.mode='producer' and p_full then
  select jsonb_build_object('version',1,'complete',true,'generatedAt',clock_timestamp(),
   'window',jsonb_build_object('startsAt',p_starts,'endsAt',p_ends),'events',coalesce(jsonb_agg(jsonb_build_object(
    'source',l.source,'listing_type',l.listing_type,'external_id',l.external_id,'title',l.title,'description',l.description,
    'category',l.category,'starts_at',l.starts_at,'ends_at',l.ends_at,'location_name',l.location_name,'source_url',l.source_url,
    'last_synced_at',l.last_synced_at,'status',l.status)),'[]'::jsonb)) into payload
  from public.listings l where l.source='sbengaged' and l.listing_type='event' and l.starts_at<p_ends
   and coalesce(l.ends_at,l.starts_at)>=p_starts;
  update ingestion_private.sbengaged_control set snapshot=payload,updated_at=clock_timestamp() where singleton;
 end if;
 update ingestion_private.sbengaged_control set sync_token=null,sync_until=null where singleton;
 return jsonb_build_object('deleted',removed,'lifecycle',lifecycle,
  'photosPending',(select count(*) from ingestion_private.sbengaged_photos where outcome='pending'));
end $$;

create function public.sbengaged_release_sync(p_token uuid) returns void
language sql security definer set search_path='' as $$
 update ingestion_private.sbengaged_control set sync_token=null,sync_until=null where singleton and sync_token=p_token;
$$;

create function public.sbengaged_export_snapshot() returns jsonb
language plpgsql security definer set search_path='' as $$
declare c ingestion_private.sbengaged_control; payload jsonb;
begin
 select * into c from ingestion_private.sbengaged_control where singleton;
 if c.mode<>'producer' or c.snapshot is null or (c.snapshot->>'generatedAt')::timestamptz<clock_timestamp()-interval '3 hours' then
  raise exception 'No fresh complete source snapshot';
 end if;
 -- The published metadata is immutable until the next completed import. Only
 -- the latest public poster fields are joined into this allowlisted snapshot.
 select jsonb_set(c.snapshot,'{events}',coalesce(jsonb_agg(e || jsonb_build_object('image_url',l.image_url,'details_synced_at',l.details_synced_at)),'[]'))
 into payload from jsonb_array_elements(c.snapshot->'events') e
 join public.listings l on l.source='sbengaged' and l.external_id=e->>'external_id';
 return payload;
end $$;

create function public.sbengaged_claim_photos() returns jsonb
language plpgsql security definer set search_path='' as $$
declare c ingestion_private.sbengaged_control; token uuid:=gen_random_uuid(); jobs jsonb;
begin
 select * into c from ingestion_private.sbengaged_control where singleton for update;
 if c.mode<>'producer' then return jsonb_build_object('state','disabled'); end if;
 if c.cooldown_until>clock_timestamp() then return jsonb_build_object('state','cooldown','until',c.cooldown_until); end if;
 if c.photo_until>clock_timestamp() or c.photo_next_run_at>clock_timestamp() then return jsonb_build_object('state','busy'); end if;
 update ingestion_private.sbengaged_control set photo_token=token,photo_until=clock_timestamp()+interval '3 minutes',
  photo_next_run_at=clock_timestamp()+interval '5 minutes' where singleton;
 with due as(select q.listing_id from ingestion_private.sbengaged_photos q join public.listings l on l.id=q.listing_id
  where q.next_attempt_at<=clock_timestamp() and (q.lease_until is null or q.lease_until<=clock_timestamp())
   and l.status in('active','rescheduled') and coalesce(l.ends_at,l.starts_at)>=clock_timestamp()
  order by (l.starts_at>clock_timestamp()+interval '2 days'),(q.checked_at is not null),q.next_attempt_at,l.starts_at,l.id
  limit 10 for update of q skip locked), claimed as(
  update ingestion_private.sbengaged_photos q set lease_token=token,lease_until=clock_timestamp()+interval '3 minutes'
  from due where q.listing_id=due.listing_id returning q.listing_id,q.failures)
 select coalesce(jsonb_agg(jsonb_build_object('listingId',l.id,'externalId',l.external_id,'failures',j.failures)),'[]') into jobs
 from claimed j join public.listings l on l.id=j.listing_id;
 return jsonb_build_object('state','claimed','token',token,'jobs',jobs);
end $$;

create function public.sbengaged_origin_cooldown(p_seconds integer) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_seconds is null or p_seconds<1 then raise exception 'Invalid cooldown'; end if;
 update ingestion_private.sbengaged_control set cooldown_until=greatest(cooldown_until,clock_timestamp()+make_interval(secs=>p_seconds)) where singleton;
end $$;

create function public.sbengaged_complete_photo(p_id uuid,p_token uuid,p_outcome text,p_image text,p_retry_seconds integer,p_http integer) returns void
language plpgsql security definer set search_path='' as $$
declare q ingestion_private.sbengaged_photos; l public.listings; next_at timestamptz;
begin
 perform 1 from ingestion_private.sbengaged_control where singleton and photo_token=p_token and photo_until>clock_timestamp() for update;
 if not found then raise exception 'Expired photo lease'; end if;
 select * into q from ingestion_private.sbengaged_photos where listing_id=p_id for update;
 if not found or q.lease_token is distinct from p_token or q.lease_until<=clock_timestamp() then raise exception 'Expired photo lease'; end if;
 if p_outcome not in('photo','no_photo','unavailable','failed','rate_limited') or p_retry_seconds is null or p_retry_seconds<1
  or (p_outcome='photo' and coalesce(p_image,'')!~'^https?://') then raise exception 'Invalid photo result'; end if;
 select * into l from public.listings where id=p_id;
 if p_outcome in('photo','no_photo') then
  update public.listings set image_url=coalesce(p_image,image_url),details_synced_at=clock_timestamp() where id=p_id;
  next_at:=clock_timestamp()+case when p_outcome='photo' and l.starts_at<=clock_timestamp()+interval '2 days' then interval '6 hours' else interval '24 hours' end;
 else next_at:=clock_timestamp()+make_interval(secs=>p_retry_seconds); end if;
 update ingestion_private.sbengaged_photos set outcome=p_outcome,next_attempt_at=next_at,attempts=attempts+1,
  checked_at=case when p_outcome in('photo','no_photo') then clock_timestamp() else checked_at end,
  failures=case when p_outcome in('photo','no_photo') then 0 else failures+1 end,
  last_http_status=p_http,lease_token=null,lease_until=null where listing_id=p_id;
end $$;

create function public.sbengaged_release_photos(p_token uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from ingestion_private.sbengaged_control where singleton and photo_token=p_token for update;
 if not found then return; end if;
 update ingestion_private.sbengaged_photos set lease_token=null,lease_until=null where lease_token=p_token;
 update ingestion_private.sbengaged_control set photo_token=null,photo_until=null where singleton and photo_token=p_token;
end $$;

-- Service-only wrappers; private tables and export credentials never reach clients.
revoke all on function public.sbengaged_begin_sync(text),public.sbengaged_upsert_events(uuid,jsonb),
 public.sbengaged_finish_sync(uuid,timestamptz,timestamptz,text[],boolean),public.sbengaged_release_sync(uuid),
 public.sbengaged_export_snapshot(),public.sbengaged_claim_photos(),public.sbengaged_origin_cooldown(integer),
 public.sbengaged_complete_photo(uuid,uuid,text,text,integer,integer),public.sbengaged_release_photos(uuid)
 from public,anon,authenticated;
grant execute on function public.sbengaged_begin_sync(text),public.sbengaged_upsert_events(uuid,jsonb),
 public.sbengaged_finish_sync(uuid,timestamptz,timestamptz,text[],boolean),public.sbengaged_release_sync(uuid),
 public.sbengaged_export_snapshot(),public.sbengaged_claim_photos(),public.sbengaged_origin_cooldown(integer),
 public.sbengaged_complete_photo(uuid,uuid,text,text,integer,integer),public.sbengaged_release_photos(uuid) to service_role;

create function hosting_private.enrich_sbengaged() returns bigint
language plpgsql security definer set search_path='' as $$
declare project_url text; token text;
begin
 select decrypted_secret into project_url from vault.decrypted_secrets where name='pebble_project_url';
 select decrypted_secret into token from vault.decrypted_secrets where name='pebble_ingest_token';
 if project_url is null or token is null then return null; end if;
 return net.http_post(url:=project_url||'/functions/v1/enrich-sbengaged',
  headers:=jsonb_build_object('Content-Type','application/json','x-ingest-token',token),body:='{}'::jsonb,timeout_milliseconds:=120000);
end $$;
revoke all on function hosting_private.enrich_sbengaged() from public,anon,authenticated,service_role;

create function hosting_private.configure_sbengaged_schedules(p_mode text) returns void
language plpgsql security definer set search_path='' as $$
declare target text; old_job bigint;
begin
 select decrypted_secret into target from vault.decrypted_secrets where name='pebble_project_url';
 if (p_mode='producer' and target<>'https://wacgxhsdhrqigrmqaonc.supabase.co')
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

notify pgrst,'reload schema';
commit;
