begin;

-- Shared list/detail contract for the API; browser roles cannot query it directly.
create or replace function public.public_live_events(
  p_category text default null,
  p_offset integer default 0,
  p_limit integer default 12,
  p_id uuid default null
)
returns table (
  id uuid, title text, description text, category text,
  starts_at timestamptz, ends_at timestamptz,
  location_name text, address text, city text,
  image_url text, source text, source_url text, status text,
  latitude double precision, longitude double precision
)
language sql stable security invoker set search_path = '' as $$
  select l.id, l.title, l.description, l.category, l.starts_at, l.ends_at,
    l.location_name, l.address, l.city, l.image_url, l.source, l.source_url,
    l.status, l.latitude, l.longitude
  from public.listings l
  where l.listing_type = 'event'
    and l.status in ('active', 'rescheduled')
    and (l.starts_at >= now() or l.ends_at >= now())
    and (p_category is null or l.category = p_category)
    and (p_id is null or l.id = p_id)
  order by l.starts_at, l.id
  limit p_limit offset p_offset;
$$;

revoke all on function public.public_live_events(text, integer, integer, uuid) from public, anon, authenticated;
grant execute on function public.public_live_events(text, integer, integer, uuid) to service_role;

notify pgrst, 'reload schema';
commit;
