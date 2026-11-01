-- REVIEW CANDIDATE ONLY; not installed/executed by the agent. Parent owns ACL,
-- historical prerequisite and network-none disposable concurrency acceptance.
-- Requires the reviewed Friends validator + pinned label helper, NOT its tables,
-- refs, preferences or matcher. Does not replace any legacy Dating RPC or policy.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
do $$ begin
  if current_setting('server_encoding') <> 'UTF8'
    or to_regprocedure('public.valid_friends_search_preferences(jsonb)') is null
    or to_regprocedure('public.profile_language_key(text)') is null
    or to_regclass('public.profiles') is null then
    raise exception 'Dating prerequisites missing' using errcode='22023'; end if;
  if not has_table_privilege(current_user,'public.profiles','SELECT')
    or (not exists(select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls))
      and not exists(select 1 from pg_class where oid='public.profiles'::regclass and pg_get_userbyid(relowner)=current_user and not relforcerowsecurity)) then
    raise exception 'Reviewed canonical DOB read owner required' using errcode='42501'; end if;
end $$;

create function public.dating_default_profile() returns jsonb language sql immutable set search_path='' as $$
  select '{"gender":"","sexuality":"","intent":"","style":"","heightInches":null,"visibility":{"gender":false,"sexuality":false,"height":false},"clarifiedTargets":[],"enabled":false}'::jsonb;
$$;
create function public.dating_clear_targets(p jsonb) returns jsonb language sql immutable set search_path='' as $$
  select case
    when (p->>'sexuality' collate "C")='Straight' and (p->>'gender' collate "C")='Man' then '["Woman"]'::jsonb
    when (p->>'sexuality' collate "C")='Straight' and (p->>'gender' collate "C")='Woman' then '["Man"]'::jsonb
    when (p->>'sexuality' collate "C")='Gay' and (p->>'gender' collate "C") in ('Man','Woman') then jsonb_build_array(p->>'gender')
    when (p->>'sexuality' collate "C")='Lesbian' and (p->>'gender' collate "C")='Woman' then '["Woman"]'::jsonb
    else null end;
$$;
create function public.dating_targets(p jsonb) returns jsonb language sql immutable set search_path='' as $$
  select case when p->>'gender'='' or p->>'sexuality'='' then null else
    coalesce(public.dating_clear_targets(p),nullif(p->'clarifiedTargets','[]'::jsonb)) end;
$$;
create function public.dating_complete(p jsonb) returns boolean language sql immutable set search_path='' as $$
  select coalesce(p->>'gender'<>'' and p->>'sexuality'<>'' and p->>'intent'<>'' and p->>'style'<>'' and public.dating_targets(p) is not null,false);
$$;
-- Target compatibility only; not consent, eligibility, safety or live admission.
create function public.dating_reciprocal_targets(a jsonb, b jsonb) returns boolean language sql immutable set search_path='' as $$
  select coalesce((public.dating_targets(a) ? (b->>'gender')) and (public.dating_targets(b) ? (a->>'gender')),false);
$$;
create function public.valid_dating_profile(p jsonb) returns boolean language plpgsql immutable set search_path='' as $$
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
  if cardinality(seen)>0 and (p->>'gender'='' or p->>'sexuality'='' or public.dating_clear_targets(p) is not null) then return false; end if;
  return not (p->>'enabled')::boolean or public.dating_complete(p);
end $$;
create function public.valid_dating_search(s jsonb) returns boolean language plpgsql immutable set search_path='' as $$
begin
  if s='null'::jsonb then return true; end if;
  if jsonb_typeof(s) is distinct from 'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(s))<>4 or not s ?& array['ageMin','ageMax','radiusMiles','searchArea'] then return false; end if;
  return public.valid_friends_search_preferences(s || '{"goals":[]}'::jsonb);
end $$;
-- STABLE rather than IMMUTABLE: named-zone interpretation uses timezone data.
create function public.dating_campus_date(instant_in timestamptz) returns date language sql stable set search_path='' as $$
  select (instant_in at time zone 'America/New_York')::date;
