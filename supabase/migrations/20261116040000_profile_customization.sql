-- Owner-chosen profile presentation: interest display order (first = top
-- interest), per-mode audiences for optional details, and a Garden showcase.
-- Display only: matching scores keep treating interests as an unordered set.
-- A separate resource keeps installed clients' account and details contracts.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create function public.valid_profile_customization(value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare item jsonb; seen text[] := '{}'; label text;
begin
 if jsonb_typeof(value) is distinct from 'object'
  or (select count(*) from jsonb_object_keys(value)) <> 3
  or not value ?& array['interestOrder','audiences','gardenItem'] then return false; end if;
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
revoke all on function public.valid_profile_customization(jsonb) from public,anon,authenticated;

create table public.profile_customization (
 user_id uuid primary key references auth.users(id) on delete cascade,
 revision bigint not null default 0 check (revision between 0 and 9007199254740991),
 customization jsonb not null check (public.valid_profile_customization(customization)),
 updated_at timestamptz not null default now()
);
alter table public.profile_customization enable row level security;
revoke all on public.profile_customization from public,anon,authenticated;

create function public.profile_customization_default() returns jsonb
language sql immutable set search_path='' as $$
 select '{"interestOrder":[],"audiences":{"education":"both","occupation":"both","languages":"both"},"gardenItem":null}'::jsonb
$$;
revoke all on function public.profile_customization_default() from public,anon,authenticated;

-- Everyone has a Pebble; other items must be movable and still owned.
create function public.profile_garden_item_owned(person uuid, item text) returns boolean
language sql stable security definer set search_path='' as $$
 select item = 'pebble' or exists(
  select 1 from garden_private.catalog c join garden_private.wallets w on w.owner = person
  where c.id = item and c.movable and w.owned ? item)
$$;
revoke all on function public.profile_garden_item_owned(uuid,text) from public,anon,authenticated;

create function public.get_profile_customization() returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); result jsonb;
begin
 if actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
 select jsonb_build_object('revision',c.revision,'customization',c.customization) into result
  from public.profile_customization c where c.user_id = actor;
 return coalesce(result, jsonb_build_object('revision',0,'customization',public.profile_customization_default()));
end $$;

create function public.save_profile_customization(customization_in jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); expected bigint; value jsonb;
begin
 if actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if current_setting('transaction_isolation') <> 'read committed' then
  raise exception 'Profile customization writes require READ COMMITTED' using errcode='25001'; end if;
 if jsonb_typeof(customization_in) is distinct from 'object'
  or (select count(*) from jsonb_object_keys(customization_in)) <> 2
  or not customization_in ?& array['expectedRevision','customization']
  or jsonb_typeof(customization_in->'expectedRevision') is distinct from 'number'
  or not public.valid_profile_customization(customization_in->'customization') then
  raise exception 'Invalid profile customization' using errcode='22023'; end if;
 if (customization_in->>'expectedRevision')::numeric < 0
  or (customization_in->>'expectedRevision')::numeric >= 9007199254740991
  or trunc((customization_in->>'expectedRevision')::numeric) <> (customization_in->>'expectedRevision')::numeric then
  raise exception 'Invalid or exhausted revision' using errcode='22023'; end if;
 expected := (customization_in->>'expectedRevision')::numeric::bigint;
 value := customization_in->'customization';
 -- Order only interests that are saved on the profile right now.
 perform 1 from public.profiles p where p.id = actor for share;
 if exists(select 1 from jsonb_array_elements_text(value->'interestOrder') o
  where not exists(select 1 from public.user_interests i where i.profile_id = actor and i.text = o)) then
  raise exception 'Order only saved interests' using errcode='22023'; end if;
 if value->>'gardenItem' is not null and not public.profile_garden_item_owned(actor, value->>'gardenItem') then
  raise exception 'Choose a Garden item you own' using errcode='22023'; end if;
 insert into public.profile_customization(user_id,revision,customization)
  values(actor,0,public.profile_customization_default()) on conflict(user_id) do nothing;
 update public.profile_customization set customization = value, revision = revision + 1, updated_at = now()
  where user_id = actor and revision = expected;
 if not found then raise exception 'Profile customization revision conflict' using errcode='PC409'; end if;
 return public.get_profile_customization();
end $$;

