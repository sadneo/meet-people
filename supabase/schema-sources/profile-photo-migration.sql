-- REVIEW CANDIDATE. Bounded private shared profile photo, no public bucket/URL.
begin;
set local lock_timeout='3s';set local statement_timeout='30s';
do $$ begin
 if to_regprocedure('social_private.profile_audience(uuid,uuid)') is null or to_regprocedure('location_private.usable(text,uuid,uuid,text,text)') is null then raise exception 'Photo prerequisites missing' using errcode='22023';end if;
end $$;
create schema photo_private;
revoke all on schema photo_private from public,anon,authenticated;
-- Strict baseline JPEG envelope emitted by the API. No EXIF, XMP, ICC, comments,
-- extra frames, trailing data or metadata-bearing APP segments can bypass the API.
create function photo_private.valid_jpeg(bytes bytea) returns boolean language plpgsql immutable set search_path='' as $$
declare total integer:=octet_length(bytes);pos integer:=2;marker integer;size integer;frame boolean:=false;scan boolean:=false;width integer;height integer;i integer;begin
 if total not between 32 and 262144 or get_byte(bytes,0)<>255 or get_byte(bytes,1)<>216 then return false;end if;
 while pos<total loop
  if get_byte(bytes,pos)<>255 or pos+1>=total then return false;end if;
  marker:=get_byte(bytes,pos+1);pos:=pos+2;
  if marker=217 then return scan and pos=total;end if;
  if scan then
   if marker=0 or marker between 208 and 215 then
    while pos<total and get_byte(bytes,pos)<>255 loop pos:=pos+1;end loop;
    continue;
   end if;
   return false;
  end if;
  if marker not in(192,196,219,218,224) or pos+1>=total then return false;end if;
  size:=get_byte(bytes,pos)*256+get_byte(bytes,pos+1);
  if size<2 or pos+size>total then return false;end if;
  if marker=224 and (size<>16 or substring(bytes from pos+3 for 5)<>decode('4a46494600','hex')) then return false;end if;
  if marker=192 then
   if frame or size<11 or get_byte(bytes,pos+2)<>8 then return false;end if;
   height:=get_byte(bytes,pos+3)*256+get_byte(bytes,pos+4);width:=get_byte(bytes,pos+5)*256+get_byte(bytes,pos+6);
   if width not between 1 and 512 or height not between 1 and 512 or get_byte(bytes,pos+7) not in(1,3) or size<>8+3*get_byte(bytes,pos+7) then return false;end if;
   frame:=true;
  end if;
  pos:=pos+size;
  if marker=218 then
   if not frame or scan then return false;end if;scan:=true;
   while pos<total and get_byte(bytes,pos)<>255 loop pos:=pos+1;end loop;
  end if;
 end loop;
 return false;
