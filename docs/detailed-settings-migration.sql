-- REVIEW CANDIDATE ONLY. Authored, NOT applied or SQL-executed by the agent.
-- Requires Auth/roles and existing account_settings. Additive independent storage;
-- no replacement account writer, legacy settings update, queue or delivery action.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
do $$ begin
  if not exists(select 1 from pg_class where oid=to_regclass('public.account_settings') and relkind in ('r','p')) then
    raise exception 'Legacy account_settings prerequisite missing' using errcode='22023';
  end if;
  if not has_table_privilege(current_user,'public.account_settings','SELECT')
    or (not exists(select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls))
      and not exists(select 1 from pg_class where oid='public.account_settings'::regclass and pg_get_userbyid(relowner)=current_user and not relforcerowsecurity)) then
    raise exception 'Reviewed persisted-master read owner required' using errcode='42501';
  end if;
end $$;

create function public.valid_detailed_settings(value_in jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(value_in) is distinct from 'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(value_in)) <> 5
    or not value_in ?& array['messages','plans','matches','friendsDiscovery','datingDiscovery'] then return false; end if;
  return not exists(select 1 from jsonb_each(value_in) v where jsonb_typeof(v.value) is distinct from 'boolean');
end $$;
revoke all on function public.valid_detailed_settings(jsonb) from public, anon, authenticated;

-- Missing/malformed actual rows stay UNKNOWN. Never call get_account here: its
-- historical/reconciled fallback is default-on, not persisted new-mode consent.
create function public.detailed_settings_masters(value_in jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(value_in) is distinct from 'object' then return null; end if;
  if (select count(*) from jsonb_object_keys(value_in)) <> 4
    or not value_in ?& array['notifications','availability','discoverable','location'] then return null; end if;
  if exists(select 1 from jsonb_each(value_in) v where jsonb_typeof(v.value) is distinct from 'boolean') then return null; end if;
  return jsonb_build_object('notifications',value_in->'notifications','discoverable',value_in->'discoverable');
end $$;
revoke all on function public.detailed_settings_masters(jsonb) from public, anon, authenticated;

create function public.effective_detailed_settings(choices_in jsonb, masters_in jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'messages',coalesce((masters_in->>'notifications')::boolean,false) and (choices_in->>'messages')::boolean,
    'plans',coalesce((masters_in->>'notifications')::boolean,false) and (choices_in->>'plans')::boolean,
    'matches',coalesce((masters_in->>'notifications')::boolean,false) and (choices_in->>'matches')::boolean,
    'friendsDiscovery',coalesce((masters_in->>'discoverable')::boolean,false) and (choices_in->>'friendsDiscovery')::boolean,
    'datingDiscovery',coalesce((masters_in->>'discoverable')::boolean,false) and (choices_in->>'datingDiscovery')::boolean);
$$;
revoke all on function public.effective_detailed_settings(jsonb,jsonb) from public, anon, authenticated;

create table public.detailed_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null check (revision between 1 and 9007199254740991),
  settings jsonb not null check (public.valid_detailed_settings(settings))
);
alter table public.detailed_settings enable row level security;
revoke all on public.detailed_settings from public, anon, authenticated;
-- No browser table/column grants or policies. CREATE collisions abort rather
-- than adopting unknown existing objects/owners. Parent reviews inherited ACLs.

create function public.get_detailed_settings()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); result jsonb;
begin
  if actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
  -- Both sources and the computed policy use one SQL statement snapshot. This
  -- adds no legacy writer/advisory/row locks and cannot resume downtime.
  select jsonb_build_object('revision',coalesce(d.revision,0),'settings',v.choices,
    'masters',v.masters,'effective',public.effective_detailed_settings(v.choices,v.masters)) into result
  from (values(actor)) me(id)
  left join public.detailed_settings d on d.user_id=me.id
  left join public.account_settings a on a.user_id=me.id
  cross join lateral (select
    coalesce(d.settings,'{"messages":false,"plans":false,"matches":false,"friendsDiscovery":false,"datingDiscovery":false}'::jsonb) as choices,
    public.detailed_settings_masters(a.settings) as masters) v;
  return result;
end $$;
revoke all on function public.get_detailed_settings() from public, anon, authenticated;
grant execute on function public.get_detailed_settings() to authenticated;

create function public.save_detailed_settings(settings_in jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); expected_revision bigint;
begin
  if actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Detailed settings writes require READ COMMITTED' using errcode='25001'; end if;
  if jsonb_typeof(settings_in) is distinct from 'object' then raise exception 'Invalid detailed settings' using errcode='22023'; end if;
  if (select count(*) from jsonb_object_keys(settings_in)) <> 2 or not settings_in ?& array['expectedRevision','settings']
    or jsonb_typeof(settings_in->'expectedRevision') is distinct from 'number'
    or not public.valid_detailed_settings(settings_in->'settings') then
    raise exception 'Invalid detailed settings' using errcode='22023'; end if;
  if (settings_in->>'expectedRevision')::numeric < 0 or (settings_in->>'expectedRevision')::numeric >= 9007199254740991
    or trunc((settings_in->>'expectedRevision')::numeric) <> (settings_in->>'expectedRevision')::numeric then
    raise exception 'Invalid or exhausted revision' using errcode='22023'; end if;
  expected_revision := (settings_in->>'expectedRevision')::numeric::bigint;
  if expected_revision=0 then
    insert into public.detailed_settings(user_id,revision,settings) values(actor,1,settings_in->'settings') on conflict(user_id) do nothing;
  else
    update public.detailed_settings set settings=settings_in->'settings',revision=revision+1
      where user_id=actor and revision = expected_revision;
  end if;
  if not found then raise exception 'Detailed settings revision conflict' using errcode='DS409'; end if;
  return public.get_detailed_settings();
end $$;
revoke all on function public.save_detailed_settings(jsonb) from public, anon, authenticated;
grant execute on function public.save_detailed_settings(jsonb) to authenticated;
commit;