$$;
create function public.dating_adult_on(dob date, as_of date) returns boolean language plpgsql immutable set search_path='' as $$
begin
  if dob is null or as_of is null or not isfinite(dob) or not isfinite(as_of) then return false; end if;
  if dob not between date '0001-01-01' and date '9999-12-31' or as_of not between date '0001-01-01' and date '9999-12-31' or dob>as_of then return false; end if;
  return extract(year from as_of)-extract(year from dob)
    - case when to_char(as_of,'MMDD') < to_char(dob,'MMDD') then 1 else 0 end >= 18;
end $$;

-- No issuer, browser writes, automatic resolution or fictional coordinates.
-- A later trusted resolver must bind the exact current owner/source/area label.
create table public.dating_search_location_refs (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check ((source collate "C") in ('home','temporary')),
  area_label text not null check (char_length(area_label)<=120 and public.profile_language_key(area_label)<>''),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180), usable boolean not null
);
alter table public.dating_search_location_refs enable row level security;
revoke all on public.dating_search_location_refs from public, anon, authenticated;
create table public.dating_owner_aggregates (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile_revision bigint not null check (profile_revision between 1 and 9007199254740991),
  search_revision bigint not null check (search_revision between 1 and 9007199254740991),
  profile jsonb not null check (public.valid_dating_profile(profile)),
  search jsonb not null check (public.valid_dating_search(search)),
  check (not (profile->>'enabled')::boolean or search->'searchArea'->>'resolvedLocationRef' is not null)
);
alter table public.dating_owner_aggregates enable row level security;
revoke all on public.dating_owner_aggregates from public, anon, authenticated;

create function public.dating_location_resolved(actor uuid, s jsonb, home text) returns boolean language sql stable set search_path='' as $$
  select exists(select 1 from public.dating_search_location_refs r where r.id=(s->'searchArea'->>'resolvedLocationRef')::uuid
    and r.user_id=actor and r.usable and (r.source collate "C")=(s->'searchArea'->>'source' collate "C")
    and (r.area_label collate "C")=(case when s->'searchArea'->>'source'='home' then home else s->'searchArea'->>'areaLabel' end collate "C"));
$$;
create function public.get_dating_preferences() returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); as_of date:=public.dating_campus_date(transaction_timestamp()); result jsonb;
begin
  if actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
  -- One statement snapshot for stored data, canonical DOB/home and trusted ref.
  select jsonb_build_object('profileRevision',coalesce(d.profile_revision,0),'searchRevision',coalesce(d.search_revision,0),
    'profile',v.p,'search',v.s,'eligibility',jsonb_build_object('asOf',to_char(as_of,'YYYY-MM-DD'),'adult',v.adult,'locationResolved',v.resolved),
    'effectiveEnabled',(v.p->>'enabled')::boolean and public.dating_complete(v.p) and v.adult and v.resolved) into result
  from (values(actor)) me(id)
  left join public.dating_owner_aggregates d on d.user_id=me.id
  left join public.profiles p on p.id=me.id
  cross join lateral(select coalesce(d.profile,public.dating_default_profile()) p,coalesce(d.search,'null'::jsonb) s,
    public.dating_adult_on(p.birthdate,as_of) adult,public.dating_location_resolved(actor,d.search,p.location_city) resolved) v;
  return result;
end $$;

create function public.save_dating_preferences(aggregate_in jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); ep bigint; es bigint; k text; n numeric; p jsonb; s jsonb;
  previous public.dating_owner_aggregates%rowtype; dob date; home text;
  ref public.dating_search_location_refs%rowtype; as_of date:=public.dating_campus_date(transaction_timestamp());
