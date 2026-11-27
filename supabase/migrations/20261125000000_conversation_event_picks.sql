-- Private inputs for event picks in one direct conversation. Returned only to the
-- backend service, never an actor JWT; ranking happens in api/matching.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
do $$ begin
 -- Native UUID messaging has social_private.peer; legacy messaging maps UUID aliases.
 if (to_regprocedure('social_private.peer(uuid,uuid)') is null and to_regclass('social_private.conversations') is null)
 or to_regprocedure('social_private.contact_allowed(uuid,uuid)') is null
 or to_regprocedure('location_private.usable(text,uuid,uuid,text,text)') is null
 or to_regclass('social_private.relationship_modes') is null
 or to_regclass('public.friends_search_preferences') is null
 or to_regclass('public.dating_owner_aggregates') is null
 or to_regclass('public.listings') is null then
  raise exception 'Messaging/location/listing prerequisites missing' using errcode='22023';end if;
end $$;

create schema event_picks_private;
revoke all on schema event_picks_private from public,anon,authenticated;

-- A person's usable search area: Friends first, then Dating. No row when neither is usable.
create function event_picks_private.area(person uuid)
returns table(latitude double precision,longitude double precision,radius_miles integer)
language sql volatile security definer set search_path='' as $$
 select a.latitude,a.longitude,a.radius_miles from (
  select r.latitude,r.longitude,(f.preferences->>'radiusMiles')::integer radius_miles,1 preference
  from public.friends_search_preferences f
  join public.friends_search_location_refs r on r.user_id=f.user_id
   and r.id=(f.preferences->'searchArea'->>'resolvedLocationRef')::uuid
  join public.profiles p on p.id=f.user_id
  where f.user_id=person and location_private.usable('friends',r.id,person,f.preferences->'searchArea'->>'source',
   case when f.preferences->'searchArea'->>'source'='home' then p.location_city else f.preferences->'searchArea'->>'areaLabel' end)
  union all
  select r.latitude,r.longitude,(d.search->>'radiusMiles')::integer,2
  from public.dating_owner_aggregates d
  join public.dating_search_location_refs r on r.user_id=d.user_id
   and r.id=(d.search->'searchArea'->>'resolvedLocationRef')::uuid
  join public.profiles p on p.id=d.user_id
  where d.user_id=person and location_private.usable('dating',r.id,person,d.search->'searchArea'->>'source',
   case when d.search->'searchArea'->>'source'='home' then p.location_city else d.search->'searchArea'->>'areaLabel' end)
 ) a where a.radius_miles>0 order by a.preference limit 1;
$$;

-- The other participant of a direct conversation the actor is in, for either
-- messaging schema: native UUID conversations, or legacy bigint chats behind
-- their UUID aliases. Null when the actor is not a participant.
create function event_picks_private.peer(conversation_in uuid,actor uuid) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare other uuid;
begin
 if to_regprocedure('social_private.peer(uuid,uuid)') is not null then
  execute 'select social_private.peer($1,$2)' into other using conversation_in,actor;
 else
  execute 'select case when chat.user_a=$2 then chat.user_b else chat.user_a end
   from public.conversations chat join social_private.conversations alias on alias.legacy_id=chat.id
   where alias.id=$1 and $2 in(chat.user_a,chat.user_b)' into other using conversation_in,actor;
 end if;
 return other;
end $$;

create function event_picks_private.miles(lat1 double precision,lon1 double precision,lat2 double precision,lon2 double precision)
returns double precision language sql immutable security definer set search_path='' as $$
 select case when lat1 is null or lon1 is null or lat2 is null or lon2 is null then null else
  round((extensions.st_distance(
   extensions.st_setsrid(extensions.st_makepoint(lon1,lat1),4326)::extensions.geography,
   extensions.st_setsrid(extensions.st_makepoint(lon2,lat2),4326)::extensions.geography)/1609.344)::numeric,1)::double precision end;
$$;

create function public.get_conversation_event_pool(actor_in uuid,conversation_in uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
 peer uuid; relation text;
 mine_lat double precision; mine_lon double precision; mine_radius integer;
 peer_lat double precision; peer_lon double precision; peer_radius integer;
 events jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server scoring only' using errcode='42501';end if;
 if actor_in is null or conversation_in is null then raise exception 'Invalid conversation' using errcode='22023';end if;
 peer:=event_picks_private.peer(conversation_in,actor_in);
 if peer is null or not social_private.contact_allowed(actor_in,peer) then
  raise exception 'Conversation unavailable' using errcode='42501';end if;
 select m.mode into relation from social_private.relationship_modes m
  where m.user_a=least(actor_in,peer) and m.user_b=greatest(actor_in,peer);
 select a.latitude,a.longitude,a.radius_miles into mine_lat,mine_lon,mine_radius from event_picks_private.area(actor_in) a;
 select a.latitude,a.longitude,a.radius_miles into peer_lat,peer_lon,peer_radius from event_picks_private.area(peer) a;
 -- Coordinates stay here: only distances leave the database, and the API
 -- returns neither distances nor radii to the app.
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',c.id,'title',c.title,'description',c.description,'category',c.category,
   'starts_at',c.starts_at,'ends_at',c.ends_at,'location_name',c.location_name,'address',c.address,
   'city',c.city,'image_url',c.image_url,'source',c.source,'source_url',c.source_url,'status',c.status,
   'viewerDistanceMiles',c.viewer_distance,'peerDistanceMiles',c.peer_distance) order by c.starts_at,c.id),'[]')
 into events from (
  select l.*,event_picks_private.miles(l.latitude,l.longitude,mine_lat,mine_lon) viewer_distance,
   event_picks_private.miles(l.latitude,l.longitude,peer_lat,peer_lon) peer_distance
  from public.listings l
  where l.listing_type='event' and l.status in('active','rescheduled')
   and l.starts_at>=statement_timestamp() and l.starts_at<statement_timestamp()+interval '14 days'
   and (mine_radius is null or l.latitude is null or l.longitude is null
    or event_picks_private.miles(l.latitude,l.longitude,mine_lat,mine_lon)<=mine_radius)
   and (peer_radius is null or l.latitude is null or l.longitude is null
    or event_picks_private.miles(l.latitude,l.longitude,peer_lat,peer_lon)<=peer_radius)
  order by l.starts_at,l.id limit 200
 ) c;
 return jsonb_build_object(
  'mode',relation,
  'viewerInterests',coalesce((select jsonb_agg(i.text order by i.text collate "C") from public.user_interests i where i.profile_id=actor_in),'[]'),
  'peerInterests',coalesce((select jsonb_agg(i.text order by i.text collate "C") from public.user_interests i where i.profile_id=peer),'[]'),
  'viewerRadiusMiles',mine_radius,'peerRadiusMiles',peer_radius,
  'events',events);
end $$;

revoke all on all functions in schema event_picks_private from public,anon,authenticated;
revoke all on function public.get_conversation_event_pool(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_conversation_event_pool(uuid,uuid) to service_role;
do $$ declare role_in text;f record;begin
 foreach role_in in array array['anon','authenticated'] loop
  if has_schema_privilege(role_in::name,'event_picks_private','USAGE')
   or has_function_privilege(role_in::name,'public.get_conversation_event_pool(uuid,uuid)','EXECUTE') then
   raise exception 'Event picks ACL mismatch' using errcode='42501';end if;
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='event_picks_private' loop
   if has_function_privilege(role_in::name,f.oid,'EXECUTE') then raise exception 'Inherited event picks helper access' using errcode='42501';end if;
  end loop;
 end loop;
end $$;

notify pgrst, 'reload schema';
commit;
