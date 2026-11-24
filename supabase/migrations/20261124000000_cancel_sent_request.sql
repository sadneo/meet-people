-- Cancel only the outgoing request the caller actually saw.
create function public.cancel_sent_request(target_in uuid, requested_at_in timestamptz)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor uuid := safety_private.actor();
begin
  if target_in is null or target_in = actor or requested_at_in is null then
    raise exception 'Invalid sent request' using errcode = '22023';
  end if;
  perform social_private.lock_pair(actor, target_in);
  delete from public.connections
   where user_a = least(actor, target_in) and user_b = greatest(actor, target_in)
     and initiated_by = actor and status = 'pending' and created_at = requested_at_in;
  return found;
end;
$$;
revoke all on function public.cancel_sent_request(uuid,timestamptz) from public, anon;
grant execute on function public.cancel_sent_request(uuid,timestamptz) to authenticated;
