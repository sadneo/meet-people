-- Open Pebble after basic account setup and enforce feature setup at matching entry points.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';

create or replace function public.reconciliation_chapters(p jsonb, prefs jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare identity jsonb; birth date;
begin
 if p is null or p='null'::jsonb then return '[]'; end if;
 identity:=jsonb_build_object('username',p->'username','display_name',p->'display_name','bio',p->'bio','avatar_url',p->'avatar_url');
 if not public.valid_account_identity(identity) then return '[]'; end if;
 if coalesce(p->>'birthdate','') ~ '^\d{4}-\d{2}-\d{2}$' then
  begin
   birth:=(p->>'birthdate')::date;
   if to_char(birth,'YYYY-MM-DD')=p->>'birthdate' then return '[0,1,2,3]'; end if;
  exception when datetime_field_overflow or invalid_datetime_format then null;
  end;
 end if;
 -- Preserve partial progress reported to old clients before a birthday is saved.
 if not public.valid_profile_interests(p->'interests',true) then return '[0]'; end if;
 if jsonb_typeof(prefs->'intents') is distinct from 'array' then return '[0,1]'; end if;
 if jsonb_array_length(prefs->'intents')=0 then return '[0,1]'; end if;
 return '[0,1,2]';
end $$;

create or replace function public.save_account(account_in jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); p jsonb:=account_in->'profile'; prefs jsonb:=account_in->'preferences';
 settings_in jsonb:=account_in->'settings'; chapters jsonb:=account_in->'completed'; n int; old_n int; completed_now jsonb; initial_zone text:=account_in->>'initialTimeZone';
begin
 if actor is null then raise exception 'Not authenticated' using errcode='28000'; end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'READ COMMITTED required' using errcode='25001'; end if;
 -- Always namespace BEFORE actor/row locks, including compatibility RPCs.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('profile-username-namespace',0));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('account:'||actor::text,0));
 if jsonb_typeof(account_in) is distinct from 'object' then raise exception 'Invalid account' using errcode='22023'; end if;
 if (account_in - array['profile','preferences','settings','completed','initialTimeZone']) <> '{}'::jsonb or not account_in ?& array['profile','preferences','settings','completed']
  or (account_in ? 'initialTimeZone' and jsonb_typeof(account_in->'initialTimeZone') is distinct from 'string') then raise exception 'Invalid account fields' using errcode='22023'; end if;
 if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(prefs) is distinct from 'object' or jsonb_typeof(settings_in) is distinct from 'object' or jsonb_typeof(chapters) is distinct from 'array' then raise exception 'Invalid account document' using errcode='22023'; end if;
 if (select count(*) from jsonb_object_keys(prefs))<>4 or not prefs ?& array['intents','usual','distance','group']
  or jsonb_typeof(prefs->'intents') is distinct from 'array' or jsonb_typeof(prefs->'usual') is distinct from 'array'
  or coalesce(prefs->>'distance','?') not in ('','Nearby','5 miles','10 miles') or coalesce(prefs->>'group','?') not in ('','One-on-one','Small groups','Either') then raise exception 'Invalid preferences' using errcode='22023'; end if;
 if jsonb_array_length(prefs->'intents')>20 or jsonb_array_length(prefs->'usual')>4
  or exists(select from jsonb_array_elements(prefs->'intents') v where jsonb_typeof(v)<>'string' or length(btrim(v #>> '{}')) not between 1 and 120)
  or (select count(*)<>count(distinct btrim(value #>> '{}')) from jsonb_array_elements(prefs->'intents'))
  or exists(select from jsonb_array_elements(prefs->'usual') v where jsonb_typeof(v)<>'string' or v #>> '{}' not in ('Mornings','Afternoons','Evenings','Weekends')) then raise exception 'Invalid preference values' using errcode='22023'; end if;
 if (select count(*) from jsonb_object_keys(settings_in))<>4 or not settings_in ?& array['notifications','availability','discoverable','location']
  or exists(select from jsonb_each(settings_in) v where jsonb_typeof(v.value)<>'boolean') then raise exception 'Invalid settings' using errcode='22023'; end if;
 n:=jsonb_array_length(chapters);
 if n>4 or exists(select from jsonb_array_elements(chapters) with ordinality v(value,i) where value<>to_jsonb(i-1)) then raise exception 'Invalid chapter sequence' using errcode='22023'; end if;
 old_n:=jsonb_array_length(public.get_account()->'completed');
 completed_now:=public.reconciliation_chapters(p,prefs);
 if n>old_n+1 or jsonb_array_length(completed_now)<greatest(n,old_n) then raise exception 'Required profile fields are missing' using errcode='22023'; end if;
 -- Original canonical implementation retains symmetric username reservation and projector.
 perform public.reconciliation_identity_write(jsonb_build_object('username',p->'username','display_name',p->'display_name','bio',p->'bio','avatar_url',p->'avatar_url'));
 -- Original profile implementation validates dates, bounds, labels, windows and overlap.
 -- Any failure rolls back canonical identity AND private settings in this transaction.
 perform public.reconciliation_profile_write(p);
 insert into public.account_settings(user_id,preferences,settings,completed) values(actor,prefs,settings_in,completed_now)
 on conflict(user_id) do update set preferences=excluded.preferences,settings=excluded.settings,completed=excluded.completed,updated_at=now();
 -- Device defaults only apply when finishing the basic profile. Preserve any
 -- schedule already saved, including explicit choices made in another client.
 if old_n<4 and jsonb_array_length(completed_now)=4 and initial_zone is not null
 and char_length(initial_zone)<=100 and (initial_zone='UTC' or position('/' in initial_zone)>0)
 and exists(select from pg_catalog.pg_timezone_names where name=initial_zone) then
  insert into matching_private.scoring_settings(user_id,revision,time_zone,show_availability)
  values(actor,1,initial_zone,false) on conflict(user_id) do nothing;
 end if;
 return public.get_account();
end $$;

-- Preserve prior Friends participation and leave saved privacy choices intact.
alter table public.friends_search_preferences add column setup_started boolean not null default true;
alter table public.friends_search_preferences alter column setup_started set default false;

create or replace function public.save_friends_search_preferences(preferences_in jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); expected_revision bigint; prefs jsonb; area jsonb;
  reference_in uuid; resolved public.friends_search_location_refs%rowtype; home_label text; start_discovery boolean;
begin
  if actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Friends preference writes require READ COMMITTED' using errcode='25001'; end if;
  if jsonb_typeof(preferences_in) is distinct from 'object' then
    raise exception 'Invalid Friends preferences' using errcode='22023'; end if;
  if (preferences_in - array['expectedRevision','preferences','deferDiscovery']) <> '{}'::jsonb
    or not preferences_in ?& array['expectedRevision','preferences']
    or (preferences_in ? 'deferDiscovery' and preferences_in->'deferDiscovery' is distinct from 'true'::jsonb)
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
  -- Legacy clients finish Friends setup when they save an area. Current
  -- clients defer activation, including when groups or events set this area.
  start_discovery := reference_in is not null and not (preferences_in ? 'deferDiscovery');
  if expected_revision = 0 then
    insert into public.friends_search_preferences(user_id,revision,preferences,setup_started)
      values(actor,1,prefs,start_discovery) on conflict(user_id) do nothing;
  else
    update public.friends_search_preferences set preferences = prefs, revision = revision + 1, setup_started = setup_started or start_discovery
      where user_id = actor and revision = expected_revision;
  end if;
  if not found then raise exception 'Friends preferences revision conflict' using errcode='FP409'; end if;
  return public.get_friends_search_preferences();
end $$;

create function social_private.matching_profile_ready(person uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.user_interests i where i.profile_id=person and char_length(i.text) between 1 and 120 and public.profile_language_key(i.text)<>'')
 and exists(select 1 from photo_private.photos p where p.user_id=person and p.jpeg is not null);
$$;

create function social_private.discovery_allowed(person uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join public.account_settings a on a.user_id=p.id
 join auth.users u on u.id=p.id where p.id=person and p.is_active
 and u.is_anonymous is false and u.deleted_at is null and (u.banned_until is null or u.banned_until<=statement_timestamp())
 and public.detailed_settings_masters(a.settings)->>'discoverable'='true'
 and public.dating_adult_on(p.birthdate,public.dating_campus_date(statement_timestamp()))
 and char_length(p.username) between 1 and 80 and char_length(p.display_name) between 1 and 120
 and public.profile_language_key(p.username)<>'' and public.profile_language_key(p.display_name)<>''
 and coalesce(char_length(p.bio),0)<=1000);
$$;

create function social_private.friends_discovery_enabled(person uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select social_private.discovery_allowed(person) and coalesce(
  (select (s.settings->>'friendsDiscovery')::boolean from public.detailed_settings s where s.user_id=person),true);
$$;

create function social_private.dating_discovery_enabled(person uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select (s.settings->>'datingDiscovery')::boolean from public.detailed_settings s where s.user_id=person),true);
$$;

create function social_private.legacy_discoverable(person uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join public.account_settings a on a.user_id=p.id
 where p.id=person and p.is_active and exists(select 1 from auth.users u where u.id=p.id and u.is_anonymous is false) and public.detailed_settings_masters(a.settings)->>'discoverable'='true'
 and p.birthdate between date '0001-01-01' and date '9999-12-31'
 and p.birthdate<=(statement_timestamp() at time zone 'America/New_York')::date-interval '18 years'
 and char_length(p.username) between 1 and 80 and char_length(p.display_name) between 1 and 120
 and public.profile_language_key(p.username)<>'' and public.profile_language_key(p.display_name)<>''
 and coalesce(char_length(p.bio),0)<=1000 and char_length(p.location_city)<=120 and public.profile_language_key(p.location_city)<>''
 and (select count(*) from public.user_interests i where i.profile_id=p.id) between 3 and 30
 and not exists(select 1 from public.user_interests i where i.profile_id=p.id and (char_length(i.text)>120 or public.profile_language_key(i.text)=''))
 and (select count(*) from public.availability w where w.profile_id=p.id) between 1 and 56
 and not exists(select 1 from public.availability w where w.profile_id=p.id and (w.start_time::text !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9])$' or w.end_time::text !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]|24:00:00)$'))
 and not exists(select 1 from public.availability w join public.availability x on x.profile_id=w.profile_id and x.id>w.id where w.profile_id=p.id and w.dow=x.dow and w.start_time<x.end_time and x.start_time<w.end_time)
 and jsonb_typeof(a.preferences->'intents')='array' and jsonb_array_length(a.preferences->'intents') between 1 and 20
 and not exists(select 1 from jsonb_array_elements(a.preferences->'intents') item where jsonb_typeof(item)<>'string' or char_length(item #>> '{}')>120 or public.profile_language_key(item #>> '{}')='')
 and a.preferences->>'distance' in('Nearby','5 miles','10 miles') and a.preferences->>'group' in('One-on-one','Small groups','Either'));
$$;

-- Keep existing legacy audiences and permit pending requests for users who
-- completed modern discovery. Group/event setup alone doesn't enable discovery.
create or replace function social_private.discoverable(person uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select social_private.legacy_discoverable(person) or (
  social_private.discovery_allowed(person) and social_private.matching_profile_ready(person) and (
   (social_private.friends_discovery_enabled(person) and
    exists(select 1 from public.friends_search_preferences f where f.user_id=person and f.setup_started))
   or (social_private.dating_discovery_enabled(person) and
    exists(select 1 from public.dating_owner_aggregates d where d.user_id=person and d.profile->>'enabled'='true'))
  )
 );
$$;

create or replace function social_private.friends_discoverable(person uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select social_private.friends_discovery_enabled(person) and (
  social_private.legacy_discoverable(person) or (social_private.matching_profile_ready(person)
   and exists(select 1 from public.friends_search_preferences f where f.user_id=person and f.setup_started))
 );
$$;

create function friends_private.search_area_ready(person uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join auth.users u on u.id=p.id
 join public.friends_search_preferences f on f.user_id=p.id
 join public.friends_search_location_refs r on r.user_id=p.id and r.id=(f.preferences->'searchArea'->>'resolvedLocationRef')::uuid
 join location_private.assertions proof on proof.mode='friends' and proof.id=r.id and proof.actor_id=p.id
 left join location_private.places place on place.id=proof.place_id
 where p.id=person
 and u.is_anonymous is false and u.deleted_at is null and (u.banned_until is null or u.banned_until<=statement_timestamp())
 -- Product decision: this version is 18+, including direct RPC/action access.
 and extract(year from age((statement_timestamp() at time zone 'America/New_York')::date,p.birthdate)) between 18 and 99
 and public.valid_friends_search_preferences(f.preferences)
 -- Recheck TTL against the current clock after any projection/action lock wait.
 and proof.expires_at>clock_timestamp()
 and (proof.method<>'geocoded-area' or (place.enabled and place.verified_until>clock_timestamp()))
 and location_private.usable('friends',r.id,p.id,f.preferences->'searchArea'->>'source',
  case when f.preferences->'searchArea'->>'source'='home' then p.location_city else f.preferences->'searchArea'->>'areaLabel' end));
$$;

create or replace function friends_private.eligible(person uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select social_private.friends_discovery_enabled(person)
 and social_private.matching_profile_ready(person)
 and exists(select 1 from public.friends_search_preferences f where f.user_id=person and f.setup_started)
 and friends_private.search_area_ready(person);
$$;

create or replace function public.get_friends_discovery_status() returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=safety_private.actor(); dob date; age_years integer; reason text;
begin
 select birthdate into dob from public.profiles where id=actor;
 if not found or dob is null then reason:='profile';
 else
  age_years:=extract(year from age((statement_timestamp() at time zone 'America/New_York')::date,dob));
  if age_years not between 18 and 99 then reason:='age';
  elsif not social_private.friends_discovery_enabled(actor) then reason:='discovery_off';
  elsif not social_private.matching_profile_ready(actor) then reason:='profile';
  elsif not exists(select 1 from public.friends_search_preferences f
   where f.user_id=actor and public.valid_friends_search_preferences(f.preferences)
   and f.preferences->'searchArea'->>'resolvedLocationRef' is not null) then reason:='preferences';
  elsif not friends_private.search_area_ready(actor) then reason:='location';
  elsif not exists(select 1 from public.friends_search_preferences f where f.user_id=actor and f.setup_started) then reason:='preferences';
  end if;
 end if;
 return jsonb_build_object('available',true,'eligible',reason is null,'reason',reason);
end $$;

create function active_friends_private.schedule_ready(person uuid) returns boolean
language sql stable security definer set search_path='' as $$
 -- Adjacent windows are continuous, including across midnight and week rollover.
 with slots as (
  select w.dow * 86400 + extract(epoch from w.start_time) as starts,
         w.dow * 86400 + extract(epoch from w.end_time) as ends
  from public.availability w where w.profile_id=person
 ), extended as (
  select starts,ends from slots
  union all select starts+604800,ends+604800 from slots
 ), runs as (
  select starts,ends,sum(boundary) over(order by starts,ends) as run from (
   select starts,ends,case when starts=lag(ends) over(order by starts,ends) then 0 else 1 end as boundary from extended
  ) slots_with_boundaries
 )
 select exists(select 1 from matching_private.scoring_settings s where s.user_id=person and s.time_zone is not null)
 and exists(select 1 from runs group by run having max(ends)-min(starts)>=3600);
$$;

create function public.get_progressive_matching_setup() returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=safety_private.actor();
begin
 return jsonb_build_object('profileReady',social_private.matching_profile_ready(actor),
   'friendsAreaReady',friends_private.search_area_ready(actor),
   'groupScheduleReady',active_friends_private.schedule_ready(actor));
end $$;

create function public.start_friends_discovery() returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=safety_private.actor();
begin
 if not social_private.friends_discovery_enabled(actor) or not social_private.matching_profile_ready(actor)
 or not friends_private.search_area_ready(actor) then
  raise exception 'Complete Friends setup and enable discovery first' using errcode='FR409';
 end if;
 update public.friends_search_preferences set setup_started=true where user_id=actor and not setup_started;
 return public.get_friends_discovery_status();
end $$;

create or replace function active_friends_private.eligible(person uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join auth.users u on u.id=p.id
 where p.id=person and p.is_active and u.is_anonymous is false and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp())
 and isfinite(p.birthdate) and p.birthdate between date '0001-01-01' and date '9999-12-31'
 and extract(year from age((clock_timestamp() at time zone 'America/New_York')::date,p.birthdate)) between 18 and 99
 and char_length(p.username) between 1 and 80 and public.profile_language_key(p.username)<>''
 and char_length(p.display_name) between 1 and 120 and public.profile_language_key(p.display_name)<>''
 and coalesce(char_length(p.bio),0)<=1000
 and social_private.matching_profile_ready(person)
 and active_friends_private.schedule_ready(person)
 and (select count(*) from public.availability w where w.profile_id=p.id) between 1 and 56
 and not exists(select 1 from public.availability w where w.profile_id=p.id and
  (w.start_time::text !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9])$' or w.end_time::text !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]|24:00:00)$'))
 and not exists(select 1 from public.availability w join public.availability x on x.profile_id=w.profile_id and x.id>w.id
  where w.profile_id=p.id and w.dow=x.dow and w.start_time<x.end_time and x.start_time<w.end_time)
 and friends_private.search_area_ready(person));
$$;

create or replace function event_group_private.profile_valid(actor_in uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=actor_in and p.is_active and social_private.discovery_allowed(actor_in)
  and social_private.matching_profile_ready(actor_in) and friends_private.search_area_ready(actor_in)
  and char_length(regexp_replace(p.username,'^\s+|\s+$','','g')) between 1 and 80
  and char_length(regexp_replace(p.display_name,'^\s+|\s+$','','g')) between 1 and 120
  and (p.bio is null or char_length(p.bio)<=1000)
  and (p.location_city is null or char_length(regexp_replace(p.location_city,'^\s+|\s+$','','g'))<=120)
  and (p.avatar_url is null or event_group_private.avatar(p.avatar_url) is not null)
  and (p.birthdate is null or (isfinite(p.birthdate) and p.birthdate between date '0001-01-01' and date '9999-12-31'))
  and (select count(*) from public.user_interests i where i.profile_id=p.id)<=30
  and not exists(select 1 from public.user_interests i where i.profile_id=p.id
    and char_length(regexp_replace(i.text,'^\s+|\s+$','','g')) not between 1 and 120)
  and (select count(distinct regexp_replace(i.text,'^\s+|\s+$','','g'))=count(*) from public.user_interests i where i.profile_id=p.id)
  and (select count(*) from public.availability a where a.profile_id=p.id)<=56
  and not exists(select 1 from public.availability a where a.profile_id=p.id and
    (a.start_time::text !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]|24:00:00)$'
     or a.end_time::text !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]|24:00:00)$'))
  and not exists(select 1 from public.availability a join public.availability b on b.profile_id=a.profile_id and b.id>a.id
    where a.profile_id=p.id and a.dow=b.dow and a.start_time<b.end_time and b.start_time<a.end_time));
$$;

create or replace function public.get_detailed_settings()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); result jsonb;
begin
  if actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select jsonb_build_object('revision',coalesce(d.revision,0),'settings',v.choices,
    'masters',v.masters,'effective',public.effective_detailed_settings(v.choices,v.masters)) into result
  from (values(actor)) me(id)
  left join public.detailed_settings d on d.user_id=me.id
  left join public.account_settings a on a.user_id=me.id
  cross join lateral (select
    coalesce(d.settings,'{"messages":false,"plans":false,"matches":false,"friendsDiscovery":true,"datingDiscovery":true}'::jsonb) as choices,
    public.detailed_settings_masters(a.settings) as masters) v;
  return result;
end $$;

create or replace function dating_private.eligible(person uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.dating_owner_aggregates d join public.profiles p on p.id=d.user_id
 where p.id=person and social_private.discovery_allowed(person) and social_private.dating_discovery_enabled(person) and social_private.matching_profile_ready(person) and public.valid_dating_profile(d.profile) and public.dating_complete(d.profile)
 and public.dating_adult_on(p.birthdate,public.dating_campus_date(statement_timestamp())) and d.search<>'null'::jsonb and public.valid_dating_search(d.search)
 and location_private.usable('dating',(d.search->'searchArea'->>'resolvedLocationRef')::uuid,person,d.search->'searchArea'->>'source',case when d.search->'searchArea'->>'source'='home' then p.location_city else d.search->'searchArea'->>'areaLabel' end));
$$;

create or replace function public.get_dating_runtime() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=safety_private.actor();begin
 return jsonb_build_object('available',true,'aggregate',public.get_dating_preferences(),'canStart',dating_private.eligible(actor),
 'globalDiscovery',coalesce((select public.detailed_settings_masters(s.settings)->>'discoverable'='true' from public.account_settings s where s.user_id=actor),false),
 'datingDiscovery',social_private.dating_discovery_enabled(actor));end $$;

revoke all on function social_private.matching_profile_ready(uuid), social_private.discovery_allowed(uuid),
 social_private.friends_discovery_enabled(uuid), social_private.dating_discovery_enabled(uuid),
 social_private.legacy_discoverable(uuid), friends_private.search_area_ready(uuid),
 active_friends_private.schedule_ready(uuid), public.get_progressive_matching_setup(), public.start_friends_discovery() from public,anon,authenticated;
grant execute on function public.get_progressive_matching_setup(), public.start_friends_discovery() to authenticated;
notify pgrst,'reload schema';
commit;
