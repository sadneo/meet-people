-- Derive clear Dating targets; require explicit clarification only when unclear.
-- Does not opt anyone into Dating, change identity labels, or overwrite choices.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
do $$ begin
 if to_regprocedure('dating_private.rules_pair(uuid,uuid)') is null
 or to_regprocedure('public.valid_dating_profile(jsonb)') is null then
  raise exception 'Reviewed Dating rules prerequisites missing' using errcode='22023';
 end if;
end $$;

create or replace function public.dating_clear_targets(p jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select case
  when (coalesce(p->>'gender','') collate "C") not in ('Man','Woman') then null
  when (p->>'sexuality' collate "C") in ('Straight','Heterosexual') then
   case when (p->>'gender' collate "C")='Man' then '["Woman"]'::jsonb else '["Man"]'::jsonb end
  when (p->>'sexuality' collate "C") in ('Gay','Lesbian','Homosexual') then jsonb_build_array(p->>'gender')
  when (p->>'sexuality' collate "C") in ('Bisexual','Pansexual') then '"all"'::jsonb
  else null end;
$$;
create or replace function public.dating_targets(p jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select case when coalesce(p->>'gender','')='' or coalesce(p->>'sexuality','')='' then null
 else coalesce(public.dating_clear_targets(p),nullif(p->'clarifiedTargets','[]'::jsonb)) end;
$$;
create or replace function public.dating_reciprocal_targets(a jsonb,b jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(a->>'gender'<>'' and b->>'gender'<>''
  and (public.dating_targets(a)='"all"'::jsonb or public.dating_targets(a) ? (b->>'gender'))
  and (public.dating_targets(b)='"all"'::jsonb or public.dating_targets(b) ? (a->>'gender')),false);
$$;

-- Retain legacy arrays for compatibility, but clear identities always derive their
-- targets. No stored clarification can override a straight/gay/bi/pan policy.
create or replace function public.valid_dating_profile(p jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare k text; v jsonb; seen text[] := '{}'; label_in text;
begin
 if jsonb_typeof(p) is distinct from 'object' then return false; end if;
 if (select count(*) from jsonb_object_keys(p))<>8 or not p ?& array['gender','sexuality','intent','style','heightInches','visibility','clarifiedTargets','enabled'] then return false; end if;
 foreach k in array array['gender','sexuality','intent','style'] loop
  if jsonb_typeof(p->k) is distinct from 'string' then return false; end if;
  label_in:=p->>k;
  if char_length(label_in)>120 or (label_in<>'' and public.profile_language_key(label_in)='') then return false; end if;
 end loop;
 if (p->>'intent' collate "C") not in ('','Long-term relationship','Long-term, open to short','Short-term, open to long','Something casual','Still figuring it out')
  or (p->>'style' collate "C") not in ('','Monogamy','Non-monogamy','Exploring my relationship style') then return false; end if;
 if jsonb_typeof(p->'heightInches') is distinct from 'null' then
  if jsonb_typeof(p->'heightInches') is distinct from 'number' then return false; end if;
  if (p->>'heightInches')::numeric not between 24 and 107 or trunc((p->>'heightInches')::numeric)<>(p->>'heightInches')::numeric then return false; end if;
 end if;
 v:=p->'visibility';
 if jsonb_typeof(v) is distinct from 'object' then return false; end if;
 if (select count(*) from jsonb_object_keys(v))<>3 or not v ?& array['gender','sexuality','height']
  or exists(select 1 from jsonb_each(v) e where jsonb_typeof(e.value) is distinct from 'boolean') then return false; end if;
 if jsonb_typeof(p->'enabled') is distinct from 'boolean' or jsonb_typeof(p->'clarifiedTargets') is distinct from 'array' then return false; end if;
 if jsonb_array_length(p->'clarifiedTargets')>4 then return false; end if;
 for v in select value from jsonb_array_elements(p->'clarifiedTargets') loop
  if jsonb_typeof(v) is distinct from 'string' then return false; end if;
  label_in:=v #>> '{}';
  if char_length(label_in)>120 or public.profile_language_key(label_in)='' or (label_in collate "C")=any(seen) then return false; end if;
  seen:=array_append(seen,label_in);
 end loop;
 if cardinality(seen)>0 and (p->>'gender'='' or p->>'sexuality'='') then return false; end if;
 return not (p->>'enabled')::boolean or public.dating_complete(p);
end $$;

create or replace function dating_private.rules_pair(actor uuid,target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(exists(
 select 1 from public.dating_owner_aggregates mine
 join public.dating_search_location_refs m on m.user_id=mine.user_id and m.id=(mine.search->'searchArea'->>'resolvedLocationRef')::uuid
 join public.dating_owner_aggregates other on other.user_id=target
 join public.dating_search_location_refs o on o.user_id=other.user_id and o.id=(other.search->'searchArea'->>'resolvedLocationRef')::uuid
 join public.profiles mp on mp.id=actor join public.profiles op on op.id=target
 join auth.users mu on mu.id=actor join auth.users ou on ou.id=target
 where mine.user_id=actor and actor<>target
 and mine.profile->>'enabled'='true' and other.profile->>'enabled'='true'
 and dating_private.eligible(actor) and dating_private.eligible(target)
 and (mu.banned_until is null or mu.banned_until<=statement_timestamp())
 and (ou.banned_until is null or ou.banned_until<=statement_timestamp())
 and not coalesce(mu.is_anonymous,false) and not coalesce(ou.is_anonymous,false)
 and mu.deleted_at is null and ou.deleted_at is null
 and public.safety_pair_allowed(actor,target)
 and public.dating_reciprocal_targets(mine.profile,other.profile)
 and extract(year from age(public.dating_campus_date(statement_timestamp()),op.birthdate)) between (mine.search->>'ageMin')::integer and (mine.search->>'ageMax')::integer
 and extract(year from age(public.dating_campus_date(statement_timestamp()),mp.birthdate)) between (other.search->>'ageMin')::integer and (other.search->>'ageMax')::integer
 and extensions.st_dwithin(
  extensions.st_setsrid(extensions.st_makepoint(m.longitude,m.latitude),4326)::extensions.geography,
  extensions.st_setsrid(extensions.st_makepoint(o.longitude,o.latitude),4326)::extensions.geography,
  least((mine.search->>'radiusMiles')::integer,(other.search->>'radiusMiles')::integer)*1609.344)
 ),false);
$$;
revoke all on function public.dating_clear_targets(jsonb),public.dating_targets(jsonb),public.dating_reciprocal_targets(jsonb,jsonb),public.valid_dating_profile(jsonb),dating_private.rules_pair(uuid,uuid) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
