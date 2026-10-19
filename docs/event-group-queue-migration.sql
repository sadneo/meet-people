-- CANDIDATE ONLY. Parent install target: 20261009060000_event_group_queue.sql.
-- No application here. Requires the existing Winso and profile RPC migrations.
-- No legacy rows/consents are copied. No scheduler, worker identity or scoring
-- enablement is provisioned. See event-group-queue-sql-README.md before testing.
begin;

create schema event_group_private;
revoke all on schema event_group_private from public, anon, authenticated, service_role;

create table event_group_private.settings (
 singleton boolean primary key default true check (singleton),
 scoring_enabled boolean not null default false
);
insert into event_group_private.settings(singleton) values(true);
create table event_group_private.workers (
 actor_id uuid primary key references auth.users(id) on delete cascade,
 worker_id text not null unique check (worker_id ~ '^[a-zA-Z0-9_-]{1,64}$'),
 enabled boolean not null default false
);
create table event_group_private.queue (
 listing_id uuid not null references public.listings(id) on delete cascade,
 actor_id uuid not null references public.profiles(id) on delete cascade,
 revision bigint not null default 1 check (revision > 0),
 attempt_permit uuid not null default gen_random_uuid() unique,
 active boolean not null default true,
 joined_at timestamptz not null default clock_timestamp(),
 primary key(listing_id,actor_id)
);
create table event_group_private.proposals (
 id uuid primary key default gen_random_uuid(),
 listing_id uuid not null references public.listings(id) on delete cascade,
 anchor_id uuid not null references public.profiles(id) on delete cascade,
 expected_members uuid[] not null check (cardinality(expected_members) between 2 and 4
   and array_position(expected_members,null) is null and expected_members[1]=anchor_id),
 listing_fingerprint text not null,
 state text not null default 'active' check (state in ('active','cancelled')),
 created_at timestamptz not null default clock_timestamp(),
 unique(id,listing_id)
);
create table event_group_private.members (
 proposal_id uuid not null,
 listing_id uuid not null,
 actor_id uuid not null,
 queue_revision bigint not null,
 profile_fingerprint text not null,
 primary key(proposal_id,actor_id),
 foreign key(proposal_id,listing_id) references event_group_private.proposals(id,listing_id) on delete cascade,
 foreign key(listing_id,actor_id) references event_group_private.queue(listing_id,actor_id) on delete cascade
);
create table event_group_private.notifications (
 id uuid primary key default gen_random_uuid(),
 proposal_id uuid not null references event_group_private.proposals(id) on delete cascade,
 actor_id uuid not null references public.profiles(id) on delete cascade,
 read_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),
 unique(proposal_id,actor_id),
 foreign key(proposal_id,actor_id) references event_group_private.members(proposal_id,actor_id) on delete cascade
);
create index on event_group_private.notifications(actor_id,created_at desc,id);
create table event_group_private.jobs (
 id uuid primary key default gen_random_uuid(),
 listing_id uuid not null references public.listings(id) on delete cascade,
 anchor_id uuid not null references public.profiles(id) on delete cascade,
 anchor_revision bigint not null,
 state text not null default 'pending' check (state in ('pending','leased','ranked','completed','failed','expired')),
 owner_id uuid references auth.users(id) on delete set null,
 lease_token uuid,
 lease_until timestamptz,
 candidate_ids uuid[] not null default '{}',
 queue_revisions jsonb not null default '{}',
 profile_fingerprints jsonb not null default '{}',
 listing_fingerprint text,
 ranked_ids uuid[],
 proposal_id uuid references event_group_private.proposals(id) on delete set null,
 failure_reason text check (failure_reason in ('no_candidates','scoring_uncertain','completion_uncertain','invalidated')),
 created_at timestamptz not null default clock_timestamp(),
 unique(listing_id,anchor_id,anchor_revision),
 check (cardinality(candidate_ids) <= 8),
 check (ranked_ids is null or cardinality(ranked_ids) <= 7)
);
create index on event_group_private.jobs(state,created_at,id);

-- Defense in depth: schema is not exposed, privileges denied, RLS without policies.
alter table event_group_private.settings enable row level security;
alter table event_group_private.workers enable row level security;
alter table event_group_private.queue enable row level security;
alter table event_group_private.proposals enable row level security;
alter table event_group_private.members enable row level security;
alter table event_group_private.notifications enable row level security;
alter table event_group_private.jobs enable row level security;
revoke all on all tables in schema event_group_private from public,anon,authenticated,service_role;

