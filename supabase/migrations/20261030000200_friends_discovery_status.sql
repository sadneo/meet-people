-- Owner-only setup guidance for passive Friends. Eligibility remains enforced
-- independently by the scoring pool, projections, and connection actions.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create function public.get_friends_discovery_status() returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=safety_private.actor(); dob date; age_years integer; reason text;
begin
 select birthdate into dob from public.profiles where id=actor;
 if not found or dob is null then reason:='profile';
 else
  age_years:=extract(year from age((statement_timestamp() at time zone 'America/New_York')::date,dob));
  if age_years not between 18 and 99 then reason:='age';
  elsif not social_private.friends_discoverable(actor) then reason:='discovery_off';
  elsif not exists(select 1 from public.friends_search_preferences f
   where f.user_id=actor and public.valid_friends_search_preferences(f.preferences)
   and f.preferences->'searchArea'->>'resolvedLocationRef' is not null) then reason:='preferences';
  elsif not friends_private.eligible(actor) then reason:='location';
  end if;
 end if;
 return jsonb_build_object('available',true,'eligible',reason is null,'reason',reason);
end $$;
revoke all on function public.get_friends_discovery_status() from public,anon;
grant execute on function public.get_friends_discovery_status() to authenticated;
notify pgrst,'reload schema';
commit;
