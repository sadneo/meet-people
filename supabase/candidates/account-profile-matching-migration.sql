-- REVIEW CANDIDATE ONLY: never installed by the agent.
-- Parent prerequisite: existing profiles table and legacy matchmaking-profile RPCs.
-- No replacement matcher, profile deletion, Auth signup trigger or provider calls.
begin;

-- Candidate is RPC-only: do not silently leave a browser direct-write bypass.
-- Preserve grants rather than revoking existing product access implicitly.
-- Parent must review/restrict these grants separately before installation.
do $$
declare browser_role text;
begin
 foreach browser_role in array array['anon','authenticated'] loop
  if has_table_privilege(browser_role::name,'public.profiles','INSERT,UPDATE,DELETE')
   or has_any_column_privilege(browser_role::name,'public.profiles','INSERT')
   or has_any_column_privilege(browser_role::name,'public.profiles','UPDATE') then
   raise exception 'Candidate requires RPC-only profile writes; review direct-write grants for %', browser_role using errcode='42501';
  end if;
 end loop;
end $$;

create function public.valid_account_identity(profile_in jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare avatar text; port text;
begin
 if profile_in is null or jsonb_typeof(profile_in) <> 'object'
  or (select count(*) from jsonb_object_keys(profile_in)) <> 4
  or not (profile_in ?& array['username','display_name','bio','avatar_url'])
  or jsonb_typeof(profile_in->'username') <> 'string'
  or jsonb_typeof(profile_in->'display_name') <> 'string'
  or char_length(btrim(profile_in->>'username')) not between 1 and 80
  or char_length(btrim(profile_in->>'display_name')) not between 1 and 120
  or jsonb_typeof(profile_in->'bio') not in ('string','null')
  or char_length(profile_in->>'bio') > 1000
  or jsonb_typeof(profile_in->'avatar_url') not in ('string','null') then return false; end if;
 avatar := profile_in->>'avatar_url';
 if avatar is not null then
  if char_length(avatar) > 2048 or avatar ~ '[[:space:]]'
   or avatar !~* '^https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'
   or split_part(regexp_replace(avatar, '^https://([^/:?#]+).*$', '\1', 'i'), '.',
      array_length(string_to_array(regexp_replace(avatar, '^https://([^/:?#]+).*$', '\1', 'i'), '.'), 1)) !~* '^[a-z]([a-z0-9-]*[a-z0-9])?$'
  then return false; end if;
  port := substring(avatar from '(?i)^https://[^/:?#]+:([0-9]+)');
  if port is not null and port::integer > 65535 then return false; end if;
 end if;
 return true;
end $$;
revoke all on function public.valid_account_identity(jsonb) from public, anon, authenticated;

create table public.account_profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 username text not null unique,
 display_name text not null,
 bio text,
 avatar_url text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint account_identity_valid check(public.valid_account_identity(jsonb_build_object(
  'username',username,'display_name',display_name,'bio',bio,'avatar_url',avatar_url)))
);
alter table public.account_profiles enable row level security;
revoke all on public.account_profiles from public, anon, authenticated;
grant select on public.account_profiles to authenticated;
create policy account_profiles_own_read on public.account_profiles for select to authenticated
 using (id = (select auth.uid()));

-- Copy only already-real, valid legacy identities. No email/anonymous fallback,
-- no trimming/rewrite of existing profiles, no removal of invalid legacy rows.
insert into public.account_profiles(id, username, display_name, bio, avatar_url)
select p.id, p.username, p.display_name, p.bio, p.avatar_url from public.profiles p
where public.valid_account_identity(jsonb_build_object('username',p.username,
 'display_name',p.display_name,'bio',p.bio,'avatar_url',p.avatar_url));

create function public.get_account_profile()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); result jsonb;
begin
 if actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
 select jsonb_build_object('username',p.username,'display_name',p.display_name,
  'bio',p.bio,'avatar_url',p.avatar_url) into result from public.account_profiles p where p.id=actor;
 return result;
end $$;

-- The old profiles identity columns remain a projection for all existing algorithms/RPCs.
-- After installation, old matching clients may still submit the full legacy shape,
-- but cannot overwrite canonical account identity. Missing canonical rows retain
-- their existing legacy behavior until a person explicitly saves a real account.
create function public.project_account_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare account public.account_profiles%rowtype;
begin
 select * into account from public.account_profiles where id=new.id;
 if found then
  new.username := account.username; new.display_name := account.display_name;
  new.bio := account.bio; new.avatar_url := account.avatar_url;
 end if;
 return new;
end $$;
revoke all on function public.project_account_identity() from public, anon, authenticated;
create trigger account_identity_projection before insert or update of username,display_name,bio,avatar_url
 on public.profiles for each row execute function public.project_account_identity();

