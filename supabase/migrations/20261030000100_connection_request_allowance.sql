-- The same rolling allowance applies to Friends and Dating, including cancelled requests.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create function public.get_connection_request_allowance() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=safety_private.actor(); used_count integer; available_at timestamptz;
begin
 select count(*)::integer into used_count from public.connection_request_log
 where initiated_by=actor and created_at>now()-interval '24 hours';
 if used_count>=10 then
  -- Also handles older test fixtures with more than ten logged requests.
  select created_at+interval '24 hours' into available_at from public.connection_request_log
  where initiated_by=actor and created_at>now()-interval '24 hours'
  order by created_at desc offset 9 limit 1;
 end if;
 return jsonb_build_object('limit',10,'used',used_count,'remaining',greatest(0,10-used_count),'availableAt',available_at);
end $$;
revoke all on function public.get_connection_request_allowance() from public,anon;
grant execute on function public.get_connection_request_allowance() to authenticated;
notify pgrst,'reload schema';
commit;
