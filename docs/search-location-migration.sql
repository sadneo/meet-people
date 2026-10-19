-- REVIEW CANDIDATE. No real catalogue/provider/import/activation supplied here.
-- The catalogue is populated ONLY from an explicitly approved, reviewed geocoder
-- or operator source. Browser users can select a verified place, never its coords.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
do $$ begin
 if to_regclass('public.friends_search_location_refs') is null or to_regclass('public.dating_search_location_refs') is null
 or to_regclass('public.account_settings') is null or to_regprocedure('public.profile_language_key(text)') is null then raise exception 'Location prerequisites missing' using errcode='22023'; end if;
 if not exists(select 1 from pg_catalog.pg_proc where oid='public.dating_location_resolved(uuid,jsonb,text)'::regprocedure and pg_get_userbyid(proowner)=current_user) then raise exception 'Location helper owner mismatch' using errcode='42501';end if;
 if exists(select 1 from pg_catalog.pg_roles where rolname='pebble_location_catalog_publisher') then raise exception 'Publisher role requires fresh reviewed ownership' using errcode='42501'; end if;
end $$;
create role pebble_location_catalog_publisher nologin nosuperuser nobypassrls nocreatedb nocreaterole;
create schema location_private;
revoke all on schema location_private from public,anon,authenticated,pebble_location_catalog_publisher;
create table location_private.places (
 id uuid primary key,
 label text not null check(char_length(label) between 1 and 120 and public.profile_language_key(label)<>''),
 region text not null check(char_length(region)<=120),
 aliases text[] not null check(cardinality(aliases) between 1 and 20 and array_position(aliases,null) is null),
 latitude double precision not null check(latitude between -90 and 90),
 longitude double precision not null check(longitude between -180 and 180),
 provenance text not null check(char_length(provenance) between 1 and 250),
 verified_until timestamptz not null check(isfinite(verified_until)), enabled boolean not null
);
create table location_private.assertions (
 mode text not null check(mode in('friends','dating')), id uuid not null,
 actor_id uuid not null references auth.users(id) on delete cascade,
 method text not null check(method in('geocoded-area','device-reported')),
 issued_at timestamptz not null, expires_at timestamptz not null check(isfinite(issued_at) and isfinite(expires_at) and expires_at>issued_at),
 place_id uuid references location_private.places(id), accuracy_meters double precision,
 primary key(mode,id),
 check((method='geocoded-area' and place_id is not null and accuracy_meters is null) or (method='device-reported' and place_id is null and accuracy_meters is not null and accuracy_meters between 0.000001 and 1000))
);
create table location_private.requests (
 actor_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null, fingerprint bytea not null,
 mode text not null, reference_id uuid not null,
 created_at timestamptz not null default statement_timestamp(),
 primary key(actor_id,request_id),foreign key(mode,reference_id) references location_private.assertions(mode,id)
);
alter table location_private.places enable row level security;
alter table location_private.assertions enable row level security;
alter table location_private.requests enable row level security;
revoke all on all tables in schema location_private from public,anon,authenticated,pebble_location_catalog_publisher;

create function location_private.valid_uuid(value text) returns boolean language sql immutable set search_path='' as $$
 select coalesce(char_length(value)=36 and value ~ '^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$',false);
$$;
create function location_private.usable(mode_in text,reference_in uuid,actor_in uuid,source_in text,label_in text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from location_private.assertions proof join (
  select 'friends' mode,r.* from public.friends_search_location_refs r union all select 'dating' mode,r.* from public.dating_search_location_refs r
 ) r on r.mode=proof.mode and r.id=proof.id left join location_private.places place on place.id=proof.place_id
 where proof.mode=mode_in and proof.id=reference_in and proof.actor_id=actor_in and r.user_id=actor_in and r.usable
 and r.source=source_in and r.area_label=label_in and proof.issued_at<=statement_timestamp() and proof.expires_at>statement_timestamp()
 and ((proof.method='device-reported' and source_in='temporary' and exists(select 1 from public.account_settings settings where settings.user_id=actor_in and public.detailed_settings_masters(settings.settings) is not null and settings.settings->'location'='true'::jsonb)) or (place.enabled and place.verified_until>statement_timestamp() and r.latitude=place.latitude and r.longitude=place.longitude
 and (source_in<>'temporary' or r.area_label=place.label)
 and (source_in<>'home' or exists(select 1 from unnest(place.aliases) alias where public.profile_language_key(alias)=public.profile_language_key(label_in))))));