create function public.save_account_profile(profile_in jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
 if actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if not public.valid_account_identity(profile_in) then
  raise exception 'Invalid account identity' using errcode='22023'; end if;
  if current_setting('transaction_isolation') <> 'read committed' then
   raise exception 'Profile writes require READ COMMITTED isolation' using errcode='25001'; end if;
  -- One namespace across BOTH RPCs, before any actor/row locks or writes.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('profile-username-namespace',0));
  -- Preserve existing actor/row lock order inside the common namespace lock.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('account-profile:' || actor::text,0));
 perform 1 from public.profiles where id=actor for update;
 -- Reserve usernames against legacy rows, including rows excluded from backfill.
 if exists(select 1 from public.profiles where username=btrim(profile_in->>'username') and id<>actor) then
  raise exception 'Username already exists' using errcode='23505'; end if;
 insert into public.account_profiles(id,username,display_name,bio,avatar_url)
 values(actor,btrim(profile_in->>'username'),btrim(profile_in->>'display_name'),profile_in->>'bio',profile_in->>'avatar_url')
 on conflict(id) do update set username=excluded.username,display_name=excluded.display_name,
  bio=excluded.bio,avatar_url=excluded.avatar_url,updated_at=now();
 -- Update only existing matching identity projection, never create an invalid
 -- matching profile or touch interests, availability, coordinates or queue.
 update public.profiles set username=btrim(profile_in->>'username'),display_name=btrim(profile_in->>'display_name'),
  bio=profile_in->>'bio',avatar_url=profile_in->>'avatar_url',updated_at=now() where id=actor;
 return public.get_account_profile();
end $$;
revoke all on function public.get_account_profile() from public, anon, authenticated;
revoke all on function public.save_account_profile(jsonb) from public, anon, authenticated;
grant execute on function public.get_account_profile() to authenticated;
grant execute on function public.save_account_profile(jsonb) to authenticated;

