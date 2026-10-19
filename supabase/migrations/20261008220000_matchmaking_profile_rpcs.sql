-- Caller-owned atomic profile persistence over Winso's existing schema.
-- No ranking changes, extra tables, provider bypass, or seed data.
-- Rollback source: DROP FUNCTION public.save_matchmaking_profile(jsonb);
--                  DROP FUNCTION public.get_matchmaking_profile();

create function public.get_matchmaking_profile()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare actor uuid := auth.uid(); snapshot jsonb;
begin
  if actor is null then raise exception 'Not authenticated' using errcode='28000'; end if;
  select jsonb_build_object(
    'username',p.username,'display_name',p.display_name,'bio',p.bio,
    'birthdate',p.birthdate,'location_city',p.location_city,'avatar_url',p.avatar_url,
    'interests',coalesce((select jsonb_agg(i.text order by i.text) from public.user_interests i where i.profile_id=actor),'[]'::jsonb),
    'availability',coalesce((select jsonb_agg(jsonb_build_object('dow',a.dow,'start_time',to_char(a.start_time,'HH24:MI:SS'),'end_time',case when a.end_time=time '24:00:00' then '24:00:00' else to_char(a.end_time,'HH24:MI:SS') end) order by a.dow,a.start_time,a.end_time) from public.availability a where a.profile_id=actor),'[]'::jsonb)
  ) into snapshot from public.profiles p where p.id=actor;
  return snapshot;
end;
$$;