create function event_group_private.actor() returns uuid
language plpgsql stable security definer set search_path='' as $$
declare a uuid := auth.uid();
begin
 if a is null then raise exception 'Not authenticated' using errcode='28000'; end if;
 return a;
end $$;
create function event_group_private.worker() returns uuid
language plpgsql stable security definer set search_path='' as $$
declare a uuid := event_group_private.actor();
begin
 if not exists(select 1 from event_group_private.workers w where w.actor_id=a and w.enabled) then
  raise exception 'Worker not authorized' using errcode='42501';
 end if;
 return a;
end $$;
create function event_group_private.scoring_allowed() returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from event_group_private.settings where singleton and scoring_enabled for share;
 if not found then raise exception 'Scoring disabled' using errcode='42501'; end if;
end $$;
create function event_group_private.fingerprint(value_in jsonb) returns text
language sql immutable set search_path='' as $$
 select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(value_in::text,'UTF8')),'hex');
$$;
create function event_group_private.listing_fingerprint(listing_in public.listings) returns text
language sql stable set search_path='' as $$
 select event_group_private.fingerprint(jsonb_build_object(
  'type',(listing_in).listing_type,'status',(listing_in).status,'title',(listing_in).title,
  'description',(listing_in).description,'category',(listing_in).category,
  'location_name',(listing_in).location_name,'address',(listing_in).address,'city',(listing_in).city,
  'region',(listing_in).region,'postal_code',(listing_in).postal_code,
  'latitude',(listing_in).latitude,'longitude',(listing_in).longitude,
  'starts_at',extract(epoch from (listing_in).starts_at),'ends_at',extract(epoch from (listing_in).ends_at)));
$$;
-- Sequence identity belongs to exactly one event/actor enrollment revision.
-- No public helper access, reset, reuse or cleanup on leave/job expiry.
create function event_group_private.permit_available(permit_in uuid) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare unused boolean;
begin
 if permit_in is null then return false; end if;
 execute format('select not is_called from event_group_private.%I','enroll_'||replace(permit_in::text,'-','')) into unused;
 return unused;
end $$;
create function event_group_private.profile_fingerprint(actor_in uuid) returns text
language sql stable security definer set search_path='' as $$
 select event_group_private.fingerprint(jsonb_build_object('profile',to_jsonb(p),
  'interests',coalesce((select jsonb_agg(to_jsonb(i) order by i.id) from public.user_interests i where i.profile_id=p.id),'[]'::jsonb),
  'availability',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from public.availability a where a.profile_id=p.id),'[]'::jsonb)))
 from public.profiles p where p.id=actor_in;
$$;
create function event_group_private.avatar(value_in text) returns text
language plpgsql immutable set search_path='' as $$
declare parts text[];
begin
 if value_in is null or char_length(value_in)>2048 then return null; end if;
 parts:=regexp_match(value_in,'^https://([a-z0-9]([a-z0-9.-]*[a-z0-9])?)(:([0-9]{1,5}))?([/?#][^[:space:]]*)?$','i');
 if parts is null or substring(parts[1] from '[^.]+$') !~* '^[a-z]([a-z0-9-]*[a-z0-9])?$'
   or (parts[4] is not null and parts[4]::integer>65535) then return null; end if;
 return value_in;