-- What another person sees: same audience as profile photos. Stale choices
-- (a removed interest or an item no longer owned) are left out, not shown.
create function public.get_profile_showcase(owner_in uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid := safety_private.actor(); value jsonb;
begin
 if owner_in is null then raise exception 'Invalid profile owner' using errcode='22023'; end if;
 perform photo_private.lock_audience(actor, owner_in);
 if not photo_private.audience(actor, owner_in) then raise exception 'Profile unavailable' using errcode='PC404'; end if;
 select c.customization into value from public.profile_customization c where c.user_id = owner_in;
 value := coalesce(value, public.profile_customization_default());
 return jsonb_build_object(
  'interestOrder', coalesce((select jsonb_agg(o.label order by o.position)
    from jsonb_array_elements_text(value->'interestOrder') with ordinality o(label, position)
    where exists(select 1 from public.user_interests i where i.profile_id = owner_in and i.text = o.label)), '[]'),
  'gardenItem', case when value->>'gardenItem' is not null and public.profile_garden_item_owned(owner_in, value->>'gardenItem')
    then value->'gardenItem' else 'null'::jsonb end);
end $$;

revoke all on function public.get_profile_customization(), public.save_profile_customization(jsonb), public.get_profile_showcase(uuid) from public,anon,authenticated;
grant execute on function public.get_profile_customization(), public.save_profile_customization(jsonb), public.get_profile_showcase(uuid) to authenticated;

-- Per-mode audiences for optional details. Build the mode-aware projection
-- from the reviewed one, then point Friends and Dating projections at it.
do $$
declare definition text;
begin
 definition := pg_catalog.pg_get_functiondef('matching_private.discovery_details(uuid,uuid)'::regprocedure);
 if position('matching_private.discovery_details(viewer uuid, target uuid)' in definition) = 0
  or position('declare facts jsonb;' in definition) = 0
  or position('for share;' in definition) = 0
  or position($q$facts->'visibility'->>'education'='true'$q$ in definition) = 0
  or position($q$facts->'visibility'->>'occupation'='true'$q$ in definition) = 0
  or position($q$facts->'visibility'->>'languages'='true'$q$ in definition) = 0 then
  raise exception 'Unreviewed discovery details body' using errcode='22023';
 end if;
 definition := replace(definition, 'CREATE OR REPLACE FUNCTION matching_private.discovery_details(viewer uuid, target uuid)', 'CREATE FUNCTION matching_private.discovery_details(viewer uuid, target uuid, mode_in text)');
 definition := replace(definition, 'declare facts jsonb;', 'declare audiences jsonb; facts jsonb;');
 definition := regexp_replace(definition, 'for share;', $q$for share;
 select c.customization->'audiences' into audiences from public.profile_customization c where c.user_id=target;$q$);
 definition := replace(definition, $q$facts->'visibility'->>'education'='true'$q$, $q$facts->'visibility'->>'education'='true' and coalesce(audiences->>'education','both') in ('both',mode_in)$q$);
 definition := replace(definition, $q$facts->'visibility'->>'occupation'='true'$q$, $q$facts->'visibility'->>'occupation'='true' and coalesce(audiences->>'occupation','both') in ('both',mode_in)$q$);
 definition := replace(definition, $q$facts->'visibility'->>'languages'='true'$q$, $q$facts->'visibility'->>'languages'='true' and coalesce(audiences->>'languages','both') in ('both',mode_in)$q$);
 if position('CREATE FUNCTION matching_private.discovery_details(viewer uuid, target uuid, mode_in text)' in definition) = 0 then
  raise exception 'Discovery details header changed' using errcode='22023';
 end if;
 execute definition;

 definition := pg_catalog.pg_get_functiondef('public.project_dating_candidate(uuid)'::regprocedure);
 if position('matching_private.discovery_details(actor,target_in)' in definition) = 0 then raise exception 'Unreviewed Dating projection' using errcode='22023'; end if;
 execute replace(definition, 'matching_private.discovery_details(actor,target_in)', $q$matching_private.discovery_details(actor,target_in,'dating')$q$);

 definition := pg_catalog.pg_get_functiondef('public.project_friends_candidates(jsonb)'::regprocedure);
 if position('matching_private.discovery_details(actor,target)' in definition) = 0 then raise exception 'Unreviewed Friends projection' using errcode='22023'; end if;
 execute replace(definition, 'matching_private.discovery_details(actor,target)', $q$matching_private.discovery_details(actor,target,'friends')$q$);
end $$;
revoke all on function matching_private.discovery_details(uuid,uuid,text) from public,anon,authenticated;

-- Any unreviewed caller of the original form only sees details shared with both.
create or replace function matching_private.discovery_details(viewer uuid, target uuid) returns jsonb
language sql volatile security definer set search_path='' as $$
 select matching_private.discovery_details(viewer, target, 'both')
$$;
revoke all on function matching_private.discovery_details(uuid,uuid) from public,anon,authenticated;

notify pgrst,'reload schema';
commit;
