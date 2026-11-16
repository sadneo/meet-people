-- Optional photo captions (up to 40 characters) and profile prompts. Presentation only: neither
-- affects matching. Captions follow the photo image itself (keyed by its
-- SHA-256), so reordering keeps them attached and replacing a photo clears it.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create table photo_private.captions (
 user_id uuid not null references auth.users(id) on delete cascade,
 image_sha bytea not null check (octet_length(image_sha) = 32),
 caption text not null check (char_length(caption) between 1 and 40 and caption !~ '[[:cntrl:]]' and caption = btrim(caption)),
 updated_at timestamptz not null default now(),
 primary key (user_id, image_sha)
);
alter table photo_private.captions enable row level security;
revoke all on photo_private.captions from public,anon,authenticated;

create function photo_private.slot_images(owner_in uuid) returns bytea[]
language sql stable set search_path='' as $$
 select case when p.jpeg is null then '{}'::bytea[] else array_prepend(p.jpeg, p.extra_jpegs) end
 from photo_private.photos p where p.user_id = owner_in
$$;
revoke all on function photo_private.slot_images(uuid) from public,anon,authenticated;

-- Keep the caption only while its image is in the gallery.
create function photo_private.prune_captions() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op = 'DELETE' then
  delete from photo_private.captions where user_id = old.user_id;
 else
  delete from photo_private.captions c where c.user_id = new.user_id
   and c.image_sha is distinct from sha256(new.jpeg)
   and not exists (select 1 from unnest(new.extra_jpegs) image where sha256(image) = c.image_sha);
 end if;
 return null;
end $$;
revoke all on function photo_private.prune_captions() from public,anon,authenticated;
create trigger prune_photo_captions after update of jpeg, extra_jpegs or delete on photo_private.photos
 for each row execute function photo_private.prune_captions();

