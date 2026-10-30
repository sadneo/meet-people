-- Additive Google/map picker support. No keys, catalogue imports or user changes.
-- Activation requires an operator-installed HMAC key and provider retention review.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';

create table location_private.map_signing_key (
 singleton boolean primary key check(singleton), secret bytea not null check(octet_length(secret)=32)
);
create table location_private.map_selections (
 mode text not null, id uuid not null, provider_place_id text,
 origin text not null check(origin in('place-search','map-pin','device-assisted')),
 primary key(mode,id), foreign key(mode,id) references location_private.assertions(mode,id) on delete cascade
);
alter table location_private.map_signing_key enable row level security;
alter table location_private.map_selections enable row level security;
revoke all on location_private.map_signing_key,location_private.map_selections from public,anon,authenticated,service_role,pebble_location_catalog_publisher;

alter table location_private.assertions drop constraint assertions_method_check;
alter table location_private.assertions drop constraint assertions_check1;
alter table location_private.assertions add constraint assertions_method_check check(method in('geocoded-area','device-reported','selected-area'));
alter table location_private.assertions add constraint assertions_evidence_check check(
 (method='geocoded-area' and place_id is not null and accuracy_meters is null)
 or (method='device-reported' and place_id is null and accuracy_meters between 0.000001 and 1000)
 or (method='selected-area' and place_id is null and accuracy_meters is null)
);

-- Preserve every legacy home/catalogue/device condition. New selections are
-- independently chosen search areas, not device-presence assertions.
create or replace function location_private.usable(mode_in text,reference_in uuid,actor_in uuid,source_in text,label_in text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from location_private.assertions proof join (
  select 'friends' mode,r.* from public.friends_search_location_refs r union all select 'dating' mode,r.* from public.dating_search_location_refs r
 ) r on r.mode=proof.mode and r.id=proof.id left join location_private.places place on place.id=proof.place_id
 where proof.mode=mode_in and proof.id=reference_in and proof.actor_id=actor_in and r.user_id=actor_in and r.usable
 and r.source=source_in and r.area_label=label_in and proof.issued_at<=statement_timestamp() and proof.expires_at>statement_timestamp()
 and (
  (proof.method='selected-area' and source_in='temporary' and exists(select 1 from location_private.map_selections s where s.mode=proof.mode and s.id=proof.id))
  or (proof.method='device-reported' and source_in='temporary' and exists(select 1 from public.account_settings settings where settings.user_id=actor_in and public.detailed_settings_masters(settings.settings) is not null and settings.settings->'location'='true'::jsonb))
  or (proof.method='geocoded-area' and place.enabled and place.verified_until>statement_timestamp() and r.latitude=place.latitude and r.longitude=place.longitude
   and (source_in<>'temporary' or r.area_label=place.label)
   and (source_in<>'home' or exists(select 1 from unnest(place.aliases) alias where public.profile_language_key(alias)=public.profile_language_key(label_in))))
 ));
$$;

