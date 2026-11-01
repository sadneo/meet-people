-- Dating rules v1. Requires reviewed owner/location/safety/social/Dating demo
-- contracts listed in docs/dating-matchmaking.md; never silently adopts schemas.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
do $$ begin
 if to_regprocedure('dating_private.lock_eligibility(uuid,uuid)') is null
 or to_regprocedure('location_private.usable(text,uuid,uuid,text,text)') is null
 or to_regclass('public.dating_owner_aggregates') is null
 or to_regprocedure('matching_private.scoring_signals(uuid)') is null
 or to_regnamespace('extensions') is null then
  raise exception 'Reviewed Dating/location/safety prerequisites missing' using errcode='22023';
 end if;
end $$;

-- Reuse the explicit target field; never populate it from gender/sexuality.
-- Legacy inferred participants are paused and must explicitly choose targets.
-- Existing connections, messages and profile facts are not deleted.
create or replace function public.dating_clear_targets(p jsonb) returns jsonb
language sql immutable set search_path='' as $$ select null::jsonb; $$;
create or replace function public.dating_targets(p jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select case when p->>'gender'='' then null else nullif(p->'clarifiedTargets','[]'::jsonb) end;
$$;
update public.dating_owner_aggregates
set profile=jsonb_set(profile,'{enabled}','false'),
 profile_revision=profile_revision+1,search_revision=search_revision+1
where profile->>'enabled'='true' and jsonb_array_length(profile->'clarifiedTargets')=0;

-- Compatibility RPC names retained for the existing Dating client.
create function public.get_dating_scoring_settings() returns jsonb
language sql stable security definer set search_path='' as $$ select public.get_matching_scoring_settings(); $$;
create function public.save_dating_scoring_settings(settings_in jsonb) returns jsonb
language sql volatile security definer set search_path='' as $$ select public.save_matching_scoring_settings(settings_in); $$;
create function dating_private.scoring_signals(person uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select matching_private.scoring_signals(person)||jsonb_build_object('intention',d.profile->>'intent')
 from public.dating_owner_aggregates d where d.user_id=person;
$$;

-- Existing selected mode anchors, never profiles.latitude or device fallback.
create index dating_rules_location_gist on public.dating_search_location_refs
using gist ((extensions.st_setsrid(extensions.st_makepoint(longitude,latitude),4326)::extensions.geography));

create function dating_private.rules_pair(actor uuid,target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(exists(
 select 1 from public.dating_owner_aggregates mine
 join public.dating_search_location_refs m on m.user_id=mine.user_id and m.id=(mine.search->'searchArea'->>'resolvedLocationRef')::uuid
 join public.dating_owner_aggregates other on other.user_id=target
 join public.dating_search_location_refs o on o.user_id=other.user_id and o.id=(other.search->'searchArea'->>'resolvedLocationRef')::uuid
 join public.profiles mp on mp.id=actor join public.profiles op on op.id=target
 join auth.users mu on mu.id=actor join auth.users ou on ou.id=target
 where mine.user_id=actor and actor<>target
 and mine.profile->>'enabled'='true' and other.profile->>'enabled'='true'
 and dating_private.eligible(actor) and dating_private.eligible(target)
 and (mu.banned_until is null or mu.banned_until<=statement_timestamp())
 and (ou.banned_until is null or ou.banned_until<=statement_timestamp())
 and not coalesce(mu.is_anonymous,false) and not coalesce(ou.is_anonymous,false)
 and mu.deleted_at is null and ou.deleted_at is null
 and public.safety_pair_allowed(actor,target)
 and (mine.profile->'clarifiedTargets') ? (other.profile->>'gender')
 and (other.profile->'clarifiedTargets') ? (mine.profile->>'gender')
 and extract(year from age(public.dating_campus_date(statement_timestamp()),op.birthdate)) between (mine.search->>'ageMin')::integer and (mine.search->>'ageMax')::integer
 and extract(year from age(public.dating_campus_date(statement_timestamp()),mp.birthdate)) between (other.search->>'ageMin')::integer and (other.search->>'ageMax')::integer
 and extensions.st_dwithin(
  extensions.st_setsrid(extensions.st_makepoint(m.longitude,m.latitude),4326)::extensions.geography,
  extensions.st_setsrid(extensions.st_makepoint(o.longitude,o.latitude),4326)::extensions.geography,
  least((mine.search->>'radiusMiles')::integer,(other.search->>'radiusMiles')::integer)*1609.344)
 ),false);
$$;

-- SERVICE ONLY: these inputs contain non-public intentions and schedules.
-- The API supplies actor_in from its verified session, never the HTTP body.
create function public.get_dating_scoring_pool(actor_in uuid,excluded_in jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server scoring only' using errcode='42501';end if;
 if jsonb_typeof(excluded_in) is distinct from 'array' then raise exception 'Invalid exclusions' using errcode='22023';end if;
 if jsonb_array_length(excluded_in)>50 or exists(select 1 from jsonb_array_elements(excluded_in) x where jsonb_typeof(x)<>'string' or not location_private.valid_uuid(x #>> '{}')) then raise exception 'Invalid exclusions' using errcode='22023';end if;
 if not dating_private.eligible(actor_in) or not exists(select 1 from public.dating_owner_aggregates d where d.user_id=actor_in and d.profile->>'enabled'='true') then raise exception 'Dating unavailable' using errcode='DL409';end if;
 with mine as (
  select d.search,r.latitude,r.longitude from public.dating_owner_aggregates d
  join public.dating_search_location_refs r on r.user_id=d.user_id and r.id=(d.search->'searchArea'->>'resolvedLocationRef')::uuid where d.user_id=actor_in
 ), nearby as materialized (
  select d.user_id,mine.search mine_search,d.search,
   extensions.st_distance(extensions.st_setsrid(extensions.st_makepoint(mine.longitude,mine.latitude),4326)::extensions.geography,
    extensions.st_setsrid(extensions.st_makepoint(r.longitude,r.latitude),4326)::extensions.geography)/1609.344 distance
  from mine join public.dating_search_location_refs r on
   extensions.st_dwithin(extensions.st_setsrid(extensions.st_makepoint(r.longitude,r.latitude),4326)::extensions.geography,
    extensions.st_setsrid(extensions.st_makepoint(mine.longitude,mine.latitude),4326)::extensions.geography,(mine.search->>'radiusMiles')::integer*1609.344)
  join public.dating_owner_aggregates d on d.user_id=r.user_id and r.id=(d.search->'searchArea'->>'resolvedLocationRef')::uuid
  where d.user_id<>actor_in and not exists(select 1 from jsonb_array_elements_text(excluded_in) x where x::uuid=d.user_id)
   and not exists(select 1 from public.connections c where c.user_a=least(actor_in,d.user_id) and c.user_b=greatest(actor_in,d.user_id))
   and dating_private.rules_pair(actor_in,d.user_id)
  order by distance,d.user_id limit 100
 )
 select jsonb_build_object('viewer',dating_private.scoring_signals(actor_in),
 'candidates',coalesce(jsonb_agg(dating_private.scoring_signals(n.user_id)||jsonb_build_object(
  'id',n.user_id,'distanceMiles',n.distance,'viewerRadiusMiles',(n.mine_search->>'radiusMiles')::integer,
  'candidateRadiusMiles',(n.search->>'radiusMiles')::integer) order by n.distance,n.user_id),'[]')) into result from nearby n;
 return result;
end $$;

-- Legacy candidate/photo RPCs must not bypass the new hard policy when invoked
-- directly. Preserve their distance-first ordering; only eligibility is shared.
create or replace function dating_private.ranking(actor uuid)
returns table(person uuid,distance_miles double precision,interest_count bigint)
language sql stable security definer set search_path='' as $$
 select other.person,
  extensions.st_distance(extensions.st_setsrid(extensions.st_makepoint(mine.longitude,mine.latitude),4326)::extensions.geography,
   extensions.st_setsrid(extensions.st_makepoint(other.longitude,other.latitude),4326)::extensions.geography)/1609.344,
  (select count(distinct public.profile_language_key(a.text)) from public.user_interests a where a.profile_id=actor
   and exists(select 1 from public.user_interests b where b.profile_id=other.person and public.profile_language_key(b.text)=public.profile_language_key(a.text)))
 from dating_private.people() mine cross join dating_private.people() other
 where mine.person=actor and other.person<>actor and dating_private.rules_pair(actor,other.person);
$$;

create function public.project_dating_candidate(target_in uuid) returns jsonb
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
 return jsonb_build_object('candidate',result);
end $$;

-- Keep existing request semantics and idempotency while applying the same hard
-- constraints to writes. This does not infer mutual Dating likes from Friends.
create or replace function public.request_dating_connection(target_in uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=safety_private.actor();begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'READ COMMITTED required' using errcode='25001';end if;
 if target_in is null or target_in=actor then raise exception 'Invalid target' using errcode='22023';end if;
 perform 1 from auth.users u where u.id in(actor,target_in) order by u.id for share;
 perform dating_private.lock_eligibility(actor,target_in);
 if not dating_private.rules_pair(actor,target_in) then raise exception 'Dating connection unavailable' using errcode='DL409';end if;
 return public.social_connection(target_in,'request');
end $$;

revoke all on function dating_private.scoring_signals(uuid),dating_private.rules_pair(uuid,uuid) from public,anon,authenticated;
revoke all on function public.get_dating_scoring_pool(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.get_dating_scoring_pool(uuid,jsonb) to service_role;
revoke all on function public.get_dating_scoring_settings(),public.save_dating_scoring_settings(jsonb),public.project_dating_candidate(uuid) from public,anon,authenticated;
grant execute on function public.get_dating_scoring_settings(),public.save_dating_scoring_settings(jsonb),public.project_dating_candidate(uuid) to authenticated;
commit;