create function public.save_matchmaking_profile(profile_in jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid(); item jsonb; labels text[] := '{}'::text[];
  username_in text; name_in text; city_in text; date_in date;
  label_in text; avatar_parts text[];
begin
  if actor is null then raise exception 'Not authenticated' using errcode='28000'; end if;
  if profile_in is null or jsonb_typeof(profile_in)<>'object' then
    raise exception 'Invalid profile' using errcode='22023'; end if;
  if (select count(*) from jsonb_object_keys(profile_in))<>8 or not profile_in ?& array['username','display_name','bio','birthdate','location_city','avatar_url','interests','availability'] then
    raise exception 'Invalid profile fields' using errcode='22023'; end if;
  if jsonb_typeof(profile_in->'username')<>'string' or jsonb_typeof(profile_in->'display_name')<>'string' then
    raise exception 'Invalid profile names' using errcode='22023'; end if;
  username_in:=regexp_replace(profile_in->>'username','^\s+|\s+$','','g');
  name_in:=regexp_replace(profile_in->>'display_name','^\s+|\s+$','','g');
  if char_length(username_in) not between 1 and 80 or char_length(name_in) not between 1 and 120 then
    raise exception 'Invalid profile names' using errcode='22023'; end if;
  if jsonb_typeof(profile_in->'bio') not in ('string','null') or char_length(profile_in->>'bio')>1000 then
    raise exception 'Invalid bio' using errcode='22023'; end if;
  if jsonb_typeof(profile_in->'location_city') not in ('string','null') then
    raise exception 'Invalid area' using errcode='22023'; end if;
  city_in:=regexp_replace(profile_in->>'location_city','^\s+|\s+$','','g');
  if char_length(city_in)>120 then raise exception 'Invalid area' using errcode='22023'; end if;
  if jsonb_typeof(profile_in->'birthdate') not in ('string','null') then
    raise exception 'Invalid birthdate' using errcode='22023'; end if;
  if profile_in->>'birthdate' is not null then
    if (profile_in->>'birthdate') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'Invalid birthdate' using errcode='22023'; end if;
    begin
      date_in:=(profile_in->>'birthdate')::date;
    exception when datetime_field_overflow or invalid_datetime_format then
      raise exception 'Invalid birthdate' using errcode='22023';
    end;
    if to_char(date_in,'YYYY-MM-DD')<>profile_in->>'birthdate' then
      raise exception 'Invalid birthdate' using errcode='22023'; end if;
  end if;
  if jsonb_typeof(profile_in->'avatar_url') not in ('string','null') then
    raise exception 'Invalid avatar' using errcode='22023'; end if;
  if profile_in->>'avatar_url' is not null then
    avatar_parts:=regexp_match(profile_in->>'avatar_url','^https://([a-z0-9]([a-z0-9.-]*[a-z0-9])?)(:([0-9]{1,5}))?([/?#][^[:space:]]*)?$','i');
    if avatar_parts is null or substring(avatar_parts[1] from '[^.]+$') !~* '^[a-z]([a-z0-9-]*[a-z0-9])?$' or char_length(profile_in->>'avatar_url')>2048 then
      raise exception 'Invalid avatar' using errcode='22023';
    end if;
    if avatar_parts[4] is not null and avatar_parts[4]::integer>65535 then
      raise exception 'Invalid avatar port' using errcode='22023';
    end if;
  end if;
  if jsonb_typeof(profile_in->'interests')<>'array' or jsonb_typeof(profile_in->'availability')<>'array' then
    raise exception 'Invalid profile lists' using errcode='22023'; end if;
  if jsonb_array_length(profile_in->'interests')>30 or jsonb_array_length(profile_in->'availability')>56 then
    raise exception 'Profile lists too long' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(profile_in->'interests') loop
    if jsonb_typeof(item)<>'string' then raise exception 'Invalid interest' using errcode='22023'; end if;
    label_in:=regexp_replace(item #>> '{}','^\s+|\s+$','','g');
    if char_length(label_in) not between 1 and 120 or label_in=any(labels) then
      raise exception 'Invalid or duplicate interest' using errcode='22023'; end if;
    labels:=array_append(labels,label_in);
  end loop;
  for item in select value from jsonb_array_elements(profile_in->'availability') loop
    if jsonb_typeof(item)<>'object' then raise exception 'Invalid window' using errcode='22023'; end if;
    if (select count(*) from jsonb_object_keys(item))<>3 or not item ?& array['dow','start_time','end_time'] then
      raise exception 'Invalid window fields' using errcode='22023'; end if;
    if jsonb_typeof(item->'dow')<>'number' or (item->>'dow')::numeric not between 0 and 6 or trunc((item->>'dow')::numeric)<>(item->>'dow')::numeric then
      raise exception 'Invalid window day' using errcode='22023'; end if;
    if jsonb_typeof(item->'start_time')<>'string' or jsonb_typeof(item->'end_time')<>'string' then
      raise exception 'Invalid window time' using errcode='22023'; end if;
    if (item->>'start_time') !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]|24:00:00)$' or (item->>'end_time') !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]|24:00:00)$' then
      raise exception 'Invalid window time' using errcode='22023'; end if;
    if (item->>'start_time')::time >= (item->>'end_time')::time then
      raise exception 'Invalid window ordering' using errcode='22023'; end if;
  end loop;
  if exists (
    select 1 from jsonb_array_elements(profile_in->'availability') with ordinality a(value,n)
    join jsonb_array_elements(profile_in->'availability') with ordinality b(value,n)
    on a.n<b.n and (a.value->>'dow')::numeric=(b.value->>'dow')::numeric
    where (a.value->>'start_time')::time < (b.value->>'end_time')::time
      and (b.value->>'start_time')::time < (a.value->>'end_time')::time
  ) then raise exception 'Overlapping windows' using errcode='22023'; end if;

  -- Same-user RPC writers serialize. No user-supplied actor/lock key.
  perform pg_advisory_xact_lock(hashtextextended('matchmaking-profile:' || actor::text,0));
  insert into public.profiles(id,username,display_name,bio,birthdate,location_city,avatar_url)
    values(actor,username_in,name_in,profile_in->>'bio',date_in,city_in,profile_in->>'avatar_url')
    on conflict(id) do update set username=excluded.username,display_name=excluded.display_name,
      bio=excluded.bio,birthdate=excluded.birthdate,location_city=excluded.location_city,
      avatar_url=excluded.avatar_url;
  delete from public.user_interests where profile_id=actor and not (text=any(labels));
  -- Filter BEFORE INSERT: ON CONFLICT alone would still fire BEFORE triggers.
  -- Legacy trigger helpers resolve public names. Fail closed if the schema
  -- permits browser roles to create shadow functions.
  if has_schema_privilege('authenticated','public','CREATE') or has_schema_privilege('anon','public','CREATE') then
    raise exception 'Unsafe trigger schema privileges' using errcode='42501';
  end if;
  perform set_config('search_path','pg_catalog, public',true);
  insert into public.user_interests(profile_id,text)
    select actor,label from unnest(labels) label
    where not exists(select 1 from public.user_interests i where i.profile_id=actor and i.text=label);
  perform set_config('search_path','',true);
  delete from public.availability where profile_id=actor;
  insert into public.availability(profile_id,dow,start_time,end_time)
    select actor,(value->>'dow')::numeric::integer,(value->>'start_time')::time,(value->>'end_time')::time
    from jsonb_array_elements(profile_in->'availability');
  return public.get_matchmaking_profile();
end;
$$;

revoke all on function public.get_matchmaking_profile() from public, anon;
revoke all on function public.save_matchmaking_profile(jsonb) from public, anon;
grant execute on function public.get_matchmaking_profile() to authenticated;
grant execute on function public.save_matchmaking_profile(jsonb) to authenticated;