-- Candidate replacement only. Historical migration remains untouched.
-- Validation and interest/window persistence below match the legacy RPC.
create or replace function public.save_matchmaking_profile(profile_in jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid(); item jsonb; labels text[] := '{}'::text[];
  username_in text; name_in text; city_in text; date_in date;
  label_in text; avatar_parts text[];
  canonical_username text;
begin
  if actor is null then raise exception 'Not authenticated' using errcode='28000'; end if;
  if profile_in is null or jsonb_typeof(profile_in)<>'object' then
    raise exception 'Invalid profile' using errcode='22023'; end if;
  if (select count(*) from jsonb_object_keys(profile_in))<>8 or not profile_in ?& array['username','display_name','bio','birthdate','location_city','avatar_url','interests','availability'] then
    raise exception 'Invalid profile fields' using errcode='22023'; end if;
  if jsonb_typeof(profile_in->'username')<>'string' or jsonb_typeof(profile_in->'display_name')<>'string' then
    raise exception 'Invalid profile names' using errcode='22023'; end if;
  username_in:=regexp_replace(profile_in->>'username','^\s+|\s+$','','g');
  name_in:=regexp_replace(profile_in->>'display_name','^\s+|\s+$','','g');
  if char_length(username_in) not between 1 and 80 or char_length(name_in) not between 1 and 120 then
    raise exception 'Invalid profile names' using errcode='22023'; end if;
  if jsonb_typeof(profile_in->'bio') not in ('string','null') or char_length(profile_in->>'bio')>1000 then
    raise exception 'Invalid bio' using errcode='22023'; end if;
  if jsonb_typeof(profile_in->'location_city') not in ('string','null') then
    raise exception 'Invalid area' using errcode='22023'; end if;
  city_in:=regexp_replace(profile_in->>'location_city','^\s+|\s+$','','g');
  if char_length(city_in)>120 then raise exception 'Invalid area' using errcode='22023'; end if;
  if jsonb_typeof(profile_in->'birthdate') not in ('string','null') then
    raise exception 'Invalid birthdate' using errcode='22023'; end if;
  if profile_in->>'birthdate' is not null then
    if (profile_in->>'birthdate') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'Invalid birthdate' using errcode='22023'; end if;
    begin
      date_in:=(profile_in->>'birthdate')::date;
    exception when datetime_field_overflow or invalid_datetime_format then
      raise exception 'Invalid birthdate' using errcode='22023';
    end;
    if to_char(date_in,'YYYY-MM-DD')<>profile_in->>'birthdate' then
      raise exception 'Invalid birthdate' using errcode='22023'; end if;
  end if;
  if jsonb_typeof(profile_in->'avatar_url') not in ('string','null') then
    raise exception 'Invalid avatar' using errcode='22023'; end if;
  if profile_in->>'avatar_url' is not null then
    avatar_parts:=regexp_match(profile_in->>'avatar_url','^https://([a-z0-9]([a-z0-9.-]*[a-z0-9])?)(:([0-9]{1,5}))?([/?#][^[:space:]]*)?$','i');
    if avatar_parts is null or substring(avatar_parts[1] from '[^.]+$') !~* '^[a-z]([a-z0-9-]*[a-z0-9])?$' or char_length(profile_in->>'avatar_url')>2048 then
      raise exception 'Invalid avatar' using errcode='22023';
    end if;
    if avatar_parts[4] is not null and avatar_parts[4]::integer>65535 then
      raise exception 'Invalid avatar port' using errcode='22023';
    end if;
  end if;
  if jsonb_typeof(profile_in->'interests')<>'array' or jsonb_typeof(profile_in->'availability')<>'array' then
    raise exception 'Invalid profile lists' using errcode='22023'; end if;
  if jsonb_array_length(profile_in->'interests')>30 or jsonb_array_length(profile_in->'availability')>56 then
    raise exception 'Profile lists too long' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(profile_in->'interests') loop
    if jsonb_typeof(item)<>'string' then raise exception 'Invalid interest' using errcode='22023'; end if;
    label_in:=regexp_replace(item #>> '{}','^\s+|\s+$','','g');
    if char_length(label_in) not between 1 and 120 or label_in=any(labels) then
      raise exception 'Invalid or duplicate interest' using errcode='22023'; end if;
    labels:=array_append(labels,label_in);
  end loop;
  for item in select value from jsonb_array_elements(profile_in->'availability') loop
    if jsonb_typeof(item)<>'object' then raise exception 'Invalid window' using errcode='22023'; end if;
    if (select count(*) from jsonb_object_keys(item))<>3 or not item ?& array['dow','start_time','end_time'] then
      raise exception 'Invalid window fields' using errcode='22023'; end if;
    if jsonb_typeof(item->'dow')<>'number' or (item->>'dow')::numeric not between 0 and 6 or trunc((item->>'dow')::numeric)<>(item->>'dow')::numeric then
      raise exception 'Invalid window day' using errcode='22023'; end if;
    if jsonb_typeof(item->'start_time')<>'string' or jsonb_typeof(item->'end_time')<>'string' then
      raise exception 'Invalid window time' using errcode='22023'; end if;
    if (item->>'start_time') !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]|24:00:00)$' or (item->>'end_time') !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]|24:00:00)$' then
      raise exception 'Invalid window time' using errcode='22023'; end if;
    if (item->>'start_time')::time >= (item->>'end_time')::time then
      raise exception 'Invalid window ordering' using errcode='22023'; end if;
  end loop;
  if exists (
    select 1 from jsonb_array_elements(profile_in->'availability') with ordinality a(value,n)
    join jsonb_array_elements(profile_in->'availability') with ordinality b(value,n)
    on a.n<b.n and (a.value->>'dow')::numeric=(b.value->>'dow')::numeric
    where (a.value->>'start_time')::time < (b.value->>'end_time')::time
      and (b.value->>'start_time')::time < (a.value->>'end_time')::time
  ) then raise exception 'Overlapping windows' using errcode='22023'; end if;

  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Profile writes require READ COMMITTED isolation' using errcode='25001'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('profile-username-namespace',0));
  -- Same-user RPC writers serialize. No user-supplied actor/lock key.
  perform pg_advisory_xact_lock(hashtextextended('matchmaking-profile:' || actor::text,0));
  -- Check the effective username, not a stale username supplied by an old client.
  select username into canonical_username from public.account_profiles where id=actor;
  if found then username_in := canonical_username; end if;
  if exists(select 1 from public.account_profiles where username=username_in and id<>actor) then
    raise exception 'Username already exists' using errcode='23505'; end if;
  insert into public.profiles(id,username,display_name,bio,birthdate,location_city,avatar_url)
    values(actor,username_in,name_in,profile_in->>'bio',date_in,city_in,profile_in->>'avatar_url')
    on conflict(id) do update set username=excluded.username,display_name=excluded.display_name,
      bio=excluded.bio,birthdate=excluded.birthdate,location_city=excluded.location_city,
      avatar_url=excluded.avatar_url;
  delete from public.user_interests where profile_id=actor and not (text=any(labels));
  -- Filter BEFORE INSERT: ON CONFLICT alone would still fire BEFORE triggers.
  -- Legacy trigger helpers resolve public names. Fail closed if the schema
  -- permits browser roles to create shadow functions.
  if has_schema_privilege('authenticated','public','CREATE') or has_schema_privilege('anon','public','CREATE') then
    raise exception 'Unsafe trigger schema privileges' using errcode='42501';
  end if;
  perform set_config('search_path','pg_catalog, public',true);
  insert into public.user_interests(profile_id,text)
    select actor,label from unnest(labels) label
    where not exists(select 1 from public.user_interests i where i.profile_id=actor and i.text=label);
  perform set_config('search_path','',true);
  delete from public.availability where profile_id=actor;
  insert into public.availability(profile_id,dow,start_time,end_time)
    select actor,(value->>'dow')::numeric::integer,(value->>'start_time')::time,(value->>'end_time')::time
    from jsonb_array_elements(profile_in->'availability');
  return public.get_matchmaking_profile();
end;
$$;
-- CREATE OR REPLACE preserves the existing legacy RPC owner and ACL.
commit;