exception when data_exception then return false;
end $$;
create table photo_private.photos(
 user_id uuid primary key references auth.users(id) on delete cascade,
 revision bigint not null check(revision between 1 and 9007199254740991),
 jpeg bytea check(jpeg is null or photo_private.valid_jpeg(jpeg)),
 updated_at timestamptz not null default statement_timestamp()
);
create table photo_private.requests(
 user_id uuid not null references auth.users(id) on delete cascade,request_id uuid not null,fingerprint bytea not null,
 revision bigint not null,has_photo boolean not null,created_at timestamptz not null default statement_timestamp(),primary key(user_id,request_id)
);
alter table photo_private.photos enable row level security;alter table photo_private.requests enable row level security;
revoke all on all tables in schema photo_private from public,anon,authenticated;
create function public.get_profile_photo_state() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=safety_private.actor();result jsonb;begin
 select jsonb_build_object('revision',p.revision,'hasPhoto',p.jpeg is not null,'updatedAt',to_char(p.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) into result from photo_private.photos p where p.user_id=actor;
 return coalesce(result,'{"revision":0,"hasPhoto":false,"updatedAt":null}');end $$;
create function public.save_profile_photo(photo_in jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=safety_private.actor();expected bigint;key uuid;bytes bytea;fingerprint bytea;prior photo_private.requests;current_photo photo_private.photos;begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'READ COMMITTED required' using errcode='25001';end if;
 if jsonb_typeof(photo_in) is distinct from 'object' or (select count(*) from jsonb_object_keys(photo_in))<>3 or not photo_in ?& array['expectedRevision','requestId','jpegBase64']
 or jsonb_typeof(photo_in->'expectedRevision') is distinct from 'number' or jsonb_typeof(photo_in->'requestId') is distinct from 'string' or jsonb_typeof(photo_in->'jpegBase64') not in('null','string') then raise exception 'Invalid photo request' using errcode='22023';end if;
 if (photo_in->>'expectedRevision')::numeric not between 0 and 9007199254740990 or trunc((photo_in->>'expectedRevision')::numeric)<>(photo_in->>'expectedRevision')::numeric or not location_private.valid_uuid(photo_in->>'requestId') or char_length(photo_in->>'jpegBase64')>349528 then raise exception 'Invalid photo values' using errcode='22023';end if;
 expected:=(photo_in->>'expectedRevision')::bigint;key:=(photo_in->>'requestId')::uuid;
 begin bytes:=decode(photo_in->>'jpegBase64','base64');exception when data_exception then raise exception 'Invalid photo encoding' using errcode='22023';end;
 if bytes is not null and not photo_private.valid_jpeg(bytes) then raise exception 'Only sanitized baseline photo JPEG is accepted' using errcode='22023';end if;
 fingerprint:=sha256(convert_to(photo_in::text,'UTF8'));
 perform pg_advisory_xact_lock(hashtextextended('pebble.photo.owner.v1:'||actor::text,0));
 select * into prior from photo_private.requests r where r.user_id=actor and r.request_id=key;
 if found then
  if prior.fingerprint<>fingerprint then raise exception 'Photo request changed' using errcode='PH409';end if;
  -- A later edit cannot be mistaken for confirmation of the replayed mutation.
  select * into current_photo from photo_private.photos p where p.user_id=actor;
  if current_photo.revision<>prior.revision then raise exception 'Photo changed after this request' using errcode='PH409';end if;
  return public.get_profile_photo_state();
 end if;
 select * into current_photo from photo_private.photos p where p.user_id=actor for update;
 if coalesce(current_photo.revision,0)<>expected then raise exception 'Photo revision conflict' using errcode='PH409';end if;
 -- Removing an actual saved image is never blocked by an upload quota. Empty
 -- redundant removals are bounded separately; they cannot grow the ledger freely.
 if bytes is not null then
  if (select count(*) from photo_private.requests r where r.user_id=actor and r.has_photo and r.created_at>statement_timestamp()-interval '1 hour')>=5
  or (select count(*) from photo_private.requests r where r.user_id=actor and r.has_photo and r.created_at>statement_timestamp()-interval '24 hours')>=20 then raise exception 'Photo upload limit' using errcode='PH429';end if;
 elsif current_photo.jpeg is null then
  if (select count(*) from photo_private.requests r where r.user_id=actor and not r.has_photo and r.created_at>statement_timestamp()-interval '1 hour')>=5
  or (select count(*) from photo_private.requests r where r.user_id=actor and not r.has_photo and r.created_at>statement_timestamp()-interval '24 hours')>=20 then raise exception 'Empty photo change limit' using errcode='PH429';end if;
 end if;
 insert into photo_private.photos(user_id,revision,jpeg) values(actor,expected+1,bytes) on conflict(user_id) do update set revision=excluded.revision,jpeg=excluded.jpeg,updated_at=statement_timestamp();
 insert into photo_private.requests(user_id,request_id,fingerprint,revision,has_photo) values(actor,key,fingerprint,expected+1,bytes is not null);
 return public.get_profile_photo_state();
end $$;
-- History membership alone is not a current photo audience. Dating adds its
-- own reciprocal current audience when that reviewed candidate is installed.
create function photo_private.audience(viewer uuid,owner uuid) returns boolean language sql stable security definer set search_path='' as $$
 select viewer=owner or (public.safety_pair_allowed(viewer,owner) and (social_private.profile_audience(viewer,owner) or (social_private.friends_discoverable(viewer) and social_private.friends_discoverable(owner))));
$$;
create function photo_private.lock_audience(viewer uuid,owner uuid) returns void language plpgsql volatile security definer set search_path='' as $$
begin
 if viewer<>owner then perform social_private.lock_pair(viewer,owner);end if;
 perform 1 from public.account_settings s where s.user_id in(viewer,owner) order by s.user_id for share;
 perform 1 from public.detailed_settings s where s.user_id in(viewer,owner) order by s.user_id for share;
end $$;
create function public.get_profile_photo_reference(owner_in uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=safety_private.actor();result jsonb;begin
 if owner_in is null then raise exception 'Invalid photo owner' using errcode='22023';end if;
 perform photo_private.lock_audience(actor,owner_in);
 perform 1 from photo_private.photos p where p.user_id=owner_in for share;
 if not photo_private.audience(actor,owner_in) then raise exception 'Photo unavailable' using errcode='PT404';end if;
 select jsonb_build_object('revision',p.revision,'hasPhoto',p.jpeg is not null,'updatedAt',null) into result from photo_private.photos p where p.user_id=owner_in;
 return coalesce(result,'{"revision":0,"hasPhoto":false,"updatedAt":null}');end $$;
create function public.read_profile_photo(owner_in uuid,revision_in bigint) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=safety_private.actor();result jsonb;begin
 if owner_in is null or revision_in is null or revision_in<0 then raise exception 'Invalid photo read' using errcode='22023';end if;
 perform photo_private.lock_audience(actor,owner_in);
 perform 1 from photo_private.photos p where p.user_id=owner_in for share;
 if not photo_private.audience(actor,owner_in) then raise exception 'Photo unavailable' using errcode='PT404';end if;
 select jsonb_build_object('revision',p.revision,'jpegBase64',encode(p.jpeg,'base64')) into result from photo_private.photos p where p.user_id=owner_in and p.jpeg is not null and (revision_in=0 or p.revision=revision_in);
 if result is null then raise exception 'Photo unavailable' using errcode='PT404';end if;
 return result;end $$;
revoke all on all functions in schema photo_private from public,anon,authenticated;
revoke all on function public.get_profile_photo_state(),public.save_profile_photo(jsonb),public.read_profile_photo(uuid,bigint),public.get_profile_photo_reference(uuid) from public,anon,authenticated;
grant execute on function public.get_profile_photo_state(),public.save_profile_photo(jsonb),public.read_profile_photo(uuid,bigint),public.get_profile_photo_reference(uuid) to authenticated;
do $$ declare r text;f record;t text;signature text;begin
 foreach r in array array['anon','authenticated'] loop
  if has_schema_privilege(r::name,'photo_private','USAGE') then raise exception 'Inherited photo schema access' using errcode='42501';end if;
  foreach t in array array['photos','requests'] loop
   if has_table_privilege(r::name,'photo_private.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_any_column_privilege(r::name,'photo_private.'||t,'SELECT,INSERT,UPDATE,REFERENCES') then raise exception 'Inherited photo data access' using errcode='42501';end if;
  end loop;
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='photo_private' loop
   if has_function_privilege(r::name,f.oid,'EXECUTE') then raise exception 'Inherited photo helper access' using errcode='42501';end if;
  end loop;
 end loop;
 foreach signature in array array['public.get_profile_photo_state()','public.save_profile_photo(jsonb)','public.read_profile_photo(uuid,bigint)','public.get_profile_photo_reference(uuid)'] loop
  if has_function_privilege('anon',signature,'EXECUTE') or not has_function_privilege('authenticated',signature,'EXECUTE') then raise exception 'Inherited photo RPC access' using errcode='42501';end if;
 end loop;
end $$;
commit;