begin
  if actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if current_setting('transaction_isolation')<>'read committed' then raise exception 'READ COMMITTED required' using errcode='25001'; end if;
  if jsonb_typeof(aggregate_in) is distinct from 'object' then raise exception 'Invalid Dating aggregate' using errcode='22023'; end if;
  if (select count(*) from jsonb_object_keys(aggregate_in))<>4 or not aggregate_in ?& array['expectedProfileRevision','expectedSearchRevision','profile','search'] then raise exception 'Invalid Dating aggregate' using errcode='22023'; end if;
  foreach k in array array['expectedProfileRevision','expectedSearchRevision'] loop
    if jsonb_typeof(aggregate_in->k) is distinct from 'number' then raise exception 'Invalid revision' using errcode='22023'; end if;
    n:=(aggregate_in->>k)::numeric;
    if n<0 or n>=9007199254740991 or trunc(n)<>n then raise exception 'Invalid revision' using errcode='22023'; end if;
  end loop;
  ep:=(aggregate_in->>'expectedProfileRevision')::numeric::bigint; es:=(aggregate_in->>'expectedSearchRevision')::numeric::bigint;
  p:=aggregate_in->'profile'; s:=aggregate_in->'search';
  if not public.valid_dating_profile(p) or not public.valid_dating_search(s) then raise exception 'Invalid Dating values' using errcode='22023'; end if;
  -- Lock order: canonical profile (DOB/home), selected trusted ref, aggregate.
  -- No profile/home/DOB updates; later issuers must use the same order.
  select u.birthdate,u.location_city into dob,home from public.profiles u where u.id=actor for share;
  if s->'searchArea'->>'resolvedLocationRef' is not null then
    select r.* into ref from public.dating_search_location_refs r where r.id=(s->'searchArea'->>'resolvedLocationRef')::uuid and r.user_id=actor for share;
    if not found or not public.dating_location_resolved(actor,s,home) then raise exception 'Invalid Dating location reference' using errcode='22023'; end if;
  end if;
  if (p->>'enabled')::boolean and (not public.dating_adult_on(dob,as_of) or s->'searchArea'->>'resolvedLocationRef' is null) then raise exception 'Dating eligibility incomplete' using errcode='22023'; end if;
  select d.* into previous from public.dating_owner_aggregates d where d.user_id=actor for update;
  if coalesce(previous.profile_revision,0)<>ep or coalesce(previous.search_revision,0)<>es then raise exception 'Dating aggregate revision conflict' using errcode='DA409'; end if;
  -- A missing aggregate or two unset labels has no prior identity/targets to
  -- invalidate. Any partial prior identity keeps the existing edit guard.
  if previous.user_id is not null
    and ((previous.profile->>'gender' collate "C")<>'' or (previous.profile->>'sexuality' collate "C")<>'')
    and ((coalesce(previous.profile,public.dating_default_profile())->>'gender' collate "C") is distinct from (p->>'gender' collate "C")
      or (coalesce(previous.profile,public.dating_default_profile())->>'sexuality' collate "C") is distinct from (p->>'sexuality' collate "C")) and p->'clarifiedTargets'<>'[]'::jsonb then
    raise exception 'Identity edit must clear clarification; save identity draft first' using errcode='22023'; end if;
  if previous.user_id is null then
    insert into public.dating_owner_aggregates(user_id,profile_revision,search_revision,profile,search) values(actor,1,1,p,s) on conflict(user_id) do nothing;
    if not found then raise exception 'Dating aggregate revision conflict' using errcode='DA409'; end if;
  else
    update public.dating_owner_aggregates set profile_revision=profile_revision+1,search_revision=search_revision+1,profile=p,search=s where user_id=actor;
  end if;
  return public.get_dating_preferences();
end $$;

-- Explicit helper/RPC ACLs; no anonymous execute or direct browser table access.
revoke all on function public.dating_default_profile(),public.dating_clear_targets(jsonb),public.dating_targets(jsonb),public.dating_complete(jsonb),public.dating_reciprocal_targets(jsonb,jsonb),public.valid_dating_profile(jsonb),public.valid_dating_search(jsonb),public.dating_campus_date(timestamptz),public.dating_adult_on(date,date),public.dating_location_resolved(uuid,jsonb,text),public.get_dating_preferences(),public.save_dating_preferences(jsonb) from public, anon, authenticated;
grant execute on function public.get_dating_preferences(),public.save_dating_preferences(jsonb) to authenticated;
commit;
