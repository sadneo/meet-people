-- Shared canonical weekly schedule metadata for passive Friends and Dating.
-- Independent of either mode's participation, filters, queue, or scorer.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
do $$ begin
 if to_regprocedure('safety_private.actor()') is null or to_regclass('public.availability') is null then
  raise exception 'Reviewed safety/profile prerequisites missing' using errcode='22023';end if;
end $$;
create schema matching_private;
revoke all on schema matching_private from public,anon,authenticated;
create table matching_private.scoring_settings (
 user_id uuid primary key references auth.users(id) on delete cascade,
 revision bigint not null check(revision between 1 and 9007199254740991),
 time_zone text,
 show_availability boolean not null default false
);
alter table matching_private.scoring_settings enable row level security;
revoke all on matching_private.scoring_settings from public,anon,authenticated;

create function public.get_matching_scoring_settings() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=safety_private.actor();begin
 return coalesce((select jsonb_build_object('revision',s.revision,'timeZone',s.time_zone,'showAvailability',s.show_availability)
 from matching_private.scoring_settings s where s.user_id=actor),
 '{"revision":0,"timeZone":null,"showAvailability":false}'::jsonb);
end $$;
create function public.save_matching_scoring_settings(settings_in jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=safety_private.actor(); previous bigint; expected bigint; zone_in text;
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'READ COMMITTED required' using errcode='25001';end if;
 if jsonb_typeof(settings_in) is distinct from 'object' then raise exception 'Invalid settings' using errcode='22023';end if;
 if (select count(*) from jsonb_object_keys(settings_in))<>3
 or not settings_in ?& array['expectedRevision','timeZone','showAvailability']
 or jsonb_typeof(settings_in->'expectedRevision') is distinct from 'number'
 or jsonb_typeof(settings_in->'showAvailability') is distinct from 'boolean'
 or jsonb_typeof(settings_in->'timeZone') not in('null','string') then raise exception 'Invalid settings' using errcode='22023';end if;
 if (settings_in->>'expectedRevision')::numeric not between 0 and 9007199254740990
 or trunc((settings_in->>'expectedRevision')::numeric)<>(settings_in->>'expectedRevision')::numeric then raise exception 'Invalid revision' using errcode='22023';end if;
 expected:=(settings_in->>'expectedRevision')::bigint; zone_in:=settings_in->>'timeZone';
 if zone_in is not null and (char_length(zone_in)>100 or (zone_in<>'UTC' and position('/' in zone_in)=0)
 or not exists(select 1 from pg_catalog.pg_timezone_names where name=zone_in)) then raise exception 'Invalid timezone' using errcode='22023';end if;
 -- The profile fence is shared with all canonical availability writers.
 perform 1 from public.profiles p where p.id=actor for update;
 if not found then raise exception 'Profile required' using errcode='42501';end if;
 select revision into previous from matching_private.scoring_settings where user_id=actor for update;
 if coalesce(previous,0)<>expected then raise exception 'Settings changed' using errcode='DA409';end if;
 insert into matching_private.scoring_settings(user_id,revision,time_zone,show_availability)
 values(actor,expected+1,zone_in,(settings_in->>'showAvailability')::boolean)
 on conflict(user_id) do update set revision=excluded.revision,time_zone=excluded.time_zone,show_availability=excluded.show_availability;
 return public.get_matching_scoring_settings();
end $$;

-- Date-specific intervals. Both modes use this exact same canonical schedule.
create function matching_private.scoring_signals(person uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'interests',coalesce((select jsonb_agg(i.text order by i.text collate "C") from public.user_interests i where i.profile_id=person),'[]'),
 'intervals',case when s.time_zone is null then null else coalesce((
  select jsonb_agg(jsonb_build_object('start',bounds.starts_at,'end',bounds.ends_at) order by bounds.starts_at)
  from generate_series(0,14) day_offset
  join public.availability a on a.profile_id=person
   and a.dow=extract(dow from (statement_timestamp() at time zone s.time_zone)::date+day_offset)::integer
  cross join lateral(select
   (statement_timestamp() at time zone s.time_zone)::date+day_offset+(a.start_time-time '00:00') local_start,
   (statement_timestamp() at time zone s.time_zone)::date+day_offset+(a.end_time-time '00:00') local_end) wall
  cross join lateral(select greatest(wall.local_start at time zone s.time_zone,statement_timestamp()) starts_at,
   least(wall.local_end at time zone s.time_zone,statement_timestamp()+interval '14 days') ends_at) bounds
  where bounds.ends_at>bounds.starts_at
   -- Nonexistent spring-forward boundary: discard rather than invent a time.
   and ((wall.local_start at time zone s.time_zone) at time zone s.time_zone)=wall.local_start
   and ((wall.local_end at time zone s.time_zone) at time zone s.time_zone)=wall.local_end
 ),'[]') end)
 from public.profiles d left join matching_private.scoring_settings s on s.user_id=d.id
 where d.id=person;
$$;


revoke all on function matching_private.scoring_signals(uuid) from public,anon,authenticated;
revoke all on function public.get_matching_scoring_settings(),public.save_matching_scoring_settings(jsonb) from public,anon,authenticated;
grant execute on function public.get_matching_scoring_settings(),public.save_matching_scoring_settings(jsonb) to authenticated;
do $$ declare role_in text;begin
 foreach role_in in array array['anon','authenticated'] loop
  if has_schema_privilege(role_in::name,'matching_private','USAGE')
   or has_table_privilege(role_in::name,'matching_private.scoring_settings','SELECT')
   or has_function_privilege(role_in::name,'matching_private.scoring_signals(uuid)','EXECUTE') then
   raise exception 'Inherited schedule helper access' using errcode='42501';end if;
 end loop;
end $$;
commit;