create function public.confirm_map_search_location(ticket_in jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=safety_private.actor(); payload text; claims jsonb; secret_in bytea; request_in uuid; mode_in text;
 lat double precision; lon double precision; issued timestamptz; expiry timestamptz; reference_in uuid:=gen_random_uuid(); prior jsonb;
begin
 if jsonb_typeof(ticket_in) is distinct from 'object' or (select count(*) from jsonb_object_keys(ticket_in))<>2
 or not ticket_in ?& array['payload','signature'] or jsonb_typeof(ticket_in->'payload') is distinct from 'string'
 or jsonb_typeof(ticket_in->'signature') is distinct from 'string' or char_length(ticket_in->>'payload')>4096
 or (ticket_in->>'signature') !~ '^[a-f0-9]{64}$' then raise exception 'Invalid map ticket' using errcode='22023';end if;
 payload:=ticket_in->>'payload';
 select secret into secret_in from location_private.map_signing_key where singleton for share;
 if secret_in is null then raise exception 'Map resolver not activated' using errcode='LC503';end if;
 if extensions.hmac(convert_to(payload,'UTF8'),secret_in,'sha256')<>decode(ticket_in->>'signature','hex') then raise exception 'Invalid map signature' using errcode='22023';end if;
 begin
  claims:=payload::jsonb;
  if jsonb_typeof(claims) is distinct from 'object' or (select count(*) from jsonb_object_keys(claims))<>10
   or not claims ?& array['actorId','requestId','mode','latitude','longitude','areaLabel','origin','providerPlaceId','issuedAt','expiresAt']
   or claims->>'actorId' is distinct from actor::text or claims->>'mode' not in('friends','dating')
   or claims->>'origin' not in('place-search','map-pin','device-assisted')
   or jsonb_typeof(claims->'latitude')<>'number' or jsonb_typeof(claims->'longitude')<>'number'
   or jsonb_typeof(claims->'areaLabel')<>'string' or char_length(claims->>'areaLabel') not between 1 and 120
   or public.profile_language_key(claims->>'areaLabel')='' then raise exception 'Invalid map claims' using errcode='22023';end if;
  request_in:=(claims->>'requestId')::uuid;mode_in:=claims->>'mode';
  lat:=(claims->>'latitude')::double precision;lon:=(claims->>'longitude')::double precision;
  issued:=(claims->>'issuedAt')::timestamptz;expiry:=(claims->>'expiresAt')::timestamptz;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then raise exception 'Invalid map claims' using errcode='22023';end;
 if request_in is null or mode_in is null or not(lat between -90 and 90 and lon between -180 and 180)
 or issued is null or expiry is null or not isfinite(issued) or not isfinite(expiry)
 or expiry<=issued or expiry>issued+interval '10 minutes' then raise exception 'Invalid map limits' using errcode='22023';end if;
 -- Exact same ticket retries recover the original receipt, even after preview TTL.
 prior:=location_private.replay(request_in,ticket_in,actor);if prior is not null then return prior;end if;
 if issued>statement_timestamp()+interval '15 seconds' or expiry<=statement_timestamp() then raise exception 'Map preview expired' using errcode='LC409';end if;
 if claims->>'origin'='device-assisted' and not exists(select 1 from public.account_settings s where s.user_id=actor and s.settings->'location'='true'::jsonb for share)
 then raise exception 'Device location opt-in required' using errcode='LC403';end if;
 if mode_in='friends' then insert into public.friends_search_location_refs values(reference_in,actor,'temporary',claims->>'areaLabel',lat,lon,true);
 else insert into public.dating_search_location_refs values(reference_in,actor,'temporary',claims->>'areaLabel',lat,lon,true);end if;
 -- Conservative provider-data lifetime. No one-hour GPS expiry, indefinite cache,
 -- automatic movement or background device reads. Re-confirm when this expires.
 insert into location_private.assertions(mode,id,actor_id,method,issued_at,expires_at,place_id,accuracy_meters)
 values(mode_in,reference_in,actor,'selected-area',statement_timestamp(),issued+interval '29 days',null,null);
 insert into location_private.map_selections values(mode_in,reference_in,claims->>'providerPlaceId',claims->>'origin');
 insert into location_private.requests(actor_id,request_id,fingerprint,mode,reference_id) values(actor,request_in,pg_catalog.sha256(convert_to(ticket_in::text,'UTF8')),mode_in,reference_in);
 return public.get_search_location_receipt(mode_in,reference_in);
end $$;

create function public.get_search_location_map(mode_in text,reference_in uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=safety_private.actor(); receipt jsonb; result jsonb;
begin
 receipt:=public.get_search_location_receipt(mode_in,reference_in);
 if receipt->'usable' is distinct from 'true'::jsonb then raise exception 'Selection expired' using errcode='LC409';end if;
 select jsonb_build_object('center',jsonb_build_object('latitude',r.latitude,'longitude',r.longitude),'areaLabel',r.area_label,'usable',true) into result
 from (select 'friends' mode,r.* from public.friends_search_location_refs r union all select 'dating' mode,r.* from public.dating_search_location_refs r) r
 where r.mode=mode_in and r.id=reference_in and r.user_id=actor;
 if result is null then raise exception 'Map selection unavailable' using errcode='PT404';end if;
 return result;
end $$;

-- Operator/cron only: purge cached coordinates and provider IDs at expiry, and
-- unused confirmations after a 24h retry window. JSON preferences retain only
-- their user-confirmed display choice and an unusable reference, never coords.
create function location_private.purge_map_locations() returns integer
language plpgsql security definer set search_path='' as $$
declare row_in record; total integer:=0;
begin
 for row_in in select a.* from location_private.assertions a where a.method='selected-area' and
  (a.expires_at<=clock_timestamp() or (a.issued_at<clock_timestamp()-interval '24 hours'
   and not exists(select 1 from public.friends_search_preferences p where a.mode='friends' and p.user_id=a.actor_id and p.preferences->'searchArea'->>'resolvedLocationRef'=a.id::text)
   and not exists(select 1 from public.dating_owner_aggregates p where a.mode='dating' and p.user_id=a.actor_id and p.search->'searchArea'->>'resolvedLocationRef'=a.id::text)))
 loop
  if row_in.mode='friends' then perform 1 from public.friends_search_location_refs where id=row_in.id for update;
  else perform 1 from public.dating_search_location_refs where id=row_in.id for update;end if;
  -- Recheck after acquiring the same reference lock used by preference saves.
  if row_in.expires_at>clock_timestamp() and (
   exists(select 1 from public.friends_search_preferences p where row_in.mode='friends' and p.user_id=row_in.actor_id and p.preferences->'searchArea'->>'resolvedLocationRef'=row_in.id::text)
   or exists(select 1 from public.dating_owner_aggregates p where row_in.mode='dating' and p.user_id=row_in.actor_id and p.search->'searchArea'->>'resolvedLocationRef'=row_in.id::text)) then continue;end if;
  delete from location_private.requests where mode=row_in.mode and reference_id=row_in.id;
  delete from location_private.assertions where mode=row_in.mode and id=row_in.id;
  if row_in.mode='friends' then delete from public.friends_search_location_refs where id=row_in.id;
  else delete from public.dating_search_location_refs where id=row_in.id;end if;
  total:=total+1;
 end loop;
 return total;
end $$;
revoke all on function location_private.purge_map_locations() from public,anon,authenticated,service_role,pebble_location_catalog_publisher;
revoke all on function public.confirm_map_search_location(jsonb),public.get_search_location_map(text,uuid) from public,anon,authenticated,service_role,pebble_location_catalog_publisher;
grant execute on function public.confirm_map_search_location(jsonb),public.get_search_location_map(text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
