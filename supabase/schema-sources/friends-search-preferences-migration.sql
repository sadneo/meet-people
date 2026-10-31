-- REVIEW CANDIDATE ONLY. Authored, NOT applied or SQL-executed by the agent.
-- Parent handles installation/ACL/role/concurrency acceptance in network-none DB.
-- Requires existing Auth/profiles and the profile-details candidate's pinned
-- public.profile_language_key(text) helper. No provider, geocoding, seed catalogue,
-- matcher activation, legacy document writes or Dating/downtime changes.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
do $$ begin
  if current_setting('server_encoding') <> 'UTF8'
    or to_regprocedure('public.profile_language_key(text)') is null
    or to_regclass('public.profiles') is null then
    raise exception 'Friends preference prerequisites missing' using errcode='22023';
  end if;
end $$;

create function public.valid_friends_search_preferences(prefs_in jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare item jsonb; area jsonb; label_in text; labels text[] := '{}'::text[];
begin
  if jsonb_typeof(prefs_in) is distinct from 'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(prefs_in)) <> 5
    or not prefs_in ?& array['ageMin','ageMax','radiusMiles','goals','searchArea'] then return false; end if;
  if jsonb_typeof(prefs_in->'ageMin') is distinct from 'number'
    or jsonb_typeof(prefs_in->'ageMax') is distinct from 'number'
    or jsonb_typeof(prefs_in->'radiusMiles') is distinct from 'number' then return false; end if;
  if (prefs_in->>'ageMin')::numeric not between 18 and 99
    or (prefs_in->>'ageMax')::numeric not between 18 and 99
    or (prefs_in->>'radiusMiles')::numeric not between 1 and 100
    or trunc((prefs_in->>'ageMin')::numeric) <> (prefs_in->>'ageMin')::numeric
    or trunc((prefs_in->>'ageMax')::numeric) <> (prefs_in->>'ageMax')::numeric
    or trunc((prefs_in->>'radiusMiles')::numeric) <> (prefs_in->>'radiusMiles')::numeric
    or (prefs_in->>'ageMin')::numeric > (prefs_in->>'ageMax')::numeric then return false; end if;
  if jsonb_typeof(prefs_in->'goals') is distinct from 'array' then return false; end if;
  if jsonb_array_length(prefs_in->'goals') > 20 then return false; end if;
  for item in select value from jsonb_array_elements(prefs_in->'goals') loop
    if jsonb_typeof(item) is distinct from 'string' then return false; end if;
    label_in := item #>> '{}';
    if char_length(label_in) > 120 or (public.profile_language_key(label_in) collate "C") = ''
      or (label_in collate "C") = any(labels) then return false; end if;
    labels := array_append(labels,label_in);
  end loop;
  area := prefs_in->'searchArea';
  if jsonb_typeof(area) is distinct from 'object' then return false; end if;
  if not area ?& array['source','resolvedLocationRef'] then return false; end if;
  if jsonb_typeof(area->'source') is distinct from 'string'
    or (area->>'source' collate "C") not in ('home','temporary') then return false; end if;
  if (area->>'source' collate "C") = 'home' then
    if (select count(*) from jsonb_object_keys(area)) <> 2 then return false; end if;
  else
    if (select count(*) from jsonb_object_keys(area)) <> 3 or not area ? 'areaLabel' then return false; end if;
    if jsonb_typeof(area->'areaLabel') is distinct from 'string' then return false; end if;
    if char_length(area->>'areaLabel') > 120 or (public.profile_language_key(area->>'areaLabel') collate "C") = '' then return false; end if;
  end if;
  if jsonb_typeof(area->'resolvedLocationRef') not in ('string','null') then return false; end if;
  -- Pin the installed z.uuid() pattern, including its lowercase-only max UUID,
  -- plus exact length so trailing line terminators cannot pass an end anchor.
  if jsonb_typeof(area->'resolvedLocationRef') = 'string' then
    if char_length(area->>'resolvedLocationRef') <> 36 or (area->>'resolvedLocationRef' collate "C") !~ '^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$' then return false; end if;
  end if;
  return true;
end $$;
revoke all on function public.valid_friends_search_preferences(jsonb) from public, anon, authenticated;

-- Private, owner/source/label-bound resolution assertions, NOT a place catalogue.
-- There is deliberately no issuer RPC, seed/backfill, coordinate request payload,
-- expiry default or browser write grant. A future trusted resolver/parent owns
-- issuance/revocation; unresolved selections are still storable with a NULL ref.
create table public.friends_search_location_refs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check ((source collate "C") in ('home','temporary')),
  area_label text not null check (char_length(area_label) <= 120 and (public.profile_language_key(area_label) collate "C") <> ''),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  usable boolean not null
);
alter table public.friends_search_location_refs enable row level security;
revoke all on public.friends_search_location_refs from public, anon, authenticated;

