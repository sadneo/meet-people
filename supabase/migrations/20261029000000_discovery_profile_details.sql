-- Extend already-authorized candidate projections, never expose owner snapshots.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create function matching_private.discovery_details(viewer uuid, target uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare facts jsonb; details jsonb := '{}'; overlap jsonb := null; zone text;
begin
 select d.facts into facts from public.profile_details d where d.user_id=target for share;
 if facts->'visibility'->>'education'='true' and facts->>'education'<>'' then
  details:=details||jsonb_build_object('education',facts->'education');end if;
 if facts->'visibility'->>'occupation'='true' and facts->>'occupation'<>'' then
  details:=details||jsonb_build_object('occupation',facts->'occupation');end if;
 if facts->'visibility'->>'languages'='true' and jsonb_array_length(facts->'languages')>0 then
  details:=details||jsonb_build_object('languages',facts->'languages');end if;

 -- Both people must opt into summaries. Only return one coarse viewer-local
 -- weekday/period with at least 30 common minutes, never dates or exact bounds.
 select v.time_zone into zone from matching_private.scoring_settings v
 join matching_private.scoring_settings t on t.user_id=target
 where v.user_id=viewer and v.show_availability and t.show_availability
 and v.time_zone is not null and t.time_zone is not null;
 if zone is not null then
  with mine as (
   select (x->>'start')::timestamptz lo,(x->>'end')::timestamptz hi
   from jsonb_array_elements(matching_private.scoring_signals(viewer)->'intervals') x
  ), theirs as (
   select (x->>'start')::timestamptz lo,(x->>'end')::timestamptz hi
   from jsonb_array_elements(matching_private.scoring_signals(target)->'intervals') x
  ), periods as (
   select local_date local_day, period.label,
    (local_date+period.start_hour*interval '1 hour') at time zone zone lo,
    (local_date+period.end_hour*interval '1 hour') at time zone zone hi
   from generate_series(0,14) offset_in
   cross join lateral (select (statement_timestamp() at time zone zone)::date+offset_in as local_date) dates
   cross join (values ('late night',0,6),('morning',6,12),('afternoon',12,18),('evening',18,24)) period(label,start_hour,end_hour)
  )
  select jsonb_build_object('dayOfWeek',extract(dow from p.local_day)::integer,'period',p.label,'timeZone',zone)
  into overlap from mine m cross join theirs t cross join periods p
  where least(m.hi,t.hi,p.hi)-greatest(m.lo,t.lo,p.lo)>=interval '30 minutes'
  order by greatest(m.lo,t.lo,p.lo),p.label limit 1;
 end if;
 return jsonb_build_object('details',details,'sharedAvailability',overlap);
end $$;
revoke all on function matching_private.discovery_details(uuid,uuid) from public,anon,authenticated;

create or replace function public.project_dating_candidate(target_in uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=safety_private.actor(); result jsonb;distance double precision;
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'READ COMMITTED required' using errcode='25001';end if;
 if target_in is null or target_in=actor then raise exception 'Invalid target' using errcode='22023';end if;
 perform 1 from auth.users u where u.id in(actor,target_in) order by u.id for share;
 perform dating_private.lock_eligibility(actor,target_in);
 if not dating_private.rules_pair(actor,target_in)
 or exists(select 1 from public.connections c where c.user_a=least(actor,target_in) and c.user_b=greatest(actor,target_in)) then return '{"candidate":null}';end if;
 select extensions.st_distance(extensions.st_setsrid(extensions.st_makepoint(m.longitude,m.latitude),4326)::extensions.geography,
  extensions.st_setsrid(extensions.st_makepoint(o.longitude,o.latitude),4326)::extensions.geography)/1609.344 into distance
 from public.dating_owner_aggregates md join public.dating_search_location_refs m on m.id=(md.search->'searchArea'->>'resolvedLocationRef')::uuid
 cross join public.dating_owner_aggregates od join public.dating_search_location_refs o on o.id=(od.search->'searchArea'->>'resolvedLocationRef')::uuid
 where md.user_id=actor and od.user_id=target_in;
 select jsonb_build_object('id',p.id,'name',p.display_name,'age',extract(year from age(public.dating_campus_date(statement_timestamp()),p.birthdate))::integer,
 'city',p.location_city,'bio',p.bio,'avatar',case when photo.user_id is null then p.avatar_url else null end,
 'photoRevision',case when photo.jpeg is null then 0 else photo.revision end,
 'interests',coalesce((select jsonb_agg(i.text order by i.text collate "C") from public.user_interests i where i.profile_id=p.id),'[]'),
 'areaDistanceMiles',ceil(distance)::integer,
 'heightInches',case when d.profile->'visibility'->>'height'='true' then (d.profile->>'heightInches')::integer else null end,
 'gender',case when d.profile->'visibility'->>'gender'='true' then d.profile->>'gender' else null end,
 'sexuality',case when d.profile->'visibility'->>'sexuality'='true' then d.profile->>'sexuality' else null end,
 'intent',d.profile->>'intent','style',d.profile->>'style') into result
 from public.profiles p join public.dating_owner_aggregates d on d.user_id=p.id left join photo_private.photos photo on photo.user_id=p.id where p.id=target_in;
 if result is not null then result:=result||matching_private.discovery_details(actor,target_in);end if;
 return jsonb_build_object('candidate',result);
end $$;

create or replace function public.project_friends_candidates(targets_in jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=safety_private.actor(); target uuid; result jsonb:='[]'; person jsonb;distance double precision;
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'READ COMMITTED required' using errcode='25001';end if;
 if jsonb_typeof(targets_in) is distinct from 'array' then raise exception 'Invalid targets' using errcode='22023';end if;
 if jsonb_array_length(targets_in)>30 or exists(select 1 from jsonb_array_elements(targets_in) x where jsonb_typeof(x)<>'string' or not location_private.valid_uuid(x #>> '{}'))
 then raise exception 'Invalid targets' using errcode='22023';end if;
 if (select count(*)<>count(distinct value::uuid) from jsonb_array_elements_text(targets_in))
 or exists(select 1 from jsonb_array_elements_text(targets_in) x where x::uuid=actor) then raise exception 'Invalid targets' using errcode='22023';end if;
 perform 1 from auth.users u where u.id=actor or u.id in(select value::uuid from jsonb_array_elements_text(targets_in)) order by u.id for share;
 perform 1 from public.profiles p where p.id=actor or p.id in(select value::uuid from jsonb_array_elements_text(targets_in)) order by p.id for share;
 for target in select value::uuid from jsonb_array_elements_text(targets_in) order by value::uuid loop
  perform friends_private.lock_pair(actor,target);
  if not friends_private.pair_allowed(actor,target) or exists(select 1 from public.connections c where c.user_a=least(actor,target) and c.user_b=greatest(actor,target)) then continue;end if;
  select extensions.st_distance(extensions.st_setsrid(extensions.st_makepoint(m.longitude,m.latitude),4326)::extensions.geography,
   extensions.st_setsrid(extensions.st_makepoint(o.longitude,o.latitude),4326)::extensions.geography)/1609.344 into distance
  from public.friends_search_preferences mf join public.friends_search_location_refs m on m.id=(mf.preferences->'searchArea'->>'resolvedLocationRef')::uuid
  cross join public.friends_search_preferences ofp join public.friends_search_location_refs o on o.id=(ofp.preferences->'searchArea'->>'resolvedLocationRef')::uuid
  where mf.user_id=actor and ofp.user_id=target;
  select jsonb_build_object('id',p.id,'name',p.display_name,
   'age',extract(year from age((statement_timestamp() at time zone 'America/New_York')::date,p.birthdate))::integer,
   'city',p.location_city,'bio',p.bio,'avatar',case when photo.user_id is null then p.avatar_url else null end,
   'photoRevision',case when photo.jpeg is null then 0 else photo.revision end,
   'interests',coalesce((select jsonb_agg(i.text order by i.text collate "C") from public.user_interests i where i.profile_id=p.id),'[]'),
   'areaDistanceMiles',ceil(distance)::integer) into person
  from public.profiles p left join photo_private.photos photo on photo.user_id=p.id where p.id=target;
  if person is not null then result:=result||jsonb_build_array(person||matching_private.discovery_details(actor,target));end if;
 end loop;
 return jsonb_build_object('candidates',result);
end $$;
notify pgrst,'reload schema';
commit;
