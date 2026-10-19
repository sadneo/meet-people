-- REVIEW CANDIDATE. Daniel explicitly authorized real signed-in Dating for demo.
-- No Dating queue, fabricated mutual match, groups, rewards or auto-discovery.
begin;
set local lock_timeout='3s';set local statement_timeout='30s';
do $$ begin
 if to_regclass('photo_private.photos') is null or to_regprocedure('public.dating_reciprocal_targets(jsonb,jsonb)') is null or to_regprocedure('social_private.profile_audience(uuid,uuid)') is null then raise exception 'Real Dating prerequisites missing' using errcode='22023';end if;
end $$;
create schema dating_private;
revoke all on schema dating_private from public,anon,authenticated;
create function dating_private.eligible(person uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.dating_owner_aggregates d join public.profiles p on p.id=d.user_id join public.detailed_settings s on s.user_id=p.id
 where p.id=person and social_private.discoverable(person) and s.settings->>'datingDiscovery'='true' and public.valid_dating_profile(d.profile) and public.dating_complete(d.profile)
 and public.dating_adult_on(p.birthdate,public.dating_campus_date(statement_timestamp())) and d.search<>'null'::jsonb and public.valid_dating_search(d.search)
 and location_private.usable('dating',(d.search->'searchArea'->>'resolvedLocationRef')::uuid,person,d.search->'searchArea'->>'source',case when d.search->'searchArea'->>'source'='home' then p.location_city else d.search->'searchArea'->>'areaLabel' end));
$$;
create function dating_private.people() returns table(person uuid,profile jsonb,search jsonb,birthdate date,latitude double precision,longitude double precision)
language sql stable security definer set search_path='' as $$
 select d.user_id,d.profile,d.search,p.birthdate,r.latitude,r.longitude from public.dating_owner_aggregates d join auth.users u on u.id=d.user_id join public.profiles p on p.id=d.user_id
 join public.dating_search_location_refs r on r.id=(d.search->'searchArea'->>'resolvedLocationRef')::uuid and r.user_id=d.user_id
 where d.profile->>'enabled'='true' and dating_private.eligible(d.user_id);
$$;
create function dating_private.ranking(actor uuid) returns table(person uuid,distance_miles double precision,interest_count bigint)
language sql stable security definer set search_path='' as $$
 with pool as materialized(select * from dating_private.people()),pairs as(
 select other.*,mine.birthdate mine_dob,mine.search mine_search,
  2*(6371.0088/1.609344)*asin(sqrt(least(1::double precision,greatest(0::double precision,power(sin(radians(other.latitude-mine.latitude)/2),2)+cos(radians(mine.latitude))*cos(radians(other.latitude))*power(sin(radians(other.longitude-mine.longitude)/2),2))))) distance
 from pool mine cross join pool other where mine.person=actor and other.person<>actor and public.safety_pair_allowed(actor,other.person)
 and public.dating_reciprocal_targets(mine.profile,other.profile))
 select pair.person,pair.distance,(select count(distinct public.profile_language_key(a.text)) from public.user_interests a where a.profile_id=actor and exists(select 1 from public.user_interests b where b.profile_id=pair.person and public.profile_language_key(b.text)=public.profile_language_key(a.text)))
 from pairs pair where extract(year from age(public.dating_campus_date(statement_timestamp()),pair.birthdate)) between (pair.mine_search->>'ageMin')::integer and (pair.mine_search->>'ageMax')::integer
 and extract(year from age(public.dating_campus_date(statement_timestamp()),pair.mine_dob)) between (pair.search->>'ageMin')::integer and (pair.search->>'ageMax')::integer
 and pair.distance<=least((pair.mine_search->>'radiusMiles')::integer,(pair.search->>'radiusMiles')::integer)+8*2.220446049250313e-16*greatest(1::double precision,pair.distance);