create table public.friends_search_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null check (revision between 1 and 9007199254740991),
  preferences jsonb not null check (public.valid_friends_search_preferences(preferences))
);
alter table public.friends_search_preferences enable row level security;
revoke all on public.friends_search_preferences from public, anon, authenticated;
-- No browser SELECT/DML policies or grants on either private table. Review
-- effective/inherited/default table, column and function privileges before use.
-- Definitions fail on preexisting objects instead of adopting unknown ownership.

create function public.get_friends_search_preferences()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); result jsonb;
begin
  if actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select jsonb_build_object('revision',p.revision,'preferences',p.preferences) into result
    from public.friends_search_preferences p where p.user_id = actor;
  return coalesce(result,'{"revision":0,"preferences":null}'::jsonb);
end $$;
revoke all on function public.get_friends_search_preferences() from public, anon, authenticated;
grant execute on function public.get_friends_search_preferences() to authenticated;

create function public.save_friends_search_preferences(preferences_in jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); expected_revision bigint; prefs jsonb; area jsonb;
  reference_in uuid; resolved public.friends_search_location_refs%rowtype; home_label text;
begin
  if actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Friends preference writes require READ COMMITTED' using errcode='25001'; end if;
  if jsonb_typeof(preferences_in) is distinct from 'object' then
    raise exception 'Invalid Friends preferences' using errcode='22023'; end if;
  if (select count(*) from jsonb_object_keys(preferences_in)) <> 2
    or not preferences_in ?& array['expectedRevision','preferences']
    or jsonb_typeof(preferences_in->'expectedRevision') is distinct from 'number'
    or not public.valid_friends_search_preferences(preferences_in->'preferences') then
    raise exception 'Invalid Friends preferences' using errcode='22023'; end if;
  if (preferences_in->>'expectedRevision')::numeric < 0
    or (preferences_in->>'expectedRevision')::numeric >= 9007199254740991
    or trunc((preferences_in->>'expectedRevision')::numeric) <> (preferences_in->>'expectedRevision')::numeric then
    raise exception 'Invalid or exhausted revision' using errcode='22023'; end if;
  expected_revision := (preferences_in->>'expectedRevision')::numeric::bigint;
  prefs := preferences_in->'preferences'; area := prefs->'searchArea';
  reference_in := (area->>'resolvedLocationRef')::uuid;
  if reference_in is not null then
    -- Lock order: current home (when needed), trusted reference, preferences.
    -- Future trusted issuers must respect this order too. Never change home.
    if (area->>'source' collate "C") = 'home' then
      select p.location_city into home_label from public.profiles p where p.id = actor for share;
      if not found or home_label is null then
        raise exception 'Invalid location reference' using errcode='22023'; end if;
    end if;
    select r.* into resolved from public.friends_search_location_refs r
      where r.id = reference_in and r.user_id = actor and r.usable for share;
    if not found then raise exception 'Invalid location reference' using errcode='22023'; end if;
    if (resolved.source collate "C") <> (area->>'source' collate "C")
      or (resolved.area_label collate "C") is distinct from ((case when (area->>'source' collate "C") = 'home' then home_label else area->>'areaLabel' end) collate "C") then
      raise exception 'Invalid location reference' using errcode='22023'; end if;
  end if;
  if expected_revision = 0 then
    insert into public.friends_search_preferences(user_id,revision,preferences)
      values(actor,1,prefs) on conflict(user_id) do nothing;
  else
    update public.friends_search_preferences set preferences = prefs, revision = revision + 1
      where user_id = actor and revision = expected_revision;
  end if;
  if not found then raise exception 'Friends preferences revision conflict' using errcode='FP409'; end if;
  return public.get_friends_search_preferences();
end $$;
revoke all on function public.save_friends_search_preferences(jsonb) from public, anon, authenticated;
grant execute on function public.save_friends_search_preferences(jsonb) to authenticated;
commit;
