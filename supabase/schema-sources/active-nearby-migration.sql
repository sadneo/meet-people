-- REVIEW CANDIDATE: install with privacy containment + trusted location issuance.
-- No provider/scorer, groups, match completion, Dating or downtime redesign.
begin;
set local lock_timeout='3s';set local statement_timeout='30s';
do $$ begin
 if to_regprocedure('location_private.usable(text,uuid,uuid,text,text)') is null or to_regprocedure('social_private.friends_discoverable(uuid)') is null
 or to_regprocedure('public.get_queue_match()') is null then raise exception 'Active matcher prerequisites missing' using errcode='22023';end if;
 if not exists(select 1 from pg_proc where oid='public.get_queue_match()'::regprocedure and pg_get_userbyid(proowner)=current_user) then raise exception 'Queue reader owner mismatch' using errcode='42501';end if;
end $$;
create schema active_private;
revoke all on schema active_private from public,anon,authenticated;
-- Only trusted current facts enter this internal relation. No raw browser input.
create function active_private.people() returns table(person uuid,username text,display_name text,avatar text,bio text,birthdate date,minimum_age integer,maximum_age integer,radius integer,reference uuid,latitude double precision,longitude double precision)
language sql stable security definer set search_path='' as $$
 select p.id,p.username,p.display_name,p.avatar_url,p.bio,p.birthdate,(f.preferences->>'ageMin')::integer,(f.preferences->>'ageMax')::integer,(f.preferences->>'radiusMiles')::integer,r.id,r.latitude,r.longitude
 from public.profiles p join auth.users u on u.id=p.id join public.friends_search_preferences f on f.user_id=p.id
 join public.friends_search_location_refs r on r.id=(f.preferences->'searchArea'->>'resolvedLocationRef')::uuid and r.user_id=p.id
 where social_private.friends_discoverable(p.id) and public.valid_friends_search_preferences(f.preferences)
 and location_private.usable('friends',r.id,p.id,f.preferences->'searchArea'->>'source',case when f.preferences->'searchArea'->>'source'='home' then p.location_city else f.preferences->'searchArea'->>'areaLabel' end);
$$;
create function active_private.ranking(actor uuid) returns table(person uuid,distance_miles double precision,interest_labels text[],overlap_seconds numeric)
language sql stable security definer set search_path='' as $$
 with pool as materialized(select p.* from active_private.people() p join public.queue_entries q on q.profile_id=p.person and q.queue_type='matchmaking'),
 pairs as(select other.*,mine.minimum_age mine_min,mine.maximum_age mine_max,mine.radius mine_radius,mine.birthdate mine_dob,
  2*(6371.0088/1.609344)*asin(sqrt(least(1::double precision,greatest(0::double precision,
   power(sin(radians(other.latitude-mine.latitude)/2),2)+cos(radians(mine.latitude))*cos(radians(other.latitude))*power(sin(radians(other.longitude-mine.longitude)/2),2))))) distance
 from pool mine cross join pool other where mine.person=actor and other.person<>actor and public.safety_pair_allowed(actor,other.person)),
 eligible as(select * from pairs where
  extract(year from age((statement_timestamp() at time zone 'America/New_York')::date,birthdate)) between mine_min and mine_max
  and extract(year from age((statement_timestamp() at time zone 'America/New_York')::date,mine_dob)) between minimum_age and maximum_age
  and distance<=least(radius,mine_radius)+8*2.220446049250313e-16*greatest(1::double precision,distance,least(radius,mine_radius)))
 select e.person,e.distance,
  coalesce((select array_agg(label order by comparison collate "C") from (
   select public.profile_language_key(a.text) comparison,min(a.text collate "C") label from public.user_interests a
   where a.profile_id=actor and exists(select 1 from public.user_interests b where b.profile_id=e.person and public.profile_language_key(b.text)=public.profile_language_key(a.text)) group by public.profile_language_key(a.text)
  ) shared),'{}'::text[]),
  coalesce((select sum(greatest(0,extract(epoch from(least(a.end_time,b.end_time)-greatest(a.start_time,b.start_time))))) from public.availability a join public.availability b on b.profile_id=e.person and b.dow=a.dow where a.profile_id=actor),0)
 from eligible e;
