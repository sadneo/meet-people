-- Usernames are compared case-insensitively. New and changed usernames are
-- trimmed, lowercased and may not contain whitespace. Existing rows are never
-- rewritten: if case-insensitive duplicates already exist this migration aborts
-- and lists them so an operator can resolve them deliberately first
-- (see docs/username-duplicate-cleanup.sql).
do $$
declare clashes text;
begin
 select string_agg(format('%s: %s', lowered, names), E'\n' order by lowered) into clashes from (
  select lowered, string_agg(format('%s (%s)', name, id), ', ' order by id) as names
  from (
   select id, username as name, lower(username) as lowered from public.profiles
   union
   select id, username, lower(username) from public.account_profiles
  ) u
  group by lowered having count(distinct id) > 1
 ) d;
 if clashes is not null then
  raise exception E'Case-insensitive duplicate usernames exist; resolve them before applying this migration:\n%', clashes using errcode='23505';
 end if;
end $$;

create unique index account_profiles_username_lower_key on public.account_profiles (lower(username));
create unique index profiles_username_lower_key on public.profiles (lower(username));

-- Wrap the canonical identity writer, keeping its locking and projection.
alter function public.reconciliation_identity_write(jsonb) rename to username_policy_identity_write;
revoke all on function public.username_policy_identity_write(jsonb) from public,anon,authenticated;
create function public.reconciliation_identity_write(profile_in jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); raw text; normal text; current_name text;
begin
 if actor is null then raise exception 'Not authenticated' using errcode='28000'; end if;
 if jsonb_typeof(profile_in) is distinct from 'object' or jsonb_typeof(profile_in->'username') is distinct from 'string' then
  return public.username_policy_identity_write(profile_in);
 end if;
 raw:=btrim(profile_in->>'username'); normal:=lower(raw);
 select username into current_name from public.account_profiles where id=actor;
 if not found then select username into current_name from public.profiles where id=actor; end if;
 -- Existing handles stay as stored until the person actually changes them.
 if current_name is not distinct from raw then
  return public.username_policy_identity_write(profile_in);
 end if;
 if normal='' or normal ~ '[[:space:]]' then raise exception 'Invalid username' using errcode='22023'; end if;
 if exists(select 1 from public.account_profiles where lower(username)=normal and id<>actor)
  or exists(select 1 from public.profiles where lower(username)=normal and id<>actor) then
  raise exception 'Username already exists' using errcode='23505'; end if;
 return public.username_policy_identity_write(profile_in||jsonb_build_object('username',normal));
end $$;
revoke all on function public.reconciliation_identity_write(jsonb) from public,anon,authenticated;