$$;
create function dating_private.lock_eligibility(a uuid,b uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform social_private.lock_pair(a,b);
 perform 1 from public.account_settings s where s.user_id in(a,b) order by s.user_id for share;
 perform 1 from public.detailed_settings s where s.user_id in(a,b) order by s.user_id for share;
 perform 1 from public.dating_search_location_refs r join public.dating_owner_aggregates d on d.user_id=r.user_id and r.id=(d.search->'searchArea'->>'resolvedLocationRef')::uuid where d.user_id in(a,b) order by r.id for share of r;
 perform 1 from location_private.assertions p join public.dating_owner_aggregates d on d.user_id=p.actor_id and p.id=(d.search->'searchArea'->>'resolvedLocationRef')::uuid where p.mode='dating' and d.user_id in(a,b) order by p.id for share of p;
 perform 1 from location_private.places p join location_private.assertions proof on proof.place_id=p.id join public.dating_owner_aggregates d on d.user_id=proof.actor_id and proof.id=(d.search->'searchArea'->>'resolvedLocationRef')::uuid where proof.mode='dating' and d.user_id in(a,b) order by p.id for share of p;
 perform 1 from public.dating_owner_aggregates d where d.user_id in(a,b) order by d.user_id for share;
end $$;
create function public.get_dating_runtime() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=safety_private.actor();begin
 return jsonb_build_object('available',true,'aggregate',public.get_dating_preferences(),'canStart',dating_private.eligible(actor),
 'globalDiscovery',coalesce((select public.detailed_settings_masters(s.settings)->>'discoverable'='true' from public.account_settings s where s.user_id=actor),false),
 'datingDiscovery',coalesce((select s.settings->>'datingDiscovery'='true' from public.detailed_settings s where s.user_id=actor),false));end $$;
-- Explicit opt-out must remain possible after a location expires. No new reference
-- is introduced and the unchanged saved selection stays ineligible on future use.
create or replace function location_private.preference_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare search jsonb;mode_in text;label_in text;begin
 if tg_table_name='friends_search_preferences' then search:=new.preferences;mode_in:='friends';else
  if tg_op='UPDATE' and old.profile->>'enabled'='true' and new.profile->>'enabled'='false' and new.search is not distinct from old.search then return new;end if;
  search:=new.search;mode_in:='dating';end if;
 if search->'searchArea'->>'resolvedLocationRef' is null then return new;end if;
 if search->'searchArea'->>'source'='home' then select location_city into label_in from public.profiles where id=new.user_id for share;else label_in:=search->'searchArea'->>'areaLabel';end if;
 if not location_private.usable(mode_in,(search->'searchArea'->>'resolvedLocationRef')::uuid,new.user_id,search->'searchArea'->>'source',label_in) then raise exception 'Search location unavailable' using errcode='LC409';end if;
 return new;end $$;
create function public.set_dating_enabled(change_in jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=safety_private.actor();current_value public.dating_owner_aggregates;key text;begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'READ COMMITTED required' using errcode='25001';end if;
 if jsonb_typeof(change_in) is distinct from 'object' or (select count(*) from jsonb_object_keys(change_in))<>3 or not change_in ?& array['expectedProfileRevision','expectedSearchRevision','enabled'] or jsonb_typeof(change_in->'enabled') is distinct from 'boolean' then raise exception 'Invalid Dating consent request' using errcode='22023';end if;
 foreach key in array array['expectedProfileRevision','expectedSearchRevision'] loop
  if jsonb_typeof(change_in->key) is distinct from 'number' or (change_in->>key)::numeric not between 0 and 9007199254740990 or trunc((change_in->>key)::numeric)<>(change_in->>key)::numeric then raise exception 'Invalid Dating revision' using errcode='22023';end if;
 end loop;
 perform 1 from public.profiles p where p.id=actor for share;
 perform 1 from public.account_settings s where s.user_id=actor for share;
 perform 1 from public.detailed_settings s where s.user_id=actor for share;
 perform 1 from public.dating_search_location_refs r join public.dating_owner_aggregates d on d.user_id=r.user_id and r.id=(d.search->'searchArea'->>'resolvedLocationRef')::uuid where d.user_id=actor for share of r;
 select * into current_value from public.dating_owner_aggregates d where d.user_id=actor for update;
 if current_value.user_id is null or current_value.profile_revision<>(change_in->>'expectedProfileRevision')::bigint or current_value.search_revision<>(change_in->>'expectedSearchRevision')::bigint then raise exception 'Dating revisions changed' using errcode='DA409';end if;
 if change_in->>'enabled'='true' and not dating_private.eligible(actor) then raise exception 'Complete adult Dating details, location and discovery first' using errcode='DL409';end if;
 update public.dating_owner_aggregates d set profile=jsonb_set(d.profile,'{enabled}',change_in->'enabled'),profile_revision=d.profile_revision+1,search_revision=d.search_revision+1 where d.user_id=actor;
 return public.get_dating_runtime();end $$;
create function public.find_dating_candidate(excluded_in jsonb) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=safety_private.actor();selected uuid;distance double precision;result jsonb;begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'READ COMMITTED required' using errcode='25001';end if;
 if jsonb_typeof(excluded_in) is distinct from 'array' or jsonb_array_length(excluded_in)>50 or exists(select 1 from jsonb_array_elements(excluded_in) x where jsonb_typeof(x)<>'string' or not location_private.valid_uuid(x #>> '{}')) or (select count(*)<>count(distinct (value #>> '{}')::uuid) from jsonb_array_elements(excluded_in)) then raise exception 'Invalid excluded profiles' using errcode='22023';end if;
 if not exists(select 1 from dating_private.people() p where p.person=actor) then raise exception 'Start eligible Dating discovery before searching' using errcode='DL409';end if;
 select r.person into selected from dating_private.ranking(actor) r where not exists(select 1 from jsonb_array_elements_text(excluded_in) x where x::uuid=r.person)
 order by r.distance_miles,r.interest_count desc,r.person limit 1;
 if selected is null then return '{"candidate":null}';end if;
 perform dating_private.lock_eligibility(actor,selected);
 select r.distance_miles into distance from dating_private.ranking(actor) r where r.person=selected;
 if not found then return '{"candidate":null}';end if;
 select jsonb_build_object('id',p.id,'name',p.display_name,'age',extract(year from age(public.dating_campus_date(statement_timestamp()),p.birthdate))::integer,'city',p.location_city,'bio',p.bio,
 'avatar',case when photo.user_id is null then p.avatar_url else null end,'photoRevision',case when photo.jpeg is null then 0 else photo.revision end,
 'interests',coalesce((select jsonb_agg(i.text order by i.text collate "C") from public.user_interests i where i.profile_id=p.id),'[]'),
 'areaDistanceMiles',ceil(distance)::integer,'heightInches',case when d.profile->'visibility'->>'height'='true' then (d.profile->>'heightInches')::integer else null end,
 'gender',case when d.profile->'visibility'->>'gender'='true' then d.profile->>'gender' else null end,'sexuality',case when d.profile->'visibility'->>'sexuality'='true' then d.profile->>'sexuality' else null end,
 'intent',d.profile->>'intent','style',d.profile->>'style') into result from public.profiles p join public.dating_owner_aggregates d on d.user_id=p.id left join photo_private.photos photo on photo.user_id=p.id where p.id=selected;
 return jsonb_build_object('candidate',result);end $$;
create function public.request_dating_connection(target_in uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=safety_private.actor();begin
 if target_in is null or target_in=actor then raise exception 'Invalid Dating target' using errcode='22023';end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'READ COMMITTED required' using errcode='25001';end if;
 perform dating_private.lock_eligibility(actor,target_in);
 if not exists(select 1 from dating_private.ranking(actor) r where r.person=target_in) then raise exception 'Dating connection unavailable' using errcode='DL409';end if;
 return public.social_connection(target_in,'request');end $$;
create or replace function photo_private.audience(viewer uuid,owner uuid) returns boolean language sql stable security definer set search_path='' as $$
 select viewer=owner or (public.safety_pair_allowed(viewer,owner) and (social_private.profile_audience(viewer,owner) or (social_private.friends_discoverable(viewer) and social_private.friends_discoverable(owner)) or exists(select 1 from dating_private.ranking(viewer) r where r.person=owner)));
$$;
-- Photo metadata and bytes use the same current Dating eligibility fence as
-- candidates/requests, including pause, reciprocal filters and catalogue expiry.
create or replace function photo_private.lock_audience(viewer uuid,owner uuid) returns void language plpgsql volatile security definer set search_path='' as $$
begin
 if viewer<>owner then perform dating_private.lock_eligibility(viewer,owner);
 else
  perform 1 from public.account_settings s where s.user_id=viewer for share;
  perform 1 from public.detailed_settings s where s.user_id=viewer for share;
 end if;
end $$;
revoke all on function photo_private.lock_audience(uuid,uuid) from public,anon,authenticated;
revoke all on all functions in schema dating_private from public,anon,authenticated;
revoke all on function public.get_dating_runtime(),public.set_dating_enabled(jsonb),public.find_dating_candidate(jsonb),public.request_dating_connection(uuid) from public,anon,authenticated;
grant execute on function public.get_dating_runtime(),public.set_dating_enabled(jsonb),public.find_dating_candidate(jsonb),public.request_dating_connection(uuid) to authenticated;
do $$ declare role_in text;f record;signature text;begin
 foreach role_in in array array['anon','authenticated'] loop
  if has_schema_privilege(role_in::name,'dating_private','USAGE') then raise exception 'Inherited Dating helper access' using errcode='42501';end if;
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='dating_private' loop
   if has_function_privilege(role_in::name,f.oid,'EXECUTE') then raise exception 'Inherited Dating helper execute' using errcode='42501';end if;
  end loop;
 end loop;
 foreach signature in array array['public.get_dating_runtime()','public.set_dating_enabled(jsonb)','public.find_dating_candidate(jsonb)','public.request_dating_connection(uuid)'] loop
  if has_function_privilege('anon',signature,'EXECUTE') or not has_function_privilege('authenticated',signature,'EXECUTE') then raise exception 'Inherited Dating RPC access' using errcode='42501';end if;
 end loop;
end $$;
commit;
