alter table public.listings
add column details_synced_at timestamptz;

create function public.reconcile_sbengaged_full_sync(
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
    where source = 'sbengaged'
      and listing_type = 'event'
      and external_id = any(p_seen_external_ids)
      and missed_sync_count > 0
    returning 1
  ), missed_rows as (
    update public.listings
    set
      missed_sync_count = missed_sync_count + 1,
      status = case when missed_sync_count + 1 >= 2 then 'inactive' else status end
    where source = 'sbengaged'
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

revoke all on function public.reconcile_sbengaged_full_sync(timestamptz, timestamptz, text[]) from public;
grant execute on function public.reconcile_sbengaged_full_sync(timestamptz, timestamptz, text[]) to service_role;