-- Captions for each current photo slot, in order; null where none is set.
create function public.get_profile_photo_captions(owner_in uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare images bytea[]; result jsonb := '[]'; i int; label text; current_revision bigint;
begin
 -- The reference read locks and verifies the current photo audience.
 perform public.get_profile_photo_reference(owner_in);
 select p.revision into current_revision from photo_private.photos p where p.user_id = owner_in;
 images := coalesce(photo_private.slot_images(owner_in), '{}');
 for i in 1..coalesce(cardinality(images), 0) loop
  select c.caption into label from photo_private.captions c where c.user_id = owner_in and c.image_sha = sha256(images[i]);
  result := result || jsonb_build_array(label);
  label := null;
 end loop;
 return jsonb_build_object('revision', coalesce(current_revision, 0), 'captions', result);
end $$;

create function public.set_profile_photo_caption(caption_in jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid := safety_private.actor(); existing photo_private.photos; images bytea[]; position_in int; label text;
begin
 if current_setting('transaction_isolation') <> 'read committed' then
  raise exception 'READ COMMITTED required' using errcode='25001'; end if;
 if jsonb_typeof(caption_in) is distinct from 'object'
  or (select count(*) from jsonb_object_keys(caption_in)) <> 3
  or not caption_in ?& array['expectedRevision','position','caption']
  or jsonb_typeof(caption_in->'expectedRevision') is distinct from 'number'
  or jsonb_typeof(caption_in->'position') is distinct from 'number'
  or caption_in->>'position' not in ('1','2','3','4')
  or jsonb_typeof(caption_in->'caption') is distinct from 'string'
  or char_length(btrim(caption_in->>'caption')) > 40
  or (caption_in->>'caption') ~ '[[:cntrl:]]'
  or (caption_in->>'expectedRevision')::numeric not between 0 and 9007199254740990
  or trunc((caption_in->>'expectedRevision')::numeric) <> (caption_in->>'expectedRevision')::numeric then
  raise exception 'Invalid caption' using errcode='22023'; end if;
 position_in := (caption_in->>'position')::int;
 label := btrim(caption_in->>'caption');
 perform pg_advisory_xact_lock(hashtextextended('pebble.photo.owner.v1:'||actor::text,0));
 select * into existing from photo_private.photos where user_id = actor for update;
 if coalesce(existing.revision,0) <> (caption_in->>'expectedRevision')::numeric then
  raise exception 'Photos changed' using errcode='PH409'; end if;
 images := coalesce(photo_private.slot_images(actor), '{}');
 if position_in > coalesce(cardinality(images), 0) then raise exception 'Photo unavailable' using errcode='PH409'; end if;
 if label = '' then
  delete from photo_private.captions where user_id = actor and image_sha = sha256(images[position_in]);
 else
  insert into photo_private.captions(user_id,image_sha,caption) values(actor, sha256(images[position_in]), label)
   on conflict(user_id,image_sha) do update set caption = excluded.caption, updated_at = now();
 end if;
 return public.get_profile_photo_captions(actor);
end $$;

revoke all on function public.get_profile_photo_captions(uuid), public.set_profile_photo_caption(jsonb) from public,anon,authenticated;
grant execute on function public.get_profile_photo_captions(uuid), public.set_profile_photo_caption(jsonb) to authenticated;

-- Prompt catalog: id -> audience. Keep in sync with shared/profile-prompts.ts.
create function public.profile_prompt_catalog() returns jsonb
language sql immutable set search_path='' as $$
 select '{"study-spot":"both","ask-me-about":"both","perfect-saturday":"both","get-along":"both","currently":"both","campus-food":"both","proud-of":"both","looking-for":"dating","first-date":"dating","green-flag":"dating"}'::jsonb
$$;
revoke all on function public.profile_prompt_catalog() from public,anon,authenticated;

create function photo_private.profile_prompt_audience(item jsonb) returns text
language sql immutable set search_path='' as $$
 select coalesce(item->>'audience', case when public.profile_prompt_catalog()->>(item->>'id') = 'dating' then 'dating' else 'both' end)
$$;
revoke all on function photo_private.profile_prompt_audience(jsonb) from public,anon,authenticated;

-- Each prompt shows in Friends, Dating or both (default: both, or Dating for
-- Dating-only questions). Up to three per mode, so six in total at most.
create function public.valid_profile_prompts(value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare item jsonb; seen text[] := '{}'; audience text; friends int := 0; dating int := 0;
begin
 if jsonb_typeof(value) is distinct from 'array' or jsonb_array_length(value) > 6 then return false; end if;
 for item in select x from jsonb_array_elements(value) x loop
  if jsonb_typeof(item) is distinct from 'object'
   or not item ?& array['id','answer'] or (item - array['id','answer','audience']) <> '{}'::jsonb
   or jsonb_typeof(item->'id') is distinct from 'string' or jsonb_typeof(item->'answer') is distinct from 'string'
   or not public.profile_prompt_catalog() ? (item->>'id')
   or item->>'id' = any(seen)
   or char_length(item->>'answer') not between 1 and 150
   or item->>'answer' <> btrim(item->>'answer')
   or (item->>'answer') ~ '[[:cntrl:]]' then return false; end if;
  if item ? 'audience' and (jsonb_typeof(item->'audience') is distinct from 'string' or item->>'audience' not in ('both','friends','dating')) then return false; end if;
  audience := photo_private.profile_prompt_audience(item);
  if public.profile_prompt_catalog()->>(item->>'id') = 'dating' and audience <> 'dating' then return false; end if;
  if audience in ('both','friends') then friends := friends + 1; end if;
  if audience in ('both','dating') then dating := dating + 1; end if;
  seen := array_append(seen, item->>'id');
 end loop;
 return friends <= 3 and dating <= 3;
end $$;
revoke all on function public.valid_profile_prompts(jsonb) from public,anon,authenticated;

-- Prompts are an optional fourth key; earlier documents stay valid.
create or replace function public.valid_profile_customization(value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare item jsonb; seen text[] := '{}'; label text;
begin
 if jsonb_typeof(value) is distinct from 'object'
  or not value ?& array['interestOrder','audiences','gardenItem']
  or (value - array['interestOrder','audiences','gardenItem','prompts','datingBio']) <> '{}'::jsonb then return false; end if;
 if value ? 'prompts' and not public.valid_profile_prompts(value->'prompts') then return false; end if;
 -- Optional bio shown in Dating instead of the main bio.
 if value ? 'datingBio' and jsonb_typeof(value->'datingBio') <> 'null' and (
  jsonb_typeof(value->'datingBio') is distinct from 'string'
  or char_length(value->>'datingBio') not between 1 and 1000
  or value->>'datingBio' <> btrim(value->>'datingBio')) then return false; end if;
 if jsonb_typeof(value->'interestOrder') is distinct from 'array' or jsonb_array_length(value->'interestOrder') > 5 then return false; end if;
 for item in select x from jsonb_array_elements(value->'interestOrder') x loop
  if jsonb_typeof(item) is distinct from 'string' then return false; end if;
  label := item #>> '{}';
  if char_length(label) not between 1 and 120 or label = any(seen) then return false; end if;
  seen := array_append(seen, label);
 end loop;
 if jsonb_typeof(value->'audiences') is distinct from 'object'
  or (select count(*) from jsonb_object_keys(value->'audiences')) <> 3
  or not (value->'audiences') ?& array['education','occupation','languages']
  or exists(select 1 from jsonb_each(value->'audiences') a where jsonb_typeof(a.value) is distinct from 'string' or a.value #>> '{}' not in ('both','friends','dating'))
 then return false; end if;
 if jsonb_typeof(value->'gardenItem') not in ('null','string')
  or (jsonb_typeof(value->'gardenItem') = 'string' and value->>'gardenItem' !~ '^[a-z][a-z-]{0,39}$') then return false; end if;
 return true;
end $$;

create or replace function public.profile_customization_default() returns jsonb
language sql immutable set search_path='' as $$
 select '{"interestOrder":[],"audiences":{"education":"both","occupation":"both","languages":"both"},"gardenItem":null,"prompts":[],"datingBio":null}'::jsonb
$$;

-- Saves that omit prompts or the Dating bio (earlier clients) keep what's stored.
do $$
declare definition text;
begin
 definition := pg_catalog.pg_get_functiondef('public.save_profile_customization(jsonb)'::regprocedure);
 if position('value := customization_in->''customization'';' in definition) = 0 then
  raise exception 'Unreviewed customization save body' using errcode='22023'; end if;
 execute replace(definition, 'value := customization_in->''customization'';',
  'value := customization_in->''customization'';
 if not value ? ''prompts'' then
  value := value || jsonb_build_object(''prompts'', coalesce((select c.customization->''prompts'' from public.profile_customization c where c.user_id = actor), ''[]''::jsonb));
 end if;
 if not value ? ''datingBio'' then
  value := value || jsonb_build_object(''datingBio'', coalesce((select c.customization->''datingBio'' from public.profile_customization c where c.user_id = actor), ''null''::jsonb));
 end if;');
end $$;

-- What another person may read for one mode. Dating prompts go only to someone
-- the owner could meet in Dating; Friends prompts to anyone in the photo audience.
create function public.get_profile_prompts(owner_in uuid, mode_in text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid := safety_private.actor(); stored jsonb; dating_allowed boolean;
begin
 if owner_in is null or mode_in is null or mode_in not in ('friends','dating') then raise exception 'Invalid prompt read' using errcode='22023'; end if;
 perform photo_private.lock_audience(actor, owner_in);
 if not photo_private.audience(actor, owner_in) then raise exception 'Profile unavailable' using errcode='PC404'; end if;
 select c.customization->'prompts' into stored from public.profile_customization c where c.user_id = owner_in;
 dating_allowed := mode_in = 'dating' and (actor = owner_in or dating_private.rules_pair(actor, owner_in));
 return coalesce((select jsonb_agg(p.item order by p.position)
  from jsonb_array_elements(coalesce(stored,'[]')) with ordinality p(item, position)
  where (mode_in = 'friends' and photo_private.profile_prompt_audience(p.item) in ('both','friends'))
   or (dating_allowed and photo_private.profile_prompt_audience(p.item) in ('both','dating'))), '[]'::jsonb);
end $$;
revoke all on function public.get_profile_prompts(uuid,text) from public,anon,authenticated;
grant execute on function public.get_profile_prompts(uuid,text) to authenticated;

-- Dating cards show the Dating bio when one is set; card fields are unchanged.
do $$
declare definition text; name text;
begin
 foreach name in array array['public.project_dating_candidate(uuid)','public.find_dating_candidate(jsonb)'] loop
  definition := pg_catalog.pg_get_functiondef(name::regprocedure);
  if position('''bio'',p.bio' in definition) = 0 then raise exception 'Unreviewed Dating card body: %', name using errcode='22023'; end if;
  execute replace(definition, '''bio'',p.bio',
   '''bio'',coalesce((select c.customization->>''datingBio'' from public.profile_customization c where c.user_id=p.id),p.bio)');
 end loop;
end $$;

notify pgrst,'reload schema';
commit;
