-- Passive adult Friends discovery, separate from queue_entries/active groups.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
do $$ begin
 if to_regprocedure('matching_private.scoring_signals(uuid)') is null
 or to_regprocedure('social_private.friends_discoverable(uuid)') is null
 or to_regprocedure('location_private.usable(text,uuid,uuid,text,text)') is null
 or to_regprocedure('dating_private.ranking(uuid)') is null
 or to_regprocedure('dating_private.lock_eligibility(uuid,uuid)') is null
 or to_regclass('photo_private.photos') is null then
  raise exception 'Reviewed profile/settings/safety/location/photo prerequisites missing' using errcode='22023';end if;
end $$;
create schema friends_private;
revoke all on schema friends_private from public,anon,authenticated;

create function friends_private.eligible(person uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join auth.users u on u.id=p.id
 join public.friends_search_preferences f on f.user_id=p.id
 join public.friends_search_location_refs r on r.user_id=p.id and r.id=(f.preferences->'searchArea'->>'resolvedLocationRef')::uuid
 join location_private.assertions proof on proof.mode='friends' and proof.id=r.id and proof.actor_id=p.id
 left join location_private.places place on place.id=proof.place_id
 where p.id=person and social_private.friends_discoverable(person)
 and u.is_anonymous is false and u.deleted_at is null and (u.banned_until is null or u.banned_until<=statement_timestamp())
 -- Product decision: this version is 18+, including direct RPC/action access.
 and extract(year from age((statement_timestamp() at time zone 'America/New_York')::date,p.birthdate)) between 18 and 99
 and public.valid_friends_search_preferences(f.preferences)
 -- Recheck TTL against the current clock after any projection/action lock wait.
 and proof.expires_at>clock_timestamp()
 and (proof.method<>'geocoded-area' or (place.enabled and place.verified_until>clock_timestamp()))
 and location_private.usable('friends',r.id,p.id,f.preferences->'searchArea'->>'source',
  case when f.preferences->'searchArea'->>'source'='home' then p.location_city else f.preferences->'searchArea'->>'areaLabel' end));
$$;
create function friends_private.pair_allowed(actor uuid,target uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.friends_search_preferences mine
 join public.friends_search_location_refs m on m.user_id=mine.user_id and m.id=(mine.preferences->'searchArea'->>'resolvedLocationRef')::uuid
 join public.friends_search_preferences other on other.user_id=target
 join public.friends_search_location_refs o on o.user_id=other.user_id and o.id=(other.preferences->'searchArea'->>'resolvedLocationRef')::uuid
 join public.profiles mp on mp.id=actor join public.profiles op on op.id=target
 where mine.user_id=actor and actor<>target
 and friends_private.eligible(actor) and friends_private.eligible(target)
 and public.safety_pair_allowed(actor,target)
 and extract(year from age((statement_timestamp() at time zone 'America/New_York')::date,op.birthdate))
  between (mine.preferences->>'ageMin')::integer and (mine.preferences->>'ageMax')::integer
 and extract(year from age((statement_timestamp() at time zone 'America/New_York')::date,mp.birthdate))
  between (other.preferences->>'ageMin')::integer and (other.preferences->>'ageMax')::integer
 and extensions.st_dwithin(
  extensions.st_setsrid(extensions.st_makepoint(m.longitude,m.latitude),4326)::extensions.geography,
  extensions.st_setsrid(extensions.st_makepoint(o.longitude,o.latitude),4326)::extensions.geography,
  least((mine.preferences->>'radiusMiles')::integer,(other.preferences->>'radiusMiles')::integer)*1609.344));
$$;

