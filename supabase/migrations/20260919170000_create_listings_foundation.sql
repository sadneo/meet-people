create table public.listings (
  id uuid primary key default gen_random_uuid(),
  listing_type text not null default 'event',
  title text not null,
  description text,
  category text,
  starts_at timestamptz,
  ends_at timestamptz,
  location_name text,
  address text,
  city text,
  region text,
  postal_code text,
  latitude double precision,
  longitude double precision,
  image_url text,
  status text not null default 'active',
  source text not null,
  external_id text not null,
  source_url text,
  last_synced_at timestamptz,
  missed_sync_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listings_type_check check (listing_type in ('event', 'restaurant', 'park')),
  constraint listings_title_not_blank check (length(btrim(title)) > 0),
  constraint listings_status_check check (status in ('active', 'inactive', 'offsale', 'cancelled', 'postponed', 'rescheduled')),
  constraint listings_source_not_blank check (length(btrim(source)) > 0),
  constraint listings_external_id_not_blank check (length(btrim(external_id)) > 0),
  constraint listings_coordinate_pair_check check ((latitude is null) = (longitude is null)),
  constraint listings_latitude_range_check check (latitude is null or latitude between -90 and 90),
  constraint listings_longitude_range_check check (longitude is null or longitude between -180 and 180),
  constraint listings_end_not_before_start check (ends_at is null or starts_at is null or ends_at >= starts_at),
  constraint listings_missed_sync_count_non_negative check (missed_sync_count >= 0),
  constraint listings_source_external_id_key unique (source, external_id)
);

create index listings_type_status_starts_at_idx on public.listings (listing_type, status, starts_at);

create table public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  mode text not null,
  status text not null default 'running',
  window_starts_at timestamptz,
  window_ends_at timestamptz,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  request_count integer not null default 0,
  fetched_count integer not null default 0,
  accepted_count integer not null default 0,
  skipped_count integer not null default 0,
  upserted_count integer not null default 0,
  reset_count integer not null default 0,
  missed_count integer not null default 0,
  inactivated_count integer not null default 0,
  deleted_count integer not null default 0,
  error_summary jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ingestion_runs_mode_check check (mode in ('smoke', 'full')),
  constraint ingestion_runs_status_check check (status in ('running', 'completed', 'partial', 'failed')),
  constraint ingestion_runs_counts_non_negative check (
    request_count >= 0 and fetched_count >= 0 and accepted_count >= 0 and skipped_count >= 0 and upserted_count >= 0
  ),
  constraint ingestion_runs_finished_after_started check (finished_at is null or finished_at >= started_at)
);

create index ingestion_runs_source_started_at_idx on public.ingestion_runs (source, started_at desc);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


create trigger set_listings_updated_at
before update on public.listings
for each row execute function public.set_updated_at();

create trigger set_ingestion_runs_updated_at
before update on public.ingestion_runs
for each row execute function public.set_updated_at();

alter table public.listings enable row level security;
alter table public.ingestion_runs enable row level security;

revoke all on table public.listings from anon, authenticated;
revoke all on table public.ingestion_runs from anon, authenticated;

grant select, insert, update, delete on table public.listings to service_role;
grant select, insert, update, delete on table public.ingestion_runs to service_role;

create function public.reconcile_ticketmaster_full_sync(
  p_window_starts_at timestamptz,
  p_window_ends_at timestamptz,
  p_seen_external_ids text[]
)
returns table (reset_count integer, missed_count integer, inactivated_count integer)
language plpgsql
set search_path = public
as $$
begin
  return query
  with reset_rows as (
    update public.listings
    set missed_sync_count = 0
    where source = 'ticketmaster'
      and listing_type = 'event'
      and external_id = any(p_seen_external_ids)
      and missed_sync_count > 0
    returning 1
  ), missed_rows as (
    update public.listings
    set
      missed_sync_count = missed_sync_count + 1,
      status = case when missed_sync_count + 1 >= 2 then 'inactive' else status end
    where source = 'ticketmaster'
      and listing_type = 'event'
      and starts_at >= p_window_starts_at
      and starts_at < p_window_ends_at
      and not (external_id = any(p_seen_external_ids))
      and missed_sync_count < 2
      and status not in ('cancelled', 'postponed', 'rescheduled')
    returning missed_sync_count = 2 as became_inactive
  )
  select
    (select count(*)::integer from reset_rows),
    (select count(*)::integer from missed_rows),
    (select count(*)::integer from missed_rows where became_inactive);
end;
$$;

revoke all on function public.reconcile_ticketmaster_full_sync(timestamptz, timestamptz, text[]) from public;
grant execute on function public.reconcile_ticketmaster_full_sync(timestamptz, timestamptz, text[]) to service_role;