end $$;
create function event_group_private.profile_valid(actor_in uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=actor_in and p.is_active
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
-- No changes to old triggers/RLS. A deliberate global SHARE fence also excludes
-- raw child writes/phantoms that do not update profiles.updated_at. Existing save
-- RPC writes these tables in this order. Admin reverse-order transactions must
-- not run alongside workers. No child row locks or old advisory locks are acquired.
create function event_group_private.lock_profiles(actors_in uuid[]) returns void
language plpgsql security definer set search_path='' as $$
begin
 lock table public.profiles,public.user_interests,public.availability in share mode;
  perform 1 from public.profiles p where p.id=any(actors_in) order by p.id for share;
 -- Global social-write fences, always AFTER profile fences and BEFORE jobs.
 -- Also protect absence checks against INSERT phantoms through proposal commit.
 lock table public.blocks,public.connections in share mode;
end $$;
create function event_group_private.proposal_valid(proposal_in uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from event_group_private.proposals pr join public.listings l on l.id=pr.listing_id
  where pr.id=proposal_in and pr.state='active' and l.listing_type='event'
  and l.status in ('active','rescheduled') and l.starts_at>statement_timestamp()
  and pr.listing_fingerprint=event_group_private.listing_fingerprint(l)
  and cardinality(pr.expected_members)=(select count(*) from event_group_private.members m where m.proposal_id=pr.id)
  and (select count(distinct x) from unnest(pr.expected_members) x)=cardinality(pr.expected_members)
  and not exists(select 1 from event_group_private.members m left join event_group_private.queue q
    on q.listing_id=m.listing_id and q.actor_id=m.actor_id
    where m.proposal_id=pr.id and (q.active is distinct from true or q.revision is distinct from m.queue_revision
      or not(m.actor_id=any(pr.expected_members)) or not event_group_private.profile_valid(m.actor_id)
      or m.profile_fingerprint is distinct from event_group_private.profile_fingerprint(m.actor_id)))
  and not exists(select 1 from public.blocks b where b.blocker_id=any(pr.expected_members) and b.blocked_id=any(pr.expected_members))
  and not exists(select 1 from public.connections c where
    (c.user_a=pr.anchor_id and c.user_b=any(pr.expected_members)) or (c.user_b=pr.anchor_id and c.user_a=any(pr.expected_members))));
$$;
create function event_group_private.invalidate(listing_in uuid,actor_in uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 update event_group_private.proposals pr set state='cancelled'
 where pr.listing_id=listing_in and pr.state='active' and actor_in=any(pr.expected_members);
 update event_group_private.jobs j set state='failed',failure_reason='invalidated'
 where j.listing_id=listing_in and j.state in ('pending','leased','ranked')
   and (j.anchor_id=actor_in or actor_in=any(j.candidate_ids));
end $$;

create function public.get_event_group_queue(listing_id_in uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a uuid:=event_group_private.actor(); result jsonb;
begin
 if not exists(select 1 from public.listings where id=listing_id_in and listing_type='event') then
  raise exception 'Event not found' using errcode='PT404'; end if;
 if not exists(select 1 from event_group_private.queue where listing_id=listing_id_in and actor_id=a and active) then
  return jsonb_build_object('state','idle','proposal',null); end if;
 select jsonb_build_object('id',pr.id,'eventId',pr.listing_id,'members',
   (select jsonb_agg(jsonb_build_object('id',p.id,'name',regexp_replace(p.display_name,'^\s+|\s+$','','g'),
      'avatar',event_group_private.avatar(p.avatar_url)) order by u.n)
    from unnest(pr.expected_members) with ordinality u(id,n) join public.profiles p on p.id=u.id))
 into result from event_group_private.proposals pr
 where pr.listing_id=listing_id_in and a=any(pr.expected_members) and event_group_private.proposal_valid(pr.id)
 order by pr.created_at desc,pr.id limit 1;
 return jsonb_build_object('state',case when result is null then 'waiting' else 'proposal' end,'proposal',result);
end $$;
create function public.join_event_group_queue(listing_id_in uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a uuid:=event_group_private.actor(); l public.listings%rowtype; q event_group_private.queue%rowtype; permit_name text;
begin
 select * into l from public.listings where id=listing_id_in and listing_type='event' for update;
 if not found then raise exception 'Event not found' using errcode='PT404'; end if;
 if l.status not in ('active','rescheduled') or l.starts_at is null or l.starts_at<=clock_timestamp() then
  raise exception 'Event unavailable' using errcode='PT409'; end if;
 perform event_group_private.lock_profiles(array[a]);
 if not event_group_private.profile_valid(a) then raise exception 'Save active matching profile first' using errcode='PT409'; end if;
 select * into q from event_group_private.queue where listing_id=l.id and actor_id=a;
 if q.active then return public.get_event_group_queue(l.id); end if;
 perform event_group_private.invalidate(l.id,a);
 insert into event_group_private.queue(listing_id,actor_id) values(l.id,a)
 on conflict(listing_id,actor_id) do update set active=true,revision=event_group_private.queue.revision+1,
  attempt_permit=gen_random_uuid(),joined_at=clock_timestamp()
 returning * into q;
 permit_name:='enroll_'||replace(q.attempt_permit::text,'-','');
 execute format('create sequence event_group_private.%I start with 1 increment by 1 cache 1',permit_name);
 execute format('revoke all on sequence event_group_private.%I from public,anon,authenticated,service_role',permit_name);
 insert into event_group_private.jobs(listing_id,anchor_id,anchor_revision) values(l.id,a,q.revision);
 return public.get_event_group_queue(l.id);
end $$;
create function public.leave_event_group_queue(listing_id_in uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a uuid:=event_group_private.actor();
begin
 -- Still allowed on expired/cancelled events or without an active profile.
 perform 1 from public.listings where id=listing_id_in for update;
 if found then
  update event_group_private.queue set active=false where listing_id=listing_id_in and actor_id=a and active;
  perform event_group_private.invalidate(listing_id_in,a);
 end if;
 return jsonb_build_object('state','idle','proposal',null);
end $$;
create function public.get_matching_notifications() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a uuid:=event_group_private.actor(); result jsonb; unread integer;
begin
 select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'eventId',pr.listing_id,'proposalId',pr.id,
   'title','Group proposal to review','readAt',n.read_at,'createdAt',n.created_at) order by n.created_at desc,n.id),'[]'::jsonb),
   count(*) filter(where n.read_at is null)::integer
 into result,unread from (select * from event_group_private.notifications n0 where n0.actor_id=a
   and event_group_private.proposal_valid(n0.proposal_id) order by n0.created_at desc,n0.id limit 200) n
 join event_group_private.proposals pr on pr.id=n.proposal_id;
 return jsonb_build_object('notifications',result,'unreadCount',unread);
end $$;
create function public.mark_matching_notification_read(notification_id_in uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a uuid:=event_group_private.actor(); lid uuid;
begin
 select pr.listing_id into lid from event_group_private.notifications n join event_group_private.proposals pr on pr.id=n.proposal_id
 where n.id=notification_id_in and n.actor_id=a;
 if lid is not null then
  perform 1 from public.listings where id=lid for update;
  update event_group_private.notifications n set read_at=coalesce(n.read_at,clock_timestamp())
   where n.id=notification_id_in and n.actor_id=a and event_group_private.proposal_valid(n.proposal_id);
 end if;
 -- Missing, foreign and stale IDs all return the caller's unchanged feed.
 return public.get_matching_notifications();
end $$;

create function event_group_private.claim_peers(listing_in uuid,anchor_in uuid) returns uuid[]
language sql stable security definer set search_path='' as $$
 select coalesce(array_agg(s.actor_id order by s.joined_at,s.actor_id),'{}'::uuid[]) from (
  select q.actor_id,q.joined_at from event_group_private.queue q where q.listing_id=listing_in and q.active and q.actor_id<>anchor_in
   and event_group_private.profile_valid(q.actor_id)
   and event_group_private.permit_available(q.attempt_permit)
   and not exists(select 1 from public.connections c where (c.user_a=anchor_in and c.user_b=q.actor_id) or (c.user_b=anchor_in and c.user_a=q.actor_id))
   and not exists(select 1 from public.blocks b where (b.blocker_id=anchor_in and b.blocked_id=q.actor_id) or (b.blocked_id=anchor_in and b.blocker_id=q.actor_id))
   and not exists(select 1 from event_group_private.proposals pr where pr.listing_id=listing_in and q.actor_id=any(pr.expected_members) and event_group_private.proposal_valid(pr.id))
   and not exists(select 1 from event_group_private.jobs other where other.listing_id=listing_in and other.state in ('leased','ranked') and other.lease_until>clock_timestamp() and q.actor_id=any(other.candidate_ids))
  order by q.joined_at,q.actor_id limit 7) s;
$$;
create function public.claim_event_group_job(worker_id text,lease_seconds integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a uuid:=event_group_private.worker(); lid uuid; item record; l public.listings%rowtype;
 j event_group_private.jobs%rowtype; ids uuid[]; peers uuid[]; qrev jsonb; pfp jsonb; attempt_name text;
begin
 if worker_id is null or lease_seconds is null or lease_seconds not between 120 and 600
   or not exists(select 1 from event_group_private.workers w where w.actor_id=a and w.worker_id=claim_event_group_job.worker_id and w.enabled) then
  raise exception 'Invalid worker claim' using errcode='42501'; end if;
 -- Both server settings and registry must be enabled. No operator GUC bypass.
 if not exists(select 1 from event_group_private.settings where singleton and scoring_enabled) then return null; end if;
 -- Inspect only: NEVER take a job lock before its listing/profiles fence.
 for item in select distinct x.listing_id from (select jj.listing_id,jj.created_at,jj.id from event_group_private.jobs jj
   join event_group_private.queue q on q.listing_id=jj.listing_id and q.actor_id=jj.anchor_id and q.active and q.revision=jj.anchor_revision
   join public.listings ls on ls.id=jj.listing_id and ls.listing_type='event' and ls.status in ('active','rescheduled') and ls.starts_at>clock_timestamp()
    where jj.state='pending' and event_group_private.profile_valid(jj.anchor_id)
     and event_group_private.permit_available(q.attempt_permit)
    and cardinality(event_group_private.claim_peers(jj.listing_id,jj.anchor_id))>0
    and not exists(select 1 from event_group_private.proposals pr where pr.listing_id=jj.listing_id and jj.anchor_id=any(pr.expected_members) and event_group_private.proposal_valid(pr.id))
    and not exists(select 1 from event_group_private.jobs other where other.listing_id=jj.listing_id and other.state in ('leased','ranked') and other.lease_until>clock_timestamp() and jj.anchor_id=any(other.candidate_ids))
   order by jj.created_at,jj.id limit 20) x order by x.listing_id loop
  lid:=item.listing_id;
  select * into l from public.listings where id=lid for update skip locked;
  if not found then continue; end if;
  if l.listing_type<>'event' or l.status not in ('active','rescheduled') or l.starts_at is null or l.starts_at<=clock_timestamp() then continue; end if;
  perform event_group_private.lock_profiles('{}'::uuid[]);
  -- Past leases are terminal, never reclaimed. Reconcile/fail materialize expired
  -- state; claim only reads them and never takes a job lock before profile locks.
  for j in select jj.* from event_group_private.jobs jj join event_group_private.queue q
    on q.listing_id=jj.listing_id and q.actor_id=jj.anchor_id and q.active and q.revision=jj.anchor_revision
    where jj.listing_id=lid and jj.state='pending' and event_group_private.profile_valid(jj.anchor_id)
     and event_group_private.permit_available(q.attempt_permit)
     and cardinality(event_group_private.claim_peers(lid,jj.anchor_id))>0
     and not exists(select 1 from event_group_private.proposals pr where pr.listing_id=lid and jj.anchor_id=any(pr.expected_members) and event_group_private.proposal_valid(pr.id))
     and not exists(select 1 from event_group_private.jobs other where other.listing_id=lid and other.state in ('leased','ranked') and other.lease_until>clock_timestamp() and jj.anchor_id=any(other.candidate_ids))
    order by jj.created_at,jj.id limit 20 loop
   if not event_group_private.profile_valid(j.anchor_id)
    or exists(select 1 from event_group_private.proposals pr where j.anchor_id=any(pr.expected_members) and pr.listing_id=lid and event_group_private.proposal_valid(pr.id))
    or exists(select 1 from event_group_private.jobs other where other.listing_id=lid and other.state in ('leased','ranked') and other.lease_until>clock_timestamp() and j.anchor_id=any(other.candidate_ids)) then continue; end if;
   peers:=event_group_private.claim_peers(lid,j.anchor_id);
   if cardinality(peers)=0 then continue; end if; -- No rank/provider call on singleton work.
   ids:=array_prepend(j.anchor_id,peers);
   perform event_group_private.lock_profiles(ids);
   perform 1 from event_group_private.jobs where id=j.id and state='pending' for update skip locked;
   if not found then continue; end if;
   select jsonb_object_agg(q.actor_id::text,q.revision),jsonb_object_agg(q.actor_id::text,event_group_private.profile_fingerprint(q.actor_id))
     into qrev,pfp from event_group_private.queue q where q.listing_id=lid and q.actor_id=any(ids);
   -- nextval survives transaction/subtransaction abort. A sequence per job guards
   -- the provider boundary even if a cancelled rank rolls back the jobs UPDATE.
   -- No lease is ever renewed/reclaimed; retain this sequence with its terminal job.
   attempt_name:='rank_'||replace(j.id::text,'-','');
   execute format('create sequence event_group_private.%I start with 1 increment by 1 cache 1',attempt_name);
   execute format('revoke all on sequence event_group_private.%I from public,anon,authenticated,service_role',attempt_name);
   update event_group_private.jobs set state='leased',owner_id=a,lease_token=gen_random_uuid(),
    lease_until=clock_timestamp()+make_interval(secs=>lease_seconds),candidate_ids=ids,queue_revisions=qrev,
    profile_fingerprints=pfp,listing_fingerprint=event_group_private.listing_fingerprint(l) where id=j.id returning * into j;
   return jsonb_build_object('jobId',j.id,'leaseToken',j.lease_token,'eventId',lid,'anchorId',j.anchor_id);
  end loop;
 end loop;
 return null;
end $$;
create function event_group_private.lock_job(job_in uuid,token_in uuid) returns event_group_private.jobs
language plpgsql security definer set search_path='' as $$
declare a uuid:=event_group_private.worker(); j event_group_private.jobs%rowtype;
begin
 select * into j from event_group_private.jobs where id=job_in and owner_id=a and lease_token=token_in;
 if not found then raise exception 'Job unavailable' using errcode='PT409'; end if;
 perform 1 from public.listings where id=j.listing_id for update;
 if not found then raise exception 'Job unavailable' using errcode='PT409'; end if;
 perform event_group_private.lock_profiles(j.candidate_ids);
 select * into j from event_group_private.jobs where id=job_in and owner_id=a and lease_token=token_in for update;
 if not found then raise exception 'Job unavailable' using errcode='PT409'; end if;
 return j;
end $$;
create function event_group_private.inputs_current(job_in uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from event_group_private.jobs j join public.listings l on l.id=j.listing_id
  where j.id=job_in and l.listing_type='event' and l.status in ('active','rescheduled') and l.starts_at>clock_timestamp()
  and j.listing_fingerprint=event_group_private.listing_fingerprint(l)
  and cardinality(j.candidate_ids) between 2 and 8
  and not exists(select 1 from unnest(j.candidate_ids) u(id) left join event_group_private.queue q
    on q.listing_id=j.listing_id and q.actor_id=u.id where q.active is distinct from true
     or to_jsonb(q.revision) is distinct from j.queue_revisions->(u.id::text)
     or not event_group_private.profile_valid(u.id)
     or to_jsonb(event_group_private.profile_fingerprint(u.id)) is distinct from j.profile_fingerprints->(u.id::text)));
$$;
create function event_group_private.isolated_rank(job_in uuid) returns uuid[]
language plpgsql security definer set search_path='pg_catalog,public,pg_temp' as $$
declare j event_group_private.jobs%rowtype; l public.listings%rowtype; mid bigint; ranks uuid[];
 old_sub text:=current_setting('request.jwt.claim.sub',true); old_claims text:=current_setting('request.jwt.claims',true);
begin
 perform event_group_private.worker();
 perform event_group_private.scoring_allowed(); -- BEFORE any provider/helper invocation.
 if has_schema_privilege('anon','public','CREATE') or has_schema_privilege('authenticated','public','CREATE') then
  raise exception 'Unsafe legacy helper schema' using errcode='42501'; end if;
 select * into strict j from event_group_private.jobs where id=job_in and owner_id=auth.uid();
 select * into strict l from public.listings where id=j.listing_id;
 if cardinality(j.candidate_ids) not between 2 and 8 then raise exception 'Invalid universe' using errcode='PT409'; end if;
 -- ALL writes below are inside a deliberately aborted subtransaction. Never
 -- delete/reuse legacy interest, invoke interest embedding triggers or commit a
 -- temporary bridge. Returned local variables survive the intentional rollback.
 begin
  insert into public.meetups(host_id,title,description,category,location_name,latitude,longitude,starts_at,ends_at,is_public)
  values(null,l.title,l.description,l.category,l.location_name,l.latitude,l.longitude,l.starts_at,l.ends_at,false) returning id into mid;
  insert into public.event_interest(meetup_id,profile_id) select mid,u.id from unnest(j.candidate_ids) u(id);
  perform set_config('request.jwt.claim.sub',j.anchor_id::text,true);
  perform set_config('request.jwt.claims',(coalesce(nullif(old_claims,'')::jsonb,'{}'::jsonb)||jsonb_build_object('sub',j.anchor_id::text))::text,true);
  select coalesce(array_agg(r.profile_id order by r.n),'{}'::uuid[]) into ranks
    from public.get_event_matches(mid) with ordinality r(profile_id,username,display_name,avatar_url,bio,note,shared_interests,match_score,n);
  raise exception 'Discard ephemeral rank universe' using errcode='ZQ001';
 exception when sqlstate 'ZQ001' then null;
 end;
 perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
 perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
 if cardinality(ranks)>7 or (select count(distinct x) from unnest(ranks) x)<>cardinality(ranks)
   or exists(select 1 from unnest(ranks) x where x=j.anchor_id or not(x=any(j.candidate_ids))) then
  raise exception 'Invalid legacy rank result' using errcode='PT409'; end if;
 return ranks;
end $$;
create function public.worker_rank_event_group(job_id_in uuid,lease_token_in uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j event_group_private.jobs%rowtype; ranks uuid[]; ticket bigint; attempt_name text; enrollment record;
begin
 perform event_group_private.worker();
 perform event_group_private.scoring_allowed();
 j:=event_group_private.lock_job(job_id_in,lease_token_in);
 if j.state<>'leased' or j.lease_until<=clock_timestamp() or not event_group_private.inputs_current(j.id) then
  raise exception 'Rank prerequisites changed' using errcode='PT409'; end if;
 attempt_name:='event_group_private.rank_'||replace(j.id::text,'-','');
 ticket:=nextval(attempt_name::regclass);
 if ticket<>1 then raise exception 'Rank attempt already consumed; reconcile only' using errcode='PT409'; end if;
 -- All candidates, including unselected lower ranks, spend their enrollment.
 -- Listing serialization + input revision checks fence concurrent leave/rejoin.
 -- Sequence advances survive rank/outer transaction rollback: alternate pending
 -- anchor jobs cannot reuse any of these unchanged enrollment revisions.
 if exists(select 1 from event_group_private.queue q where q.listing_id=j.listing_id
   and q.actor_id=any(j.candidate_ids) and not event_group_private.permit_available(q.attempt_permit)) then
  raise exception 'Enrollment attempt already consumed; explicit rejoin required' using errcode='PT409'; end if;
 for enrollment in select q.attempt_permit from event_group_private.queue q
   where q.listing_id=j.listing_id and q.actor_id=any(j.candidate_ids) order by q.actor_id loop
  ticket:=nextval(('event_group_private.enroll_'||replace(enrollment.attempt_permit::text,'-',''))::regclass);
  if ticket<>1 then raise exception 'Enrollment attempt already consumed; explicit rejoin required' using errcode='PT409'; end if;
 end loop;
 begin
  ranks:=event_group_private.isolated_rank(j.id);
 exception when others then
  -- Do not forward embedding/provider error content to even a registered worker.
  raise exception 'Ranking outcome uncertain; reconcile only' using errcode='PT409';
 end;
 if j.lease_until<=clock_timestamp() then raise exception 'Lease expired during ranking' using errcode='PT409'; end if;
 update event_group_private.jobs set state='ranked',ranked_ids=ranks where id=j.id;
 return coalesce((select jsonb_agg(jsonb_build_object('profile_id',u.id) order by u.n) from unnest(ranks) with ordinality u(id,n)),'[]'::jsonb);
end $$;
create function public.complete_event_group_job(job_id_in uuid,lease_token_in uuid,members uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j event_group_private.jobs%rowtype; expected uuid[]; pr uuid;
begin
 j:=event_group_private.lock_job(job_id_in,lease_token_in);
 expected:=array_prepend(j.anchor_id,coalesce(j.ranked_ids[1:3],'{}'::uuid[]));
 if members is null or cardinality(members) not between 2 and 4 or members is distinct from expected
  or array_position(members,null) is not null or (select count(distinct x) from unnest(members) x)<>cardinality(members) then
  raise exception 'Unexpected proposal members' using errcode='PT409'; end if;
 if j.state='completed' then return jsonb_build_object('state','completed'); end if;
 if j.state<>'ranked' or j.ranked_ids is null or j.lease_until<=clock_timestamp() or not event_group_private.inputs_current(j.id) then
  raise exception 'Completion prerequisites changed' using errcode='PT409'; end if;
 if exists(select 1 from event_group_private.proposals p where p.listing_id=j.listing_id
   and p.expected_members && members and event_group_private.proposal_valid(p.id))
  or exists(select 1 from public.blocks b where b.blocker_id=any(members) and b.blocked_id=any(members))
  or exists(select 1 from public.connections c where (c.user_a=j.anchor_id and c.user_b=any(members)) or (c.user_b=j.anchor_id and c.user_a=any(members))) then
  raise exception 'Members no longer eligible' using errcode='PT409'; end if;
 insert into event_group_private.proposals(listing_id,anchor_id,expected_members,listing_fingerprint)
  values(j.listing_id,j.anchor_id,members,j.listing_fingerprint) returning id into pr;
 insert into event_group_private.members(proposal_id,listing_id,actor_id,queue_revision,profile_fingerprint)
  select pr,j.listing_id,u.id,(j.queue_revisions->>u.id::text)::bigint,j.profile_fingerprints->>u.id::text from unnest(members) u(id);
 insert into event_group_private.notifications(proposal_id,actor_id) select pr,u.id from unnest(members) u(id);
 update event_group_private.jobs set state='completed',proposal_id=pr where id=j.id;
 -- Supersede any other pending jobs for these users; no automatic rescore later.
 update event_group_private.jobs other set state='failed',failure_reason='invalidated'
  where other.listing_id=j.listing_id and other.id<>j.id and other.state='pending' and other.anchor_id=any(members);
 return jsonb_build_object('state','completed');
end $$;
create function public.fail_event_group_job(job_id_in uuid,lease_token_in uuid,reason_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j event_group_private.jobs%rowtype;
begin
 perform event_group_private.worker();
 if reason_code is null or reason_code not in ('no_candidates','scoring_uncertain','completion_uncertain') then
  raise exception 'Invalid failure reason' using errcode='22023'; end if;
 j:=event_group_private.lock_job(job_id_in,lease_token_in);
 if j.state='completed' then raise exception 'Already completed; reconcile only' using errcode='PT409'; end if;
 if j.state in ('leased','ranked') then
  update event_group_private.jobs set state=case when lease_until<=clock_timestamp() then 'expired' else 'failed' end,
   failure_reason=reason_code where id=j.id;
 end if;
 return jsonb_build_object('state','failed');
end $$;
create function public.reconcile_event_group_job(job_id_in uuid,lease_token_in uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j event_group_private.jobs%rowtype;
begin
 j:=event_group_private.lock_job(job_id_in,lease_token_in);
 if j.state in ('leased','ranked') and j.lease_until<=clock_timestamp() then
  update event_group_private.jobs set state='expired' where id=j.id; j.state:='expired';
 end if;
 return jsonb_build_object('state',case when j.state='ranked' then 'leased' else j.state end);
end $$;

revoke all on all functions in schema event_group_private from public,anon,authenticated,service_role;
revoke all on function public.get_event_group_queue(uuid),public.join_event_group_queue(uuid),public.leave_event_group_queue(uuid),
 public.get_matching_notifications(),public.mark_matching_notification_read(uuid),public.claim_event_group_job(text,integer),
 public.worker_rank_event_group(uuid,uuid),public.complete_event_group_job(uuid,uuid,uuid[]),
 public.fail_event_group_job(uuid,uuid,text),public.reconcile_event_group_job(uuid,uuid) from public,anon,service_role;
-- Worker uses an authenticated JWT, but a nonregistered/disabled actor is denied
-- inside every function BEFORE any private job lookup/provider operation.
grant execute on function public.get_event_group_queue(uuid),public.join_event_group_queue(uuid),public.leave_event_group_queue(uuid),
 public.get_matching_notifications(),public.mark_matching_notification_read(uuid),public.claim_event_group_job(text,integer),
 public.worker_rank_event_group(uuid,uuid),public.complete_event_group_job(uuid,uuid,uuid[]),
 public.fail_event_group_job(uuid,uuid,text),public.reconcile_event_group_job(uuid,uuid) to authenticated;
commit;