create function friends_private.lock_pair(actor uuid,target uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
begin
 perform 1 from auth.users u where u.id in(actor,target) order by u.id for share;
 perform social_private.lock_pair(actor,target);
 perform 1 from public.account_settings s where s.user_id in(actor,target) order by s.user_id for share;
 perform 1 from public.detailed_settings s where s.user_id in(actor,target) order by s.user_id for share;
 perform 1 from public.friends_search_location_refs r join public.friends_search_preferences f on f.user_id=r.user_id
  and r.id=(f.preferences->'searchArea'->>'resolvedLocationRef')::uuid where f.user_id in(actor,target) order by r.id for share of r;
 perform 1 from location_private.assertions a join public.friends_search_preferences f on f.user_id=a.actor_id
  and a.id=(f.preferences->'searchArea'->>'resolvedLocationRef')::uuid where a.mode='friends' and f.user_id in(actor,target) order by a.id for share of a;
 perform 1 from location_private.places p join location_private.assertions a on a.place_id=p.id
  join public.friends_search_preferences f on f.user_id=a.actor_id and a.id=(f.preferences->'searchArea'->>'resolvedLocationRef')::uuid
  where a.mode='friends' and f.user_id in(actor,target) order by p.id for share of p;
 perform 1 from public.friends_search_preferences f where f.user_id in(actor,target) order by f.user_id for share;
end $$;
create function friends_private.signals(person uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select matching_private.scoring_signals(person)||jsonb_build_object('goals',f.preferences->'goals')
 from public.friends_search_preferences f where f.user_id=person;
$$;
create index friends_discovery_location_gist on public.friends_search_location_refs
using gist ((extensions.st_setsrid(extensions.st_makepoint(longitude,latitude),4326)::extensions.geography));

-- Private inputs are returned only to the backend service, never an actor JWT.
create function public.get_friends_scoring_pool(actor_in uuid,excluded_in jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare result jsonb;begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server scoring only' using errcode='42501';end if;
 if jsonb_typeof(excluded_in) is distinct from 'array' then raise exception 'Invalid exclusions' using errcode='22023';end if;
 if jsonb_array_length(excluded_in)>200 or exists(select 1 from jsonb_array_elements(excluded_in) x
  where jsonb_typeof(x)<>'string' or not location_private.valid_uuid(x #>> '{}'))
 then raise exception 'Invalid exclusions' using errcode='22023';end if;
 if (select count(*)<>count(distinct value::uuid) from jsonb_array_elements_text(excluded_in)) then raise exception 'Duplicate exclusions' using errcode='22023';end if;
 if not friends_private.eligible(actor_in) then raise exception 'Friends discovery unavailable' using errcode='FR409';end if;
 with mine as (
  select f.preferences,r.latitude,r.longitude from public.friends_search_preferences f
  join public.friends_search_location_refs r on r.user_id=f.user_id and r.id=(f.preferences->'searchArea'->>'resolvedLocationRef')::uuid where f.user_id=actor_in
 ), nearby as materialized (
  select f.user_id,mine.preferences mine_preferences,f.preferences,
   extensions.st_distance(extensions.st_setsrid(extensions.st_makepoint(mine.longitude,mine.latitude),4326)::extensions.geography,
    extensions.st_setsrid(extensions.st_makepoint(r.longitude,r.latitude),4326)::extensions.geography)/1609.344 distance
  from mine join public.friends_search_location_refs r on
   extensions.st_dwithin(extensions.st_setsrid(extensions.st_makepoint(r.longitude,r.latitude),4326)::extensions.geography,
    extensions.st_setsrid(extensions.st_makepoint(mine.longitude,mine.latitude),4326)::extensions.geography,(mine.preferences->>'radiusMiles')::integer*1609.344)
  join public.friends_search_preferences f on f.user_id=r.user_id and r.id=(f.preferences->'searchArea'->>'resolvedLocationRef')::uuid
  where f.user_id<>actor_in and friends_private.pair_allowed(actor_in,f.user_id)
   and not exists(select 1 from jsonb_array_elements_text(excluded_in) x where x::uuid=f.user_id)
   and not exists(select 1 from public.connections c where c.user_a=least(actor_in,f.user_id) and c.user_b=greatest(actor_in,f.user_id))
  order by distance,f.user_id limit 100
 )
 select jsonb_build_object('viewer',friends_private.signals(actor_in),
 'candidates',coalesce(jsonb_agg(friends_private.signals(n.user_id)||jsonb_build_object(
  'id',n.user_id,'distanceMiles',n.distance,'viewerRadiusMiles',(n.mine_preferences->>'radiusMiles')::integer,
  'candidateRadiusMiles',(n.preferences->>'radiusMiles')::integer) order by n.distance,n.user_id),'[]')) into result from nearby n;
 return result;
end $$;

create function public.project_friends_candidates(targets_in jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=safety_private.actor(); target uuid; result jsonb:='[]'; person jsonb;distance double precision;
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'READ COMMITTED required' using errcode='25001';end if;
 if jsonb_typeof(targets_in) is distinct from 'array' then raise exception 'Invalid targets' using errcode='22023';end if;
 if jsonb_array_length(targets_in)>30 or exists(select 1 from jsonb_array_elements(targets_in) x where jsonb_typeof(x)<>'string' or not location_private.valid_uuid(x #>> '{}'))
 then raise exception 'Invalid targets' using errcode='22023';end if;
 if (select count(*)<>count(distinct value::uuid) from jsonb_array_elements_text(targets_in))
 or exists(select 1 from jsonb_array_elements_text(targets_in) x where x::uuid=actor) then raise exception 'Invalid targets' using errcode='22023';end if;
 -- Lock endpoint rows in global order before pair fences. No queue enrollment.
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
  if person is not null then result:=result||jsonb_build_array(person);end if;
 end loop;
 return jsonb_build_object('candidates',result);
end $$;

create function public.friends_discovery_connection(target_in uuid,action_in text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=safety_private.actor();current_connection public.connections;
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'READ COMMITTED required' using errcode='25001';end if;
 if target_in is null or target_in=actor or action_in is null or action_in not in('request','accept') then raise exception 'Invalid Friends action' using errcode='22023';end if;
 perform friends_private.lock_pair(actor,target_in);
 if not friends_private.pair_allowed(actor,target_in) then raise exception 'Friends connection unavailable' using errcode='42501';end if;
 select * into current_connection from public.connections c where c.user_a=least(actor,target_in) and c.user_b=greatest(actor,target_in);
 if action_in='request' and current_connection.status='pending' and current_connection.initiated_by<>actor then
  raise exception 'Accept the incoming request explicitly' using errcode='FR409';end if;
 if action_in='accept' and (current_connection.id is null or (current_connection.status<>'accepted' and current_connection.initiated_by=actor)) then
  raise exception 'No incoming Friends request' using errcode='FR409';end if;
 return public.social_connection(target_in,action_in);
end $$;

-- Private photo reads must honor the same Friends filters and location expiry.
-- Retain established-contact and existing Dating audiences; never widen either.
create or replace function photo_private.audience(viewer uuid,owner uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select viewer=owner or (public.safety_pair_allowed(viewer,owner) and (
  social_private.profile_audience(viewer,owner) or friends_private.pair_allowed(viewer,owner)
  or exists(select 1 from dating_private.ranking(viewer) r where r.person=owner)));
$$;
create or replace function photo_private.lock_audience(viewer uuid,owner uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
begin
 if viewer<>owner then
  perform friends_private.lock_pair(viewer,owner);
  perform dating_private.lock_eligibility(viewer,owner);
 else
  perform 1 from public.account_settings s where s.user_id=viewer for share;
  perform 1 from public.detailed_settings s where s.user_id=viewer for share;
 end if;
end $$;

revoke all on all functions in schema friends_private from public,anon,authenticated;
revoke all on function public.get_friends_scoring_pool(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.get_friends_scoring_pool(uuid,jsonb) to service_role;
revoke all on function public.project_friends_candidates(jsonb),public.friends_discovery_connection(uuid,text) from public,anon,authenticated;
grant execute on function public.project_friends_candidates(jsonb),public.friends_discovery_connection(uuid,text) to authenticated;
do $$ declare role_in text;f record;begin
 foreach role_in in array array['anon','authenticated'] loop
  if has_schema_privilege(role_in::name,'friends_private','USAGE')
   or has_function_privilege(role_in::name,'public.get_friends_scoring_pool(uuid,jsonb)','EXECUTE') then raise exception 'Friends ACL mismatch' using errcode='42501';end if;
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='friends_private' loop
   if has_function_privilege(role_in::name,f.oid,'EXECUTE') then raise exception 'Inherited Friends helper access' using errcode='42501';end if;
  end loop;
 end loop;
 if has_function_privilege('anon','public.project_friends_candidates(jsonb)','EXECUTE')
  or has_function_privilege('anon','public.friends_discovery_connection(uuid,text)','EXECUTE') then raise exception 'Anonymous Friends access' using errcode='42501';end if;
end $$;
commit;