$$;
create function public.get_search_location_receipt(mode_in text,reference_in uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=safety_private.actor(); result jsonb; begin
 if mode_in is null or mode_in not in('friends','dating') or reference_in is null then raise exception 'Invalid receipt' using errcode='22023'; end if;
 select jsonb_build_object('id',r.id,'mode',r.mode,'source',r.source,'areaLabel',r.area_label,'method',proof.method,
 'expiresAt',to_char(proof.expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'usable',location_private.usable(r.mode,r.id,actor,r.source,case when r.source='home' then p.location_city else r.area_label end)) into result
 from location_private.assertions proof join (
  select 'friends' mode,r.* from public.friends_search_location_refs r union all select 'dating' mode,r.* from public.dating_search_location_refs r
 ) r on r.mode=proof.mode and r.id=proof.id left join public.profiles p on p.id=actor
 where proof.actor_id=actor and proof.mode=mode_in and proof.id=reference_in;
 if result is null then raise exception 'Location receipt unavailable' using errcode='PT404'; end if;
 return result;
end $$;
create function public.search_location_places(query_in text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=safety_private.actor(); result jsonb;begin
 if query_in is null or char_length(query_in) not between 1 and 120 or public.profile_language_key(query_in)='' then raise exception 'Invalid place query' using errcode='22023'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',label,'region',region) order by label,id),'[]') into result from (
  select p.id,p.label,p.region from location_private.places p where p.enabled and p.verified_until>statement_timestamp()
  and (p.label ilike '%'||query_in||'%' or exists(select 1 from unnest(p.aliases) alias where alias ilike '%'||query_in||'%')) order by p.label,p.id limit 10
 ) matches;
 return jsonb_build_object('places',result);
end $$;
create function location_private.replay(request_in uuid,payload_in jsonb,actor uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare prior location_private.requests;begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'READ COMMITTED required' using errcode='25001'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pebble.location.owner.v1:'||actor::text,0));
 select * into prior from location_private.requests where actor_id=actor and request_id=request_in;
 if found then
  if prior.fingerprint<>pg_catalog.sha256(pg_catalog.convert_to(payload_in::text,'UTF8')) then raise exception 'Location request conflict' using errcode='LC409'; end if;
  return public.get_search_location_receipt(prior.mode,prior.reference_id);
 end if;
 if (select count(*) from location_private.requests where actor_id=actor and created_at>statement_timestamp()-interval '1 hour')>=10
 or (select count(*) from location_private.requests where actor_id=actor and created_at>statement_timestamp()-interval '24 hours')>=50 then raise exception 'Location issuance limit' using errcode='LC429'; end if;
 return null;
end $$;
create function location_private.issue(actor uuid,request_in uuid,payload jsonb,mode_in text,source_in text,label_in text,lat double precision,lon double precision,method_in text,expiry timestamptz,place uuid,accuracy double precision) returns jsonb language plpgsql security definer set search_path='' as $$
declare reference_in uuid:=gen_random_uuid();begin
 if mode_in='friends' then insert into public.friends_search_location_refs(id,user_id,source,area_label,latitude,longitude,usable) values(reference_in,actor,source_in,label_in,lat,lon,true);
 else insert into public.dating_search_location_refs(id,user_id,source,area_label,latitude,longitude,usable) values(reference_in,actor,source_in,label_in,lat,lon,true); end if;
 insert into location_private.assertions(mode,id,actor_id,method,issued_at,expires_at,place_id,accuracy_meters) values(mode_in,reference_in,actor,method_in,statement_timestamp(),expiry,place,accuracy);
 insert into location_private.requests(actor_id,request_id,fingerprint,mode,reference_id) values(actor,request_in,pg_catalog.sha256(pg_catalog.convert_to(payload::text,'UTF8')),mode_in,reference_in);
 return public.get_search_location_receipt(mode_in,reference_in);
end $$;
create function public.resolve_search_area(resolution_in jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=safety_private.actor(); place location_private.places;mode_in text;source_in text;label_in text;request_in uuid;prior jsonb;begin
 if jsonb_typeof(resolution_in) is distinct from 'object' or (select count(*) from jsonb_object_keys(resolution_in))<>4 or not resolution_in ?& array['requestId','mode','source','placeId']
 or jsonb_typeof(resolution_in->'requestId')<>'string' or jsonb_typeof(resolution_in->'placeId')<>'string'
 or jsonb_typeof(resolution_in->'mode')<>'string' or jsonb_typeof(resolution_in->'source')<>'string' or resolution_in->>'mode' not in('friends','dating') or resolution_in->>'source' not in('home','temporary') then raise exception 'Invalid resolution' using errcode='22023'; end if;
 if not location_private.valid_uuid(resolution_in->>'requestId') or not location_private.valid_uuid(resolution_in->>'placeId') then raise exception 'Invalid location IDs' using errcode='22023';end if;
 begin request_in:=(resolution_in->>'requestId')::uuid;exception when invalid_text_representation then raise exception 'Invalid request' using errcode='22023';end;
 mode_in:=resolution_in->>'mode';source_in:=resolution_in->>'source';
 -- Match canonical home lock ordering: home -> assertion -> preference CAS.
 if source_in='home' then select location_city into label_in from public.profiles where id=actor for share; end if;
 prior:=location_private.replay(request_in,resolution_in,actor);if prior is not null then return prior;end if;
 begin select * into place from location_private.places where id=(resolution_in->>'placeId')::uuid and enabled and verified_until>statement_timestamp() for share;
 exception when invalid_text_representation then raise exception 'Invalid place' using errcode='22023';end;
 if not found then raise exception 'Place unavailable' using errcode='LC409';end if;
 if source_in='home' then
  if label_in is null or not exists(select 1 from unnest(place.aliases) alias where public.profile_language_key(alias)=public.profile_language_key(label_in)) then raise exception 'Home binding changed' using errcode='LC409';end if;
 else label_in:=place.label;end if;
 return location_private.issue(actor,request_in,resolution_in,mode_in,source_in,label_in,place.latitude,place.longitude,'geocoded-area',least(place.verified_until,statement_timestamp()+interval '30 days'),place.id,null);
end $$;
create function public.issue_browser_search_location(location_in jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=safety_private.actor();mode_in text;request_in uuid;lat double precision;lon double precision;accuracy double precision;observed timestamptz;prior jsonb;begin
 if jsonb_typeof(location_in) is distinct from 'object' or (select count(*) from jsonb_object_keys(location_in))<>7 or not location_in ?& array['requestId','mode','latitude','longitude','accuracyMeters','observedAt','consent'] then raise exception 'Invalid device location' using errcode='22023';end if;
 if jsonb_typeof(location_in->'requestId')<>'string' or jsonb_typeof(location_in->'mode')<>'string' or location_in->>'mode' not in('friends','dating')
 or location_in->'consent' is distinct from 'true'::jsonb or jsonb_typeof(location_in->'latitude')<>'number' or jsonb_typeof(location_in->'longitude')<>'number' or jsonb_typeof(location_in->'accuracyMeters')<>'number' or jsonb_typeof(location_in->'observedAt')<>'string' then raise exception 'Invalid device evidence' using errcode='22023';end if;
 if not location_private.valid_uuid(location_in->>'requestId') or char_length(location_in->>'observedAt')>40 or (location_in->>'observedAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9](\.[0-9]+)?)?(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'Invalid location identity or timestamp' using errcode='22023';end if;
 begin request_in:=(location_in->>'requestId')::uuid;lat:=(location_in->>'latitude')::double precision;lon:=(location_in->>'longitude')::double precision;accuracy:=(location_in->>'accuracyMeters')::double precision;observed:=(location_in->>'observedAt')::timestamptz;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then raise exception 'Invalid device evidence' using errcode='22023';end;
 mode_in:=location_in->>'mode';
 if not(lat between -90 and 90 and lon between -180 and 180 and accuracy>0 and accuracy<=1000) or not isfinite(observed) then raise exception 'Invalid coordinates' using errcode='22023';end if;
 if not exists(select 1 from public.account_settings s where s.user_id=actor and public.detailed_settings_masters(s.settings) is not null and s.settings->'location'='true'::jsonb for share) then raise exception 'Device location opt-in required' using errcode='LC403';end if;
 prior:=location_private.replay(request_in,location_in,actor);if prior is not null then return prior;end if;
 if observed<statement_timestamp()-interval '5 minutes' or observed>statement_timestamp()+interval '15 seconds' then raise exception 'Device reading is stale' using errcode='22023';end if;
 return location_private.issue(actor,request_in,location_in,mode_in,'temporary','Current approximate location',lat,lon,'device-reported',statement_timestamp()+interval '1 hour',null,accuracy);
end $$;
-- Only a separately approved catalogue publisher can load reviewed global places.
-- It cannot read/write profiles, owner settings or location assertions.
create function public.publish_search_location_place(place_in jsonb) returns void language plpgsql security definer set search_path='' as $$
declare alias text;begin
 if current_setting('role')<>'pebble_location_catalog_publisher' then raise exception 'Catalogue publisher required' using errcode='42501';end if;
 if jsonb_typeof(place_in) is distinct from 'object' or (select count(*) from jsonb_object_keys(place_in))<>9 or not place_in ?& array['id','label','region','aliases','latitude','longitude','provenance','verifiedUntil','enabled'] then raise exception 'Invalid catalogue place' using errcode='22023';end if;
 if jsonb_typeof(place_in->'aliases')<>'array' or jsonb_array_length(place_in->'aliases') not between 1 and 20 or exists(select 1 from jsonb_array_elements(place_in->'aliases') x where jsonb_typeof(x)<>'string' or char_length(x #>> '{}') not between 1 and 120 or public.profile_language_key(x #>> '{}')='') then raise exception 'Invalid place aliases' using errcode='22023';end if;
 if exists(select 1 from jsonb_each(place_in) x where (x.key in('id','label','region','provenance','verifiedUntil') and jsonb_typeof(x.value)<>'string') or (x.key in('latitude','longitude') and jsonb_typeof(x.value)<>'number') or (x.key='enabled' and jsonb_typeof(x.value)<>'boolean')) then raise exception 'Invalid catalogue types' using errcode='22023';end if;
 insert into location_private.places(id,label,region,aliases,latitude,longitude,provenance,verified_until,enabled) values((place_in->>'id')::uuid,place_in->>'label',place_in->>'region',array(select jsonb_array_elements_text(place_in->'aliases')),(place_in->>'latitude')::double precision,(place_in->>'longitude')::double precision,place_in->>'provenance',(place_in->>'verifiedUntil')::timestamptz,(place_in->>'enabled')::boolean)
 on conflict(id) do update set label=excluded.label,region=excluded.region,aliases=excluded.aliases,latitude=excluded.latitude,longitude=excluded.longitude,provenance=excluded.provenance,verified_until=excluded.verified_until,enabled=excluded.enabled;
end $$;
-- Direct preferences cannot save expired/revoked/unproven or other-owner refs.
create function location_private.preference_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare search jsonb;mode_in text;label_in text;begin
 if tg_table_name='friends_search_preferences' then search:=new.preferences;mode_in:='friends';else search:=new.search;mode_in:='dating';end if;
 if search->'searchArea'->>'resolvedLocationRef' is null then return new;end if;
 if search->'searchArea'->>'source'='home' then select location_city into label_in from public.profiles where id=new.user_id for share;else label_in:=search->'searchArea'->>'areaLabel';end if;
 if not location_private.usable(mode_in,(search->'searchArea'->>'resolvedLocationRef')::uuid,new.user_id,search->'searchArea'->>'source',label_in) then raise exception 'Search location unavailable' using errcode='LC409';end if;
 return new;
end $$;
create trigger friends_location_proof before insert or update on public.friends_search_preferences for each row execute function location_private.preference_guard();
create trigger dating_location_proof before insert or update on public.dating_owner_aggregates for each row execute function location_private.preference_guard();
create or replace function public.dating_location_resolved(actor uuid,s jsonb,home text) returns boolean language sql stable set search_path='' as $$
 select location_private.usable('dating',(s->'searchArea'->>'resolvedLocationRef')::uuid,actor,s->'searchArea'->>'source',case when s->'searchArea'->>'source'='home' then home else s->'searchArea'->>'areaLabel' end);
$$;
revoke all on all functions in schema location_private from public,anon,authenticated,pebble_location_catalog_publisher;
revoke all on function public.publish_search_location_place(jsonb),public.search_location_places(text),public.resolve_search_area(jsonb),public.issue_browser_search_location(jsonb),public.get_search_location_receipt(text,uuid) from public,anon,authenticated,pebble_location_catalog_publisher;
grant execute on function public.publish_search_location_place(jsonb) to pebble_location_catalog_publisher;
grant execute on function public.search_location_places(text),public.resolve_search_area(jsonb),public.issue_browser_search_location(jsonb),public.get_search_location_receipt(text,uuid) to authenticated;
do $$ declare role_in text;t text;f record;signature text;begin
 foreach role_in in array array['anon','authenticated','pebble_location_catalog_publisher'] loop
  if has_schema_privilege(role_in::name,'location_private','USAGE') then raise exception 'Inherited location schema bypass' using errcode='42501';end if;
  foreach t in array array['places','assertions','requests'] loop
   if has_table_privilege(role_in::name,'location_private.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_any_column_privilege(role_in::name,'location_private.'||t,'SELECT,INSERT,UPDATE,REFERENCES') then raise exception 'Inherited location data bypass' using errcode='42501';end if;
  end loop;
  for f in select p.oid from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='location_private' loop
   if has_function_privilege(role_in::name,f.oid,'EXECUTE') then raise exception 'Inherited location helper bypass' using errcode='42501';end if;
  end loop;
 end loop;
 if has_function_privilege('anon','public.publish_search_location_place(jsonb)','EXECUTE') or has_function_privilege('authenticated','public.publish_search_location_place(jsonb)','EXECUTE') then raise exception 'Public catalogue mutation bypass' using errcode='42501';end if;
 foreach signature in array array['public.search_location_places(text)','public.resolve_search_area(jsonb)','public.issue_browser_search_location(jsonb)','public.get_search_location_receipt(text,uuid)'] loop
  if has_function_privilege('anon',signature,'EXECUTE') or has_function_privilege('pebble_location_catalog_publisher',signature,'EXECUTE') or not has_function_privilege('authenticated',signature,'EXECUTE') then raise exception 'Location RPC privilege mismatch' using errcode='42501';end if;
 end loop;
end $$;
commit;
