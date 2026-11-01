-- Queue-first manual Friends matching. No passive discovery/Dating consent gate.
begin;
set local lock_timeout='3s'; set local statement_timeout='30s';
do $$ begin
 if to_regprocedure('matching_private.scoring_signals(uuid)') is null or to_regprocedure('friends_private.lock_pair(uuid,uuid)') is null then
  raise exception 'Reviewed matching, location and safety prerequisites missing' using errcode='22023';end if;
end $$;
create schema active_friends_private;
revoke all on schema active_friends_private from public,anon,authenticated;
create table active_friends_private.policy (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 algorithm_version text not null default 'active-friends-fifo-v1' check(char_length(algorithm_version) between 1 and 80),
 review_seconds integer not null default 300 check(review_seconds between 30 and 900),
 preferred_grace_seconds integer not null default 30 check(preferred_grace_seconds between 0 and 300),
 minimum_minutes integer not null default 60 check(minimum_minutes between 1 and 240)
);
insert into active_friends_private.policy default values;
create index active_meeting_places_geog on location_private.places using gist
 ((extensions.st_setsrid(extensions.st_makepoint(longitude,latitude),4326)::extensions.geography)) where enabled;
create table active_friends_private.groups (
 id uuid primary key default gen_random_uuid(),name text check(char_length(name) between 1 and 80),
 target_size integer not null check(target_size between 2 and 9),revision bigint not null default 1,
 next_seq bigint not null default 1 check(next_seq between 1 and 9007199254740991),created_at timestamptz not null default clock_timestamp()
);
create table active_friends_private.group_members (
 group_id uuid not null references active_friends_private.groups(id),user_id uuid not null references auth.users(id) on delete cascade,
 join_seq bigint not null default 1,read_seq bigint not null default 0,left_at timestamptz,
 maximum_size integer not null check(maximum_size between 2 and 9),primary key(group_id,user_id)
);
create table active_friends_private.ready (
 group_id uuid not null references active_friends_private.groups(id),user_id uuid not null references auth.users(id) on delete cascade,
 revision bigint not null,primary key(group_id,user_id)
);
create table active_friends_private.units (
 id uuid primary key default gen_random_uuid(),group_id uuid references active_friends_private.groups(id),group_revision bigint,
 member_count integer not null default 1 check(member_count between 1 and 9),
 preferred_size integer not null check(preferred_size between 2 and 9),minimum_size integer not null check(minimum_size between 2 and 9),
 maximum_size integer not null check(maximum_size between 2 and 9),allow_existing boolean not null,
 state text not null default 'queued' check(state in('queued','reserved','formed','cancelled','declined','expired')),
 last_outcome text check(last_outcome in('expired','cancelled','declined')),finished_at timestamptz,
 queued_at timestamptz not null default clock_timestamp(),created_at timestamptz not null default clock_timestamp(),not_before timestamptz not null default clock_timestamp(),
 lease_token uuid,lease_until timestamptz,proposal_id uuid,
 check(minimum_size<=preferred_size and preferred_size<=maximum_size)
);
create unique index active_friends_one_group_search on active_friends_private.units(group_id) where state in('queued','reserved');
create index active_friends_fifo on active_friends_private.units(queued_at,id) where state='queued';
create table active_friends_private.unit_members (
 unit_id uuid not null references active_friends_private.units(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,
 primary key(unit_id,user_id)
);
-- Exactly one live manual search/reservation per person, including group units.
create table active_friends_private.occupancy (
 user_id uuid primary key references auth.users(id) on delete cascade,unit_id uuid not null references active_friends_private.units(id)
);
create index active_unit_owner on active_friends_private.unit_members(user_id,unit_id);
create index active_group_owner on active_friends_private.group_members(user_id,group_id) where left_at is null;
create table active_friends_private.proposals (
 id uuid primary key default gen_random_uuid(),group_id uuid references active_friends_private.groups(id),
 algorithm_version text not null default 'active-friends-fifo-v1',
 state text not null default 'reserved' check(state in('reserved','formed','cancelled','expired')),
 starts_at timestamptz not null,ends_at timestamptz not null,place_id uuid not null references location_private.places(id),
 expires_at timestamptz not null,closed_at timestamptz,created_at timestamptz not null default clock_timestamp(),formed_group uuid references active_friends_private.groups(id),
 check(ends_at>starts_at)
);
create index active_friends_expiry on active_friends_private.proposals(expires_at) where state='reserved';
create table active_friends_private.proposal_members (
 proposal_id uuid not null references active_friends_private.proposals(id) on delete cascade,user_id uuid not null,
 unit_id uuid not null references active_friends_private.units(id),response text not null default 'pending' check(response in('pending','accepted')),responded_at timestamptz,
 primary key(proposal_id,user_id)
);
create table active_friends_private.commands (
 actor_id uuid not null references auth.users(id) on delete cascade,request_id uuid not null,payload jsonb not null,result jsonb not null,
 created_at timestamptz not null default clock_timestamp(),primary key(actor_id,request_id)
);
create index active_command_retention on active_friends_private.commands(created_at);
create table active_friends_private.messages (
 id uuid primary key default gen_random_uuid(),group_id uuid not null references active_friends_private.groups(id),seq bigint not null,
 sender_id uuid references auth.users(id) on delete set null,body text not null check(char_length(body) between 1 and 2000),
 request_id uuid not null,created_at timestamptz not null default clock_timestamp(),unique(group_id,seq),unique(sender_id,request_id)
);
do $$ declare t record;begin
 for t in select tablename from pg_tables where schemaname='active_friends_private' loop
  execute format('alter table active_friends_private.%I enable row level security',t.tablename);
  execute format('revoke all on active_friends_private.%I from public,anon,authenticated',t.tablename);
 end loop;
end $$;

create function active_friends_private.eligible(person uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join auth.users u on u.id=p.id
 join public.account_settings a on a.user_id=p.id join public.friends_search_preferences f on f.user_id=p.id
 join matching_private.scoring_settings s on s.user_id=p.id and s.time_zone is not null
 join public.friends_search_location_refs r on r.user_id=p.id and r.id=(f.preferences->'searchArea'->>'resolvedLocationRef')::uuid
 join location_private.assertions proof on proof.mode='friends' and proof.id=r.id and proof.actor_id=p.id
 left join location_private.places place on place.id=proof.place_id
 where p.id=person and p.is_active and u.is_anonymous is false and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp())
 and isfinite(p.birthdate) and p.birthdate between date '0001-01-01' and date '9999-12-31'
 and extract(year from age((clock_timestamp() at time zone 'America/New_York')::date,p.birthdate)) between 18 and 99
 and char_length(p.username) between 1 and 80 and public.profile_language_key(p.username)<>''
 and char_length(p.display_name) between 1 and 120 and public.profile_language_key(p.display_name)<>''
 and coalesce(char_length(p.bio),0)<=1000 and char_length(p.location_city)<=120 and public.profile_language_key(p.location_city)<>''
 and (select count(*) from public.user_interests i where i.profile_id=p.id) between 3 and 30
 and not exists(select 1 from public.user_interests i where i.profile_id=p.id and (char_length(i.text)>120 or public.profile_language_key(i.text)=''))
 and (select count(*) from public.availability w where w.profile_id=p.id) between 1 and 56
 and not exists(select 1 from public.availability w where w.profile_id=p.id and
  (w.start_time::text !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9])$' or w.end_time::text !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]|24:00:00)$'))
 and not exists(select 1 from public.availability w join public.availability x on x.profile_id=w.profile_id and x.id>w.id
  where w.profile_id=p.id and w.dow=x.dow and w.start_time<x.end_time and x.start_time<w.end_time)
 and jsonb_typeof(a.preferences->'intents')='array' and jsonb_array_length(a.preferences->'intents') between 1 and 20
 and not exists(select 1 from jsonb_array_elements(a.preferences->'intents') item where jsonb_typeof(item)<>'string' or char_length(item #>> '{}')>120 or public.profile_language_key(item #>> '{}')='')
 and a.preferences->>'distance' in('Nearby','5 miles','10 miles') and a.preferences->>'group' in('One-on-one','Small groups','Either')
 and public.valid_friends_search_preferences(f.preferences)
 and proof.expires_at>clock_timestamp() and (proof.method<>'geocoded-area' or (place.enabled and place.verified_until>clock_timestamp()))
 and location_private.usable('friends',r.id,p.id,f.preferences->'searchArea'->>'source',
  case when f.preferences->'searchArea'->>'source'='home' then p.location_city else f.preferences->'searchArea'->>'areaLabel' end));
$$;
create function active_friends_private.pair_allowed(a uuid,b uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.friends_search_preferences x join public.friends_search_preferences y on y.user_id=b
 join public.profiles p on p.id=a join public.profiles q on q.id=b
 join public.friends_search_location_refs m on m.id=(x.preferences->'searchArea'->>'resolvedLocationRef')::uuid
 join public.friends_search_location_refs n on n.id=(y.preferences->'searchArea'->>'resolvedLocationRef')::uuid
 where x.user_id=a and a<>b and active_friends_private.eligible(a) and active_friends_private.eligible(b) and public.safety_pair_allowed(a,b)
 and extract(year from age((clock_timestamp() at time zone 'America/New_York')::date,q.birthdate)) between (x.preferences->>'ageMin')::integer and (x.preferences->>'ageMax')::integer
 and extract(year from age((clock_timestamp() at time zone 'America/New_York')::date,p.birthdate)) between (y.preferences->>'ageMin')::integer and (y.preferences->>'ageMax')::integer
 and extensions.st_dwithin(extensions.st_setsrid(extensions.st_makepoint(m.longitude,m.latitude),4326)::extensions.geography,
  extensions.st_setsrid(extensions.st_makepoint(n.longitude,n.latitude),4326)::extensions.geography,
  least((x.preferences->>'radiusMiles')::integer,(y.preferences->>'radiusMiles')::integer)*1609.344));
$$;
create function active_friends_private.valid_roster(people uuid[],starts timestamptz,ends timestamptz,area uuid) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare person uuid;peer uuid;available tstzmultirange;effective_start timestamptz:=greatest(starts,clock_timestamp());begin
 if cardinality(people) not between 2 and 9 or cardinality(people)<>(select count(distinct x) from unnest(people) x)
 or not isfinite(starts) or not isfinite(ends) or ends>clock_timestamp()+interval '14 days'
 or ends-effective_start<make_interval(mins=>(select minimum_minutes from active_friends_private.policy)) then return false;end if;
 foreach person in array people loop
  if not active_friends_private.eligible(person) then return false;end if;
  foreach peer in array people loop
   if person<peer and not active_friends_private.pair_allowed(person,peer) then return false;end if;
  end loop;
  select range_agg(tstzrange((x->>'start')::timestamptz,(x->>'end')::timestamptz,'[)')) into available
  from jsonb_array_elements(matching_private.scoring_signals(person)->'intervals') x;
  if available is null or not available @> tstzrange(effective_start,ends,'[)') then return false;end if;
  if not exists(select 1 from location_private.places place join public.friends_search_preferences f on f.user_id=person
   join public.friends_search_location_refs r on r.id=(f.preferences->'searchArea'->>'resolvedLocationRef')::uuid
   where place.id=area and place.enabled and place.verified_until>clock_timestamp()
   and extensions.st_dwithin(extensions.st_setsrid(extensions.st_makepoint(place.longitude,place.latitude),4326)::extensions.geography,
    extensions.st_setsrid(extensions.st_makepoint(r.longitude,r.latitude),4326)::extensions.geography,(f.preferences->>'radiusMiles')::integer*1609.344)) then return false;end if;
 end loop;
 return true;
end $$;

-- Closing a proposal never invents acceptance. Unaffected units keep queued_at.
create function active_friends_private.release_proposal(proposal uuid,outcome text,drop_unit uuid default null) returns void
language plpgsql volatile security definer set search_path='' as $$
declare item record;begin
 perform 1 from active_friends_private.proposals where id=proposal for update;
 if not exists(select 1 from active_friends_private.proposals where id=proposal and state='reserved') then return;end if;
 update active_friends_private.proposals set state=case when outcome='expired' then 'expired' else 'cancelled' end,closed_at=clock_timestamp() where id=proposal;
 for item in select u.* from active_friends_private.units u where u.proposal_id=proposal and u.state='reserved' order by u.id for update loop
  if item.id=drop_unit or (outcome='expired' and exists(select 1 from active_friends_private.proposal_members where proposal_id=proposal and unit_id=item.id and response='pending')) or item.member_count<>(select count(*) from active_friends_private.unit_members where unit_id=item.id) or exists(select 1 from active_friends_private.unit_members m where m.unit_id=item.id and not active_friends_private.eligible(m.user_id)) then
   update active_friends_private.units set finished_at=clock_timestamp(),last_outcome=outcome,state=case when outcome='expired' then 'expired' when outcome='declined' then 'declined' else 'cancelled' end,lease_token=null,lease_until=null where id=item.id;
   delete from active_friends_private.occupancy where unit_id=item.id;
   if item.group_id is not null then delete from active_friends_private.ready where group_id=item.group_id;end if;
  else
   update active_friends_private.units set state='queued',finished_at=null,last_outcome=outcome,proposal_id=null,lease_token=null,lease_until=null,not_before=clock_timestamp() where id=item.id;
  end if;
 end loop;
end $$;
create function active_friends_private.expire_due() returns void
language plpgsql volatile security definer set search_path='' as $$
declare item record;begin
 for item in select id from active_friends_private.proposals where state='reserved' and expires_at<=clock_timestamp() order by expires_at limit 100 for update skip locked loop
  perform active_friends_private.release_proposal(item.id,'expired');
 end loop;
end $$;
create function active_friends_private.public_status(actor uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare entry active_friends_private.units;offer active_friends_private.proposals;proposal jsonb;people uuid[];begin
 select u.* into entry from active_friends_private.units u join active_friends_private.unit_members m on m.unit_id=u.id and m.user_id=actor
 order by (u.state in('queued','reserved')) desc,u.created_at desc,u.id limit 1;
 if entry.id is null then return '{"state":"idle","entryId":null,"queuedAt":null,"proposal":null,"groupId":null,"lastOutcome":null,"choices":null}'::jsonb||jsonb_build_object('enabled',(select enabled from active_friends_private.policy));end if;
 if entry.state='formed' and not exists(select 1 from active_friends_private.group_members where group_id=entry.group_id and user_id=actor and left_at is null) then
  return '{"state":"idle","entryId":null,"queuedAt":null,"proposal":null,"groupId":null,"lastOutcome":null,"choices":null}'::jsonb||jsonb_build_object('enabled',(select enabled from active_friends_private.policy));end if;
 if entry.state='reserved' then
  select * into offer from active_friends_private.proposals where id=entry.proposal_id for update;
  select array_agg(user_id order by user_id) into people from active_friends_private.proposal_members where proposal_id=offer.id;
  perform 1 from auth.users where id=any(people) order by id for share;
  perform 1 from public.profiles where id=any(people) order by id for share;
  perform friends_private.lock_pair(a,b) from unnest(people) a cross join unnest(people) b where a<b order by a,b;
  perform 1 from location_private.places where id=offer.place_id for share;
  if offer.expires_at<=clock_timestamp() then perform active_friends_private.release_proposal(offer.id,'expired');return active_friends_private.public_status(actor);end if;
  if not active_friends_private.valid_roster(people,offer.starts_at,offer.ends_at,offer.place_id) then
   perform active_friends_private.release_proposal(offer.id,'cancelled');return active_friends_private.public_status(actor);end if;
  select jsonb_build_object('id',offer.id,'expiresAt',offer.expires_at,'groupId',offer.group_id,
   'meetingArea',(select label from location_private.places where id=offer.place_id),
   'commonWindow',case when not exists(select 1 from active_friends_private.proposal_members m left join matching_private.scoring_settings s on s.user_id=m.user_id where m.proposal_id=offer.id and not coalesce(s.show_availability,false)) then jsonb_build_object('start',offer.starts_at,'end',offer.ends_at) else null end,
   'members',(select jsonb_agg(jsonb_build_object('id',m.user_id,'name',p.display_name,'age',extract(year from age((clock_timestamp() at time zone 'America/New_York')::date,p.birthdate))::integer,
    'response',m.response,'avatar',null) order by m.user_id) from active_friends_private.proposal_members m join public.profiles p on p.id=m.user_id where m.proposal_id=offer.id)) into proposal;
 end if;
 return jsonb_build_object('enabled',(select enabled from active_friends_private.policy),'state',case when entry.state='reserved' and exists(select 1 from active_friends_private.proposal_members where proposal_id=entry.proposal_id and user_id=actor and response='accepted') then 'accepted' else entry.state end,
  'entryId',entry.id,'queuedAt',entry.queued_at,'lastOutcome',entry.last_outcome,'proposal',proposal,
  'choices',jsonb_build_object('preferredGroupSize',entry.preferred_size,'minimumGroupSize',entry.minimum_size,'maximumGroupSize',entry.maximum_size,'allowExistingGroups',entry.allow_existing),
  'groupId',case when entry.state='formed' then entry.group_id else null end);
end $$;
create function public.get_active_friends_status() returns jsonb
language sql volatile security definer set search_path='' as $$ select active_friends_private.public_status(safety_private.actor()); $$;

create function active_friends_private.snapshot(person uuid,peers uuid[]) returns jsonb
language sql volatile security definer set search_path='' as $$
 select matching_private.scoring_signals(person)||jsonb_build_object('id',person,
 'age',extract(year from age((clock_timestamp() at time zone 'America/New_York')::date,p.birthdate))::integer,
 'ageMin',(f.preferences->>'ageMin')::integer,'ageMax',(f.preferences->>'ageMax')::integer,
 'radiusMiles',(f.preferences->>'radiusMiles')::integer,'latitude',r.latitude,'longitude',r.longitude,'goals',f.preferences->'goals',
 'blockedIds',coalesce((select jsonb_agg(peer order by peer) from(select b.blocked_id peer from public.blocks b where b.blocker_id=person and b.blocked_id=any(peers)
 union select b.blocker_id from public.blocks b where b.blocked_id=person and b.blocker_id=any(peers)) blocked),'[]'))
 from public.profiles p join public.friends_search_preferences f on f.user_id=p.id join public.friends_search_location_refs r on r.id=(f.preferences->'searchArea'->>'resolvedLocationRef')::uuid where p.id=person;
$$;
create function public.claim_active_friends_job() returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare anchor active_friends_private.units;token uuid:=gen_random_uuid();units uuid[];people uuid[];result jsonb;begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker only' using errcode='42501';end if;
 perform 1 from active_friends_private.policy for share;
 if not (select enabled from active_friends_private.policy) then return null;end if;
 perform active_friends_private.expire_due();
 select u.* into anchor from active_friends_private.units u where u.state='queued' and u.not_before<=clock_timestamp()
 and (u.lease_until is null or u.lease_until<=clock_timestamp())
 and u.member_count=(select count(*) from active_friends_private.unit_members where unit_id=u.id)
 and not exists(select 1 from active_friends_private.unit_members m where m.unit_id=u.id and not active_friends_private.eligible(m.user_id))
 order by u.queued_at,u.id limit 1 for update skip locked;
 if anchor.id is null then return null;end if;
 update active_friends_private.units set lease_token=token,lease_until=clock_timestamp()+interval '30 seconds' where id=anchor.id;
 -- Bound the pool by unit count and cumulative people. Preserve FIFO priority;
 -- geographic eligibility precedes soft similarity, not an all-user pair matrix.
 with geographic as materialized (
  select distinct slot.unit_id from active_friends_private.unit_members am
  join public.friends_search_preferences af on af.user_id=am.user_id
  join public.friends_search_location_refs ar on ar.id=(af.preferences->'searchArea'->>'resolvedLocationRef')::uuid
  join public.friends_search_location_refs br on extensions.st_dwithin(
   extensions.st_setsrid(extensions.st_makepoint(br.longitude,br.latitude),4326)::extensions.geography,
   extensions.st_setsrid(extensions.st_makepoint(ar.longitude,ar.latitude),4326)::extensions.geography,(af.preferences->>'radiusMiles')::integer*1609.344)
  join active_friends_private.occupancy slot on slot.user_id=br.user_id where am.unit_id=anchor.id
 ),nearby as (
  select u.id,u.queued_at,(select count(*) from active_friends_private.unit_members m where m.unit_id=u.id) size
  from active_friends_private.units u where u.state='queued'
  and (u.id=anchor.id or u.id in(select unit_id from geographic))
  and (u.id=anchor.id or u.lease_until is null or u.lease_until<=clock_timestamp())
  and (u.id=anchor.id or exists(select 1 from active_friends_private.unit_members a join active_friends_private.unit_members b on b.unit_id=u.id
   where a.unit_id=anchor.id and active_friends_private.pair_allowed(a.user_id,b.user_id)))
  and not exists(select 1 from active_friends_private.unit_members m where m.unit_id=u.id and not active_friends_private.eligible(m.user_id))
  order by (u.id=anchor.id) desc,u.queued_at,u.id limit 50
 ),bounded as(select *,sum(size) over(order by (id=anchor.id) desc,queued_at,id) running_size from nearby)
 select array_agg(id order by (id=anchor.id) desc,queued_at,id) into units from bounded where running_size<=100;
 select array_agg(user_id order by user_id) into people from active_friends_private.unit_members where unit_id=any(units);
 select jsonb_build_object('algorithmVersion',p.algorithm_version,'unitId',anchor.id,'leaseToken',token,'now',clock_timestamp(),
 'preferredSizeGraceSeconds',p.preferred_grace_seconds,'minimumOverlapMinutes',p.minimum_minutes,
 'units',(select jsonb_agg(jsonb_build_object('id',u.id,'groupId',u.group_id,'queuedAt',u.queued_at,
  'preferredSize',u.preferred_size,'minimumSize',u.minimum_size,'maximumSize',u.maximum_size,'allowExistingGroups',u.allow_existing,
  'members',(select jsonb_agg(active_friends_private.snapshot(m.user_id,people) order by m.user_id) from active_friends_private.unit_members m where m.unit_id=u.id)) order by u.queued_at,u.id)
  from active_friends_private.units u where u.id=any(units)),
 'areas',coalesce((select jsonb_agg(jsonb_build_object('id',area.id,'latitude',area.latitude,'longitude',area.longitude)) from(
  select place.id,place.latitude,place.longitude from location_private.places place where place.enabled and place.verified_until>clock_timestamp()
  and exists(select 1 from active_friends_private.unit_members m join public.friends_search_preferences f on f.user_id=m.user_id
   join public.friends_search_location_refs r on r.id=(f.preferences->'searchArea'->>'resolvedLocationRef')::uuid where m.unit_id=anchor.id
   and extensions.st_dwithin(extensions.st_setsrid(extensions.st_makepoint(place.longitude,place.latitude),4326)::extensions.geography,
    extensions.st_setsrid(extensions.st_makepoint(r.longitude,r.latitude),4326)::extensions.geography,(f.preferences->>'radiusMiles')::integer*1609.344))
  and not exists(select 1 from active_friends_private.unit_members m join public.friends_search_preferences f on f.user_id=m.user_id
   join public.friends_search_location_refs r on r.id=(f.preferences->'searchArea'->>'resolvedLocationRef')::uuid where m.unit_id=anchor.id
   and not extensions.st_dwithin(extensions.st_setsrid(extensions.st_makepoint(place.longitude,place.latitude),4326)::extensions.geography,
    extensions.st_setsrid(extensions.st_makepoint(r.longitude,r.latitude),4326)::extensions.geography,(f.preferences->>'radiusMiles')::integer*1609.344))
  order by (select max(extensions.st_distance(extensions.st_setsrid(extensions.st_makepoint(place.longitude,place.latitude),4326)::extensions.geography,
    extensions.st_setsrid(extensions.st_makepoint(r.longitude,r.latitude),4326)::extensions.geography))
   from active_friends_private.unit_members m join public.friends_search_preferences f on f.user_id=m.user_id
   join public.friends_search_location_refs r on r.id=(f.preferences->'searchArea'->>'resolvedLocationRef')::uuid where m.unit_id=anchor.id),place.id limit 50) area),'[]')) into result from active_friends_private.policy p;
 return result;
end $$;
create function public.finish_active_friends_job(unit_in uuid,token_in uuid,selection_in jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare selected uuid[];people uuid[];proposal uuid;group_in uuid;starts timestamptz;ends timestamptz;area uuid;anchor active_friends_private.units;begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker only' using errcode='42501';end if;
 perform 1 from active_friends_private.policy for share;
 if not (select enabled from active_friends_private.policy) then return '{"state":"paused","processed":0}';end if;
 if selection_in='null'::jsonb then
  update active_friends_private.units set lease_token=null,lease_until=null,not_before=clock_timestamp()+interval '5 seconds'
  where id=unit_in and state='queued' and lease_token=token_in and lease_until>clock_timestamp();
  return jsonb_build_object('state',case when found then 'waiting' else 'uncertain' end,'processed',0);
 end if;
 if jsonb_typeof(selection_in) is distinct from 'object' or (select count(*) from jsonb_object_keys(selection_in))<>4
 or not selection_in ?& array['unitIds','window','areaId','algorithmVersion'] or jsonb_typeof(selection_in->'unitIds') is distinct from 'array'
 or selection_in->>'algorithmVersion' is distinct from (select algorithm_version from active_friends_private.policy)
 or jsonb_array_length(selection_in->'unitIds') not between 2 and 9 then raise exception 'Invalid selection' using errcode='22023';end if;
 select array_agg(value::uuid order by value::uuid) into selected from jsonb_array_elements_text(selection_in->'unitIds');
 if cardinality(selected)<>(select count(distinct x) from unnest(selected) x) or not unit_in=any(selected) then raise exception 'Invalid selected units' using errcode='22023';end if;
 perform 1 from active_friends_private.units where id=any(selected) order by id for update;
 select * into anchor from active_friends_private.units where id=unit_in;
 if anchor.state<>'queued' or anchor.lease_token is distinct from token_in or anchor.lease_until<=clock_timestamp()
 or (select count(*) from active_friends_private.units where id=any(selected) and state='queued')<>cardinality(selected) then raise exception 'Queue changed' using errcode='AF409';end if;
 select array_agg(user_id order by user_id) into people from active_friends_private.unit_members where unit_id=any(selected);
 perform 1 from auth.users where id=any(people) order by id for share;
 perform 1 from public.profiles where id=any(people) order by id for share;
 perform friends_private.lock_pair(a,b) from unnest(people) a cross join unnest(people) b where a<b order by a,b;
 if (select count(*) from active_friends_private.occupancy where unit_id=any(selected))<>cardinality(people)
 or exists(select 1 from active_friends_private.units u where u.id=any(selected) and (cardinality(people) not between u.minimum_size and u.maximum_size or u.member_count<>(select count(*) from active_friends_private.unit_members where unit_id=u.id)))
 or (select count(*) from active_friends_private.units where id=any(selected) and group_id is not null)>1 then raise exception 'Invalid group size/membership' using errcode='AF409';end if;
 select group_id into group_in from active_friends_private.units where id=any(selected) and group_id is not null;
 if group_in is not null and exists(select 1 from active_friends_private.units where id=any(selected) and group_id is null and not allow_existing) then raise exception 'Existing group not opted in' using errcode='AF409';end if;
 if group_in is not null then
  perform 1 from active_friends_private.groups where id=group_in for update;
  if exists(select 1 from active_friends_private.units u join active_friends_private.groups g on g.id=u.group_id where u.id=any(selected) and u.group_revision<>g.revision) then raise exception 'Roster changed' using errcode='AF409';end if;
 end if;
 if clock_timestamp()-anchor.queued_at<make_interval(secs=>(select preferred_grace_seconds from active_friends_private.policy)) and cardinality(people)<>anchor.preferred_size then raise exception 'Preferred-size grace remains' using errcode='AF409';end if;
 starts:=(selection_in->'window'->>'start')::timestamptz;ends:=(selection_in->'window'->>'end')::timestamptz;area:=(selection_in->>'areaId')::uuid;
 if not active_friends_private.valid_roster(people,starts,ends,area) then raise exception 'Group no longer eligible' using errcode='AF409';end if;
 insert into active_friends_private.proposals(group_id,starts_at,ends_at,place_id,expires_at,algorithm_version)
 values(group_in,starts,ends,area,clock_timestamp()+make_interval(secs=>(select review_seconds from active_friends_private.policy)),selection_in->>'algorithmVersion') returning id into proposal;
 insert into active_friends_private.proposal_members(proposal_id,user_id,unit_id) select proposal,user_id,unit_id from active_friends_private.unit_members where unit_id=any(selected);
 update active_friends_private.units set state='reserved',last_outcome=null,proposal_id=proposal,lease_token=null,lease_until=null where id=any(selected);
 return '{"state":"reserved","processed":1}';
end $$;

create function active_friends_private.cancel_unit(unit uuid,outcome text default 'cancelled') returns void
language plpgsql volatile security definer set search_path='' as $$
declare entry active_friends_private.units;begin
 select * into entry from active_friends_private.units where id=unit for update;
 if entry.state='reserved' then perform active_friends_private.release_proposal(entry.proposal_id,outcome,unit);
 elsif entry.state='queued' then
  update active_friends_private.units set state=outcome,finished_at=clock_timestamp(),last_outcome=outcome,lease_token=null,lease_until=null where id=unit;
  delete from active_friends_private.occupancy where unit_id=unit;
 end if;
 if entry.group_id is not null then delete from active_friends_private.ready where group_id=entry.group_id;end if;
end $$;
create function active_friends_private.roster_changed() returns trigger
language plpgsql volatile security definer set search_path='' as $$
declare group_in uuid:=old.group_id;entry record;begin
 if tg_op='UPDATE' and old.left_at is not distinct from new.left_at then return new;end if;
 update active_friends_private.groups set revision=revision+1 where id=group_in;
 delete from active_friends_private.ready where group_id=group_in;
 for entry in select id from active_friends_private.units where group_id=group_in and state in('queued','reserved') order by id loop
  perform active_friends_private.cancel_unit(entry.id);
 end loop;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
create trigger active_group_roster_changed after delete or update of left_at on active_friends_private.group_members
for each row execute function active_friends_private.roster_changed();

create function active_friends_private.confirm_proposal(proposal uuid) returns uuid
language plpgsql volatile security definer set search_path='' as $$
declare offer active_friends_private.proposals;people uuid[];selected uuid[];group_in uuid;capacity integer;item record;begin
 select * into offer from active_friends_private.proposals where id=proposal for update;
 if offer.state='formed' then return offer.formed_group;end if;
 if offer.state<>'reserved' or offer.expires_at<=clock_timestamp() then
  perform active_friends_private.release_proposal(proposal,'expired');return null;end if;
 select array_agg(user_id order by user_id),array_agg(distinct unit_id order by unit_id) into people,selected
 from active_friends_private.proposal_members where proposal_id=proposal;
 perform 1 from active_friends_private.units where id=any(selected) order by id for update;
 perform 1 from auth.users where id=any(people) order by id for share;
 perform 1 from public.profiles where id=any(people) order by id for share;
 perform friends_private.lock_pair(a,b) from unnest(people) a cross join unnest(people) b where a<b order by a,b;
 perform 1 from location_private.places where id=offer.place_id for share;
 if exists(select 1 from active_friends_private.units u where u.id=any(selected) and
  (u.state<>'reserved' or u.proposal_id<>proposal or cardinality(people) not between u.minimum_size and u.maximum_size
   or u.member_count<>(select count(*) from active_friends_private.unit_members where unit_id=u.id)))
 or (select count(*) from active_friends_private.occupancy where unit_id=any(selected))<>cardinality(people)
 or not active_friends_private.valid_roster(people,offer.starts_at,offer.ends_at,offer.place_id) then
  perform active_friends_private.release_proposal(proposal,'cancelled');return null;end if;
 group_in:=offer.group_id;
 if group_in is not null then
  perform 1 from active_friends_private.groups where id=group_in for update;
  if exists(select 1 from active_friends_private.units u join active_friends_private.groups g on g.id=u.group_id
   where u.id=any(selected) and (g.revision<>u.group_revision or cardinality(people)>g.target_size))
   or exists(select 1 from active_friends_private.group_members where group_id=group_in and left_at is null and maximum_size<cardinality(people))
   or exists(select 1 from active_friends_private.group_members m where m.group_id=group_in and m.left_at is null and not m.user_id=any(people)) then
   perform active_friends_private.release_proposal(proposal,'cancelled');return null;end if;
 end if;
 if exists(select 1 from active_friends_private.proposal_members where proposal_id=proposal and response<>'accepted') then return null;end if;
 if group_in is null then
  select least(min(maximum_size),max(preferred_size)) into capacity from active_friends_private.units where id=any(selected);
  insert into active_friends_private.groups(target_size) values(greatest(cardinality(people),capacity)) returning id into group_in;
 end if;
 -- Terminal states precede membership edits, so roster invalidation cannot
 -- cancel the proposal being committed. The whole transaction is atomic.
 update active_friends_private.proposals set state='formed',closed_at=clock_timestamp(),formed_group=group_in where id=proposal;
 update active_friends_private.units set state='formed',finished_at=clock_timestamp(),group_id=group_in where id=any(selected);
 delete from active_friends_private.occupancy where unit_id=any(selected);
 for item in select pm.user_id,u.maximum_size from active_friends_private.proposal_members pm join active_friends_private.units u on u.id=pm.unit_id where pm.proposal_id=proposal order by pm.user_id loop
  if not exists(select 1 from active_friends_private.group_members where group_id=group_in and user_id=item.user_id and left_at is null) then
   insert into active_friends_private.group_members(group_id,user_id,join_seq,maximum_size)
   values(group_in,item.user_id,(select next_seq from active_friends_private.groups where id=group_in),item.maximum_size)
   on conflict(group_id,user_id) do update set left_at=null,join_seq=excluded.join_seq,read_seq=excluded.join_seq-1,maximum_size=excluded.maximum_size;
  end if;
 end loop;
 update active_friends_private.groups set revision=revision+1,
  target_size=least(target_size,(select min(maximum_size) from active_friends_private.group_members where group_id=group_in and left_at is null)) where id=group_in;
 delete from active_friends_private.ready where group_id=group_in;
 return group_in;
end $$;

create function public.active_friends_command(command_in jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=safety_private.actor();action text:=command_in->>'action';request uuid;data jsonb:=command_in->'data';previous jsonb;
 entry active_friends_private.units;offer active_friends_private.proposals;unit uuid;group_in uuid;group_row active_friends_private.groups;
 preferred integer;minimum integer;maximum integer;people uuid[];selected uuid[];person uuid;proposal uuid;result jsonb;begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'READ COMMITTED required' using errcode='25001';end if;
 if jsonb_typeof(command_in) is distinct from 'object' or (select count(*) from jsonb_object_keys(command_in))<>3
 or not command_in ?& array['action','requestId','data'] or jsonb_typeof(data) is distinct from 'object'
 or action is null or action not in('join','cancel','accept','decline','smaller','ready','cancel-growth','leave','rename')
 or not location_private.valid_uuid(command_in->>'requestId') then raise exception 'Invalid command' using errcode='22023';end if;
 request:=(command_in->>'requestId')::uuid;
 perform 1 from active_friends_private.policy for share;
 if not (select enabled from active_friends_private.policy) and (action in('join','accept','smaller') or (action='ready' and data->>'ready'='true')) then raise exception 'Active matching paused' using errcode='AF503';end if;
 perform pg_advisory_xact_lock(hashtextextended('active-friends-command:'||actor::text,0));
 select payload into previous from active_friends_private.commands where actor_id=actor and request_id=request;
 if found then
  if previous<>command_in then raise exception 'Request ID reused for another action' using errcode='AF409';end if;
  return active_friends_private.public_status(actor);
 end if;
 if action='join' then
  if (select count(*) from jsonb_object_keys(data))<>4 or not data ?& array['preferredNewFriends','minimumGroupSize','maximumGroupSize','allowExistingGroups']
   or jsonb_typeof(data->'preferredNewFriends') is distinct from 'number' or jsonb_typeof(data->'minimumGroupSize') is distinct from 'number'
   or jsonb_typeof(data->'maximumGroupSize') is distinct from 'number' or jsonb_typeof(data->'allowExistingGroups') is distinct from 'boolean' then raise exception 'Invalid queue choices' using errcode='22023';end if;
  preferred:=(data->>'preferredNewFriends')::integer+1;minimum:=(data->>'minimumGroupSize')::integer;maximum:=(data->>'maximumGroupSize')::integer;
  if preferred not between 2 and 9 or minimum not between 2 and preferred or maximum not between preferred and 9
   or (data->>'preferredNewFriends')::numeric<>preferred-1 or (data->>'minimumGroupSize')::numeric<>minimum or (data->>'maximumGroupSize')::numeric<>maximum then raise exception 'Invalid group range' using errcode='22023';end if;
  perform 1 from public.profiles where id=actor for share;
  if not active_friends_private.eligible(actor) then raise exception 'Complete adult profile, Friends filters, trusted location and timezone first' using errcode='AF409';end if;
  if exists(select 1 from active_friends_private.occupancy where user_id=actor) then raise exception 'Already searching or reviewing' using errcode='AF409';end if;
  insert into active_friends_private.units(preferred_size,minimum_size,maximum_size,allow_existing)
   values(preferred,minimum,maximum,(data->>'allowExistingGroups')::boolean) returning id into unit;
  insert into active_friends_private.unit_members values(unit,actor);insert into active_friends_private.occupancy values(actor,unit);
 elsif action='cancel' then
  if data<>'{}'::jsonb then raise exception 'Unexpected cancel fields' using errcode='22023';end if;
  select unit_id into unit from active_friends_private.occupancy where user_id=actor;
  if unit is not null then perform active_friends_private.cancel_unit(unit);end if;
 elsif action in('accept','decline','smaller') then
  if not location_private.valid_uuid(data->>'proposalId') then raise exception 'Invalid proposal' using errcode='22023';end if;
  if (action='smaller' and ((select count(*) from jsonb_object_keys(data))<>2 or not data ?& array['proposalId','memberIds'] or jsonb_typeof(data->'memberIds') is distinct from 'array'))
   or (action<>'smaller' and data<>jsonb_build_object('proposalId',data->'proposalId')) then raise exception 'Unexpected proposal fields' using errcode='22023';end if;
  select p.* into offer from active_friends_private.proposals p join active_friends_private.proposal_members m on m.proposal_id=p.id and m.user_id=actor where p.id=(data->>'proposalId')::uuid for update of p;
  if offer.id is null then raise exception 'Proposal unavailable' using errcode='42501';end if;
  if offer.state='formed' and action='accept' then result:=active_friends_private.public_status(actor);
  elsif offer.state<>'reserved' then raise exception 'Proposal changed; review the current roster' using errcode='AF409';
  elsif offer.expires_at<=clock_timestamp() then perform active_friends_private.release_proposal(offer.id,'expired');
  elsif action='decline' then
   select unit_id into unit from active_friends_private.proposal_members where proposal_id=offer.id and user_id=actor;
   perform active_friends_private.release_proposal(offer.id,'declined',unit);
  elsif action='accept' then
   update active_friends_private.proposal_members set response='accepted',responded_at=coalesce(responded_at,clock_timestamp()) where proposal_id=offer.id and user_id=actor;
   perform active_friends_private.confirm_proposal(offer.id);
  else
   if not exists(select 1 from active_friends_private.proposal_members where proposal_id=offer.id and user_id=actor and response='accepted') then raise exception 'Accept before proposing a smaller roster' using errcode='AF409';end if;
   if jsonb_array_length(data->'memberIds') not between 2 and 9 or exists(select 1 from jsonb_array_elements(data->'memberIds') x where jsonb_typeof(x)<>'string' or not location_private.valid_uuid(x #>> '{}')) then raise exception 'Invalid smaller roster' using errcode='22023';end if;
   select array_agg(value::uuid order by value::uuid) into people from jsonb_array_elements_text(data->'memberIds');
   if not actor=any(people) or cardinality(people)<>(select count(distinct x) from unnest(people) x)
    or cardinality(people)>=(select count(*) from active_friends_private.proposal_members where proposal_id=offer.id)
    or exists(select 1 from unnest(people) x where not exists(select 1 from active_friends_private.proposal_members where proposal_id=offer.id and user_id=x)) then raise exception 'Roster must be a strict subset including you' using errcode='22023';end if;
   if offer.group_id is not null and exists(select 1 from active_friends_private.group_members where group_id=offer.group_id and left_at is null and not user_id=any(people)) then raise exception 'Cannot remove current group members through a proposal' using errcode='AF409';end if;
   select array_agg(distinct unit_id order by unit_id) into selected from active_friends_private.proposal_members where proposal_id=offer.id and user_id=any(people);
   if exists(select 1 from active_friends_private.unit_members m where m.unit_id=any(selected) and not m.user_id=any(people))
    or exists(select 1 from active_friends_private.units u where u.id=any(selected) and cardinality(people) not between minimum_size and maximum_size)
    or not active_friends_private.valid_roster(people,offer.starts_at,offer.ends_at,offer.place_id) then raise exception 'Smaller roster is not eligible' using errcode='AF409';end if;
   -- Release the original, keep waiting priority, and create a new immutable
   -- roster. Every remaining person, including the initiator, starts pending.
   perform active_friends_private.release_proposal(offer.id,'cancelled');
   insert into active_friends_private.proposals(group_id,starts_at,ends_at,place_id,expires_at,algorithm_version)
   values(offer.group_id,offer.starts_at,offer.ends_at,offer.place_id,clock_timestamp()+make_interval(secs=>(select review_seconds from active_friends_private.policy)),offer.algorithm_version) returning id into proposal;
   insert into active_friends_private.proposal_members(proposal_id,user_id,unit_id)
   select proposal,user_id,unit_id from active_friends_private.unit_members where unit_id=any(selected);
   update active_friends_private.units set state='reserved',last_outcome=null,proposal_id=proposal where id=any(selected);
  end if;
 else
  if not location_private.valid_uuid(data->>'groupId') then raise exception 'Invalid group' using errcode='22023';end if;
  if (action='ready' and ((select count(*) from jsonb_object_keys(data))<>2 or not data ?& array['groupId','ready'] or jsonb_typeof(data->'ready') is distinct from 'boolean'))
   or (action='rename' and ((select count(*) from jsonb_object_keys(data))<>2 or not data ?& array['groupId','name'] or jsonb_typeof(data->'name') is distinct from 'string' or char_length(data->>'name') not between 1 and 80 or public.profile_language_key(data->>'name')=''))
   or (action in('leave','cancel-growth') and data<>jsonb_build_object('groupId',data->'groupId')) then raise exception 'Unexpected group fields' using errcode='22023';end if;
  group_in:=(data->>'groupId')::uuid;
  select * into group_row from active_friends_private.groups where id=group_in for update;
  if not exists(select 1 from active_friends_private.group_members where group_id=group_in and user_id=actor and left_at is null) then raise exception 'Group unavailable' using errcode='42501';end if;
  if action='rename' then update active_friends_private.groups set name=data->>'name' where id=group_in;
  elsif action='leave' then update active_friends_private.group_members set left_at=clock_timestamp() where group_id=group_in and user_id=actor;
  elsif action='cancel-growth' or data->>'ready'='false' then
   for unit in select id from active_friends_private.units where group_id=group_in and state in('queued','reserved') order by id loop perform active_friends_private.cancel_unit(unit);end loop;
   delete from active_friends_private.ready where group_id=group_in;
  else
   if not active_friends_private.eligible(actor) or exists(select 1 from active_friends_private.occupancy where user_id=actor) then raise exception 'Already queued or not eligible' using errcode='AF409';end if;
   if (select count(*) from active_friends_private.group_members where group_id=group_in and left_at is null)>=group_row.target_size then raise exception 'Group is full' using errcode='AF409';end if;
   insert into active_friends_private.ready(group_id,user_id,revision) values(group_in,actor,group_row.revision) on conflict(group_id,user_id) do update set revision=excluded.revision;
   if not exists(select 1 from active_friends_private.group_members m where m.group_id=group_in and m.left_at is null and not exists(select 1 from active_friends_private.ready r where r.group_id=group_in and r.user_id=m.user_id and r.revision=group_row.revision)) then
    select array_agg(user_id order by user_id) into people from active_friends_private.group_members where group_id=group_in and left_at is null;
    if exists(select 1 from unnest(people) p where not active_friends_private.eligible(p) or exists(select 1 from active_friends_private.occupancy where user_id=p)) then raise exception 'A member is unavailable or already searching' using errcode='AF409';end if;
    insert into active_friends_private.units(group_id,group_revision,member_count,preferred_size,minimum_size,maximum_size,allow_existing)
     values(group_in,group_row.revision,cardinality(people),group_row.target_size,cardinality(people)+1,group_row.target_size,true) returning id into unit;
    insert into active_friends_private.unit_members select unit,p from unnest(people) p;
    insert into active_friends_private.occupancy select p,unit from unnest(people) p;
   end if;
  end if;
 end if;
 result:=active_friends_private.public_status(actor);
 insert into active_friends_private.commands(actor_id,request_id,payload,result) values(actor,request,command_in,jsonb_build_object('state',result->'state'));
 return result;
end $$;

create function active_friends_private.adult_account(person uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join auth.users u on u.id=p.id where p.id=person and p.is_active
  and u.is_anonymous is false and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp())
  and isfinite(p.birthdate) and extract(year from age((clock_timestamp() at time zone 'America/New_York')::date,p.birthdate))>=18);
$$;
create function active_friends_private.group_json(group_in uuid,actor uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare result jsonb;begin
 if not active_friends_private.adult_account(actor) or not exists(select 1 from active_friends_private.group_members where group_id=group_in and user_id=actor and left_at is null) then raise exception 'Group unavailable' using errcode='42501';end if;
 select jsonb_build_object('id',g.id,'name',g.name,'targetSize',g.target_size,'kind','friends_group','createdAt',g.created_at,
 'latestMessage',(select active_friends_private.message_json(x.id) from active_friends_private.messages x
  join active_friends_private.group_members own on own.group_id=g.id and own.user_id=actor and own.left_at is null
  where x.group_id=g.id and x.seq>=own.join_seq and (x.sender_id is null or x.sender_id=actor or public.safety_pair_allowed(actor,x.sender_id)) order by x.seq desc limit 1),
 'unreadCount',(select count(*) from active_friends_private.messages x join active_friends_private.group_members own on own.group_id=g.id and own.user_id=actor and own.left_at is null
  where x.group_id=g.id and x.seq>=own.join_seq and x.seq>own.read_seq and x.sender_id is distinct from actor and (x.sender_id is null or public.safety_pair_allowed(actor,x.sender_id))),
 'members',(select jsonb_agg(jsonb_build_object('id',m.user_id,
  'display_name',case when m.user_id=actor or public.safety_pair_allowed(actor,m.user_id) then coalesce(p.display_name,'Former member') else 'Member' end,
  'avatar_url',null,'last_read_seq',case when m.user_id=actor or public.safety_pair_allowed(actor,m.user_id) then m.read_seq else 0 end) order by m.user_id)
  from active_friends_private.group_members m left join public.profiles p on p.id=m.user_id where m.group_id=g.id and m.left_at is null),
 'searchState',coalesce((select u.state from active_friends_private.units u where u.group_id=g.id and u.state in('queued','reserved')),
  case when exists(select 1 from active_friends_private.ready where group_id=g.id and revision=g.revision) then 'readying' else 'idle' end),
 'readyMemberIds',coalesce((select jsonb_agg(user_id order by user_id) from active_friends_private.ready where group_id=g.id and revision=g.revision),'[]')) into result
 from active_friends_private.groups g where g.id=group_in;
 return result;
end $$;
create function public.get_active_friends_groups() returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=safety_private.actor();result jsonb;begin
 if not active_friends_private.adult_account(actor) then return '{"groups":[]}';end if;
 select jsonb_build_object('groups',coalesce(jsonb_agg(active_friends_private.group_json(id,actor) order by created_at desc),'[]')) into result
 from(select g.* from active_friends_private.groups g join active_friends_private.group_members m on m.group_id=g.id and m.user_id=actor and m.left_at is null order by g.created_at desc limit 100) visible;
 return result;
end $$;
create function public.get_active_friends_group(group_in uuid) returns jsonb
language sql volatile security definer set search_path='' as $$ select active_friends_private.group_json(group_in,safety_private.actor()); $$;
create function active_friends_private.message_json(message_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',m.id,'conversation_id',m.group_id,'seq',m.seq,'sender_id',m.sender_id,'body',m.body,'created_at',m.created_at)
 from active_friends_private.messages m where m.id=message_id;
$$;
create function public.active_friends_history(group_in uuid,before_in bigint default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=safety_private.actor();boundary bigint;result jsonb;begin
 if not active_friends_private.adult_account(actor) then raise exception 'Group unavailable' using errcode='42501';end if;
 select join_seq into boundary from active_friends_private.group_members where group_id=group_in and user_id=actor and left_at is null;
 if not found then raise exception 'Group unavailable' using errcode='42501';end if;
 if before_in is not null and before_in not between 1 and 9007199254740991 then raise exception 'Invalid cursor' using errcode='22023';end if;
 select jsonb_build_object('messages',coalesce(jsonb_agg(active_friends_private.message_json(m.id) order by m.seq),'[]'),
 'nextCursor',case when count(*)=100 then min(m.seq) else null end) into result from(
  select x.* from active_friends_private.messages x where x.group_id=group_in and x.seq>=boundary and (before_in is null or x.seq<before_in)
   and (x.sender_id is null or x.sender_id=actor or public.safety_pair_allowed(actor,x.sender_id))
  order by x.seq desc limit 100) m;
 return result;
end $$;
create function public.active_friends_send(group_in uuid,body_in text,request_in uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=safety_private.actor();message active_friends_private.messages;sequence bigint;peer uuid;begin
 if body_in is null or char_length(body_in) not between 1 and 2000 or public.profile_language_key(body_in)='' or request_in is null then raise exception 'Invalid message' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('active-friends-message:'||actor::text,0));
 perform 1 from active_friends_private.groups where id=group_in for update;
 if not exists(select 1 from active_friends_private.group_members where group_id=group_in and user_id=actor and left_at is null)
 or not active_friends_private.adult_account(actor) then raise exception 'Group unavailable' using errcode='42501';end if;
 -- Serialize against bilateral block changes. Blocked members remain in the
 -- group but cannot see each other's new messages; other members may continue.
 for peer in select user_id from active_friends_private.group_members where group_id=group_in and left_at is null and user_id<>actor order by user_id loop perform social_private.lock_pair(actor,peer);end loop;
 select * into message from active_friends_private.messages where sender_id=actor and request_id=request_in;
 if found then
  if message.group_id<>group_in or message.body<>body_in
   or message.seq<(select join_seq from active_friends_private.group_members where group_id=group_in and user_id=actor and left_at is null) then raise exception 'Message retry changed or predates join' using errcode='AF409';end if;
  return active_friends_private.message_json(message.id);
 end if;
 update active_friends_private.groups set next_seq=next_seq+1 where id=group_in and next_seq<9007199254740991 returning next_seq-1 into sequence;
 if sequence is null then raise exception 'Message sequence exhausted' using errcode='AF409';end if;
 insert into active_friends_private.messages(group_id,seq,sender_id,body,request_id) values(group_in,sequence,actor,body_in,request_in) returning * into message;
 return active_friends_private.message_json(message.id);
end $$;
create function public.active_friends_read(group_in uuid,seq_in bigint) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=safety_private.actor();boundary bigint;position bigint;begin
 if not active_friends_private.adult_account(actor) then raise exception 'Group unavailable' using errcode='42501';end if;
 select join_seq into boundary from active_friends_private.group_members where group_id=group_in and user_id=actor and left_at is null for update;
 if not found then raise exception 'Group unavailable' using errcode='42501';end if;
 if seq_in is null or seq_in not between 0 and 9007199254740991 or (seq_in<>0 and not exists(select 1 from active_friends_private.messages m where m.group_id=group_in and m.seq=seq_in and m.seq>=boundary and (m.sender_id is null or m.sender_id=actor or public.safety_pair_allowed(actor,m.sender_id)))) then raise exception 'Invalid read position' using errcode='22023';end if;
 update active_friends_private.group_members set read_seq=greatest(read_seq,seq_in) where group_id=group_in and user_id=actor returning read_seq into position;
 return jsonb_build_object('lastReadSeq',position);
end $$;
create function public.sweep_active_friends() returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare item record;begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker only' using errcode='42501';end if;
 perform active_friends_private.expire_due();
 for item in select u.id from active_friends_private.units u where u.state='queued' and
  (u.member_count<>(select count(*) from active_friends_private.unit_members where unit_id=u.id)
  or exists(select 1 from active_friends_private.unit_members m where m.unit_id=u.id and not active_friends_private.eligible(m.user_id))
  or exists(select 1 from active_friends_private.unit_members a join active_friends_private.unit_members b on b.unit_id=a.unit_id and a.user_id<b.user_id where a.unit_id=u.id and not active_friends_private.pair_allowed(a.user_id,b.user_id))) order by u.id limit 100 for update skip locked loop
  perform active_friends_private.cancel_unit(item.id);
 end loop;
 delete from active_friends_private.commands where created_at<clock_timestamp()-interval '30 days';
 return '{"ok":true}';
end $$;
create function active_friends_private.maintenance() returns void
language plpgsql volatile security definer set search_path='' as $$
begin
 perform active_friends_private.expire_due();
 delete from active_friends_private.commands where created_at<clock_timestamp()-interval '30 days';
 delete from active_friends_private.proposals where state<>'reserved' and closed_at<clock_timestamp()-interval '30 days';
 delete from active_friends_private.units u where u.state not in('queued','reserved') and coalesce(u.finished_at,u.created_at)<clock_timestamp()-interval '30 days'
  and not exists(select 1 from active_friends_private.occupancy where unit_id=u.id)
  and not exists(select 1 from active_friends_private.proposal_members where unit_id=u.id);
end $$;
create function public.reconcile_active_friends_job(unit_in uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare entry active_friends_private.units;begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker only' using errcode='42501';end if;
 select * into entry from active_friends_private.units where id=unit_in;
 return jsonb_build_object('state',case when entry.state in('reserved','formed') then 'reserved' when entry.state='queued' and entry.lease_token is null then 'waiting' else 'uncertain' end,
  'processed',case when entry.state in('reserved','formed') then 1 else 0 end);
end $$;

revoke all on all functions in schema active_friends_private from public,anon,authenticated;
revoke all on function public.claim_active_friends_job(),public.finish_active_friends_job(uuid,uuid,jsonb),public.sweep_active_friends(),public.reconcile_active_friends_job(uuid) from public,anon,authenticated;
grant execute on function public.claim_active_friends_job(),public.finish_active_friends_job(uuid,uuid,jsonb),public.sweep_active_friends(),public.reconcile_active_friends_job(uuid) to service_role;
revoke all on function public.get_active_friends_status(),public.active_friends_command(jsonb),public.get_active_friends_groups(),public.get_active_friends_group(uuid),public.active_friends_history(uuid,bigint),public.active_friends_send(uuid,text,uuid),public.active_friends_read(uuid,bigint) from public,anon,authenticated;
grant execute on function public.get_active_friends_status(),public.active_friends_command(jsonb),public.get_active_friends_groups(),public.get_active_friends_group(uuid),public.active_friends_history(uuid,bigint),public.active_friends_send(uuid,text,uuid),public.active_friends_read(uuid,bigint) to authenticated;
do $$ declare role_in text;f record;begin
 foreach role_in in array array['anon','authenticated'] loop
  if has_schema_privilege(role_in::name,'active_friends_private','USAGE') or has_function_privilege(role_in::name,'public.claim_active_friends_job()','EXECUTE') then raise exception 'Private active matching access' using errcode='42501';end if;
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='active_friends_private' loop
   if has_function_privilege(role_in::name,f.oid,'EXECUTE') then raise exception 'Inherited helper execute' using errcode='42501';end if;
  end loop;
 end loop;
end $$;
-- Use an existing pg_cron installation when available. Otherwise the bounded
-- worker command must be scheduled by the deployment; reads/actions also expire
-- their own stale proposals, and an expired proposal can never form a group.
do $$ begin
 if to_regprocedure('cron.schedule(text,text,text)') is not null then
  if exists(select 1 from cron.job where jobname='pebble-active-friends-expiry-v1') then raise exception 'Active expiry job already exists; review it before installation';end if;
  perform cron.schedule('pebble-active-friends-expiry-v1','* * * * *','select active_friends_private.maintenance();');
 end if;
end $$;
commit;