$$;
-- Preserve legacy wire signature, expose only the permitted single candidate.
create or replace function public.get_queue_match() returns table(
 queue_kind text,match_profile_id uuid,match_username text,match_display_name text,match_avatar_url text,match_bio text,match_score numeric,
 shared_interests text[],overlap_minutes integer,shared_windows jsonb,event_id bigint,event_title text,event_description text,event_category text,event_location text,event_starts_at timestamptz,event_host_id uuid)
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=safety_private.actor();selected uuid;current_row record;profile_row record;kind text;begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'READ COMMITTED required' using errcode='25001';end if;
 select q.queue_type into kind from public.queue_entries q where q.profile_id=actor;
 if kind is null then raise exception 'Join a queue before checking' using errcode='AQ409';end if;
 if kind<>'matchmaking' then raise exception 'Downtime results await lifecycle approval' using errcode='AQ503';end if;
 if not exists(select 1 from active_private.people() p where p.person=actor) then raise exception 'Choose current Friends filters and location' using errcode='AQ409';end if;
 select r.person into selected from active_private.ranking(actor) r order by r.distance_miles,cardinality(r.interest_labels) desc,r.overlap_seconds desc,r.person limit 1;
 if selected is null then return;end if;
 -- Same pair fence as block/contact. Recheck with a new READ COMMITTED snapshot
 -- after waiting; an old snapshot cannot authorize a blocked/cancelled candidate.
 perform social_private.lock_pair(actor,selected);
 perform 1 from public.account_settings s where s.user_id in(actor,selected) order by s.user_id for share;
 perform 1 from public.detailed_settings s where s.user_id in(actor,selected) order by s.user_id for share;
 perform 1 from public.queue_entries q where q.profile_id in(actor,selected) order by q.profile_id for share;
 perform 1 from public.friends_search_location_refs r join public.friends_search_preferences f on f.user_id=r.user_id and r.id=(f.preferences->'searchArea'->>'resolvedLocationRef')::uuid where f.user_id in(actor,selected) order by r.id for share of r;
 perform 1 from location_private.assertions a join public.friends_search_preferences f on f.user_id=a.actor_id and a.id=(f.preferences->'searchArea'->>'resolvedLocationRef')::uuid where a.mode='friends' and f.user_id in(actor,selected) order by a.id for share of a;
 perform 1 from location_private.places p join location_private.assertions a on a.place_id=p.id join public.friends_search_preferences f on f.user_id=a.actor_id and a.id=(f.preferences->'searchArea'->>'resolvedLocationRef')::uuid where a.mode='friends' and f.user_id in(actor,selected) order by p.id for share of p;
 perform 1 from public.friends_search_preferences f where f.user_id in(actor,selected) order by f.user_id for share;
 select * into current_row from active_private.ranking(actor) r where r.person=selected;
 if not found then return;end if;
 select * into profile_row from active_private.people() p where p.person=selected;
 if not found then return;end if;
 return query select 'matchmaking'::text,selected,profile_row.username,profile_row.display_name,profile_row.avatar,profile_row.bio,null::numeric,
 current_row.interest_labels,floor(current_row.overlap_seconds/60)::integer,null::jsonb,null::bigint,null::text,null::text,null::text,null::text,null::timestamptz,null::uuid;
end $$;
create or replace function public.join_queue(qtype text) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=safety_private.actor();begin
 if qtype is null or qtype not in('matchmaking','downtime') then raise exception 'Queue unavailable' using errcode='42501';end if;
 if qtype='matchmaking' then
  perform 1 from public.profiles p where p.id=actor for share;
  if not exists(select 1 from active_private.people() p where p.person=actor) then raise exception 'Save current Friends filters and choose a location' using errcode='AQ409';end if;
 end if;
 insert into public.queue_entries(profile_id,queue_type) values(actor,qtype) on conflict(profile_id) do update set queue_type=excluded.queue_type,joined_at=statement_timestamp();
end $$;
revoke all on all functions in schema active_private from public,anon,authenticated;
revoke all on function public.get_queue_match(),public.join_queue(text) from public,anon,authenticated;
grant execute on function public.get_queue_match(),public.join_queue(text) to authenticated;
do $$ declare r text;f record;begin
 foreach r in array array['anon','authenticated'] loop
  if has_schema_privilege(r::name,'active_private','USAGE') then raise exception 'Inherited active schema access' using errcode='42501';end if;
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='active_private' loop
   if has_function_privilege(r::name,f.oid,'EXECUTE') then raise exception 'Inherited active helper access' using errcode='42501';end if;
  end loop;
 end loop;
 if has_function_privilege('anon','public.get_queue_match()','EXECUTE') or not has_function_privilege('authenticated','public.get_queue_match()','EXECUTE') then raise exception 'Queue read ACL mismatch' using errcode='42501';end if;
end $$;
commit;
