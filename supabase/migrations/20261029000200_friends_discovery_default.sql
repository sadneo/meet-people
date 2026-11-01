-- Friends is opt-out; Dating and notification categories remain opt-in.
-- Missing choices use the default without writing rows or replacing saved opt-outs.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';

create or replace function public.get_detailed_settings()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); result jsonb;
begin
  if actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select jsonb_build_object('revision',coalesce(d.revision,0),'settings',v.choices,
    'masters',v.masters,'effective',public.effective_detailed_settings(v.choices,v.masters)) into result
  from (values(actor)) me(id)
  left join public.detailed_settings d on d.user_id=me.id
  left join public.account_settings a on a.user_id=me.id
  cross join lateral (select
    coalesce(d.settings,'{"messages":false,"plans":false,"matches":false,"friendsDiscovery":true,"datingDiscovery":false}'::jsonb) as choices,
    public.detailed_settings_masters(a.settings) as masters) v;
  return result;
end $$;
revoke all on function public.get_detailed_settings() from public,anon,authenticated;
grant execute on function public.get_detailed_settings() to authenticated;

create or replace function social_private.friends_discoverable(person uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select social_private.discoverable(person) and coalesce(
    (select (s.settings->>'friendsDiscovery')::boolean from public.detailed_settings s where s.user_id=person),true);
$$;
revoke all on function social_private.friends_discoverable(uuid) from public,anon,authenticated;

notify pgrst,'reload schema';
commit;
