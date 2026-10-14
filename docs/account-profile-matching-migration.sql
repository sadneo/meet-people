-- REVIEW CANDIDATE ONLY: never installed by the agent.
-- Parent prerequisite: existing profiles table and legacy matchmaking-profile RPCs.
-- No replacement matcher, profile deletion, Auth signup trigger or provider calls.
begin;

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
 -- Serialize account writers; lock the legacy row before the canonical row to
 -- align with legacy profile writers. Parent must also run two-session probes.
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
commit;
