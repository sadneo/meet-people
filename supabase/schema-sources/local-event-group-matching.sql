-- Local development group matching from persisted interests and weekly windows.
-- No embeddings, provider calls, ephemeral meetups or simulated memberships.
-- Retains the installed claim/rank/complete lease and consent protocol.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
do $$ begin
 if current_user<>'postgres' or to_regprocedure('public.profile_language_key(text)') is null
 or to_regprocedure('public.worker_rank_event_group(uuid,uuid)') is null
 or to_regprocedure('event_group_private.inputs_current(uuid)') is null
 or not exists(select 1 from pg_proc where oid='event_group_private.isolated_rank(uuid)'::regprocedure and pg_get_userbyid(proowner)=current_user and prosecdef)
 then raise exception 'Local group matching prerequisites/owner mismatch' using errcode='42501';end if;
end $$;
create or replace function event_group_private.isolated_rank(job_in uuid) returns uuid[]
language plpgsql security definer set search_path='' as $$
-- pebble-local-group-rank-v1
declare j event_group_private.jobs%rowtype; candidate record; chosen uuid[]:='{}';begin
 perform event_group_private.worker();
 perform event_group_private.scoring_allowed();
 select * into strict j from event_group_private.jobs where id=job_in and owner_id=auth.uid();
 if j.state<>'leased' or cardinality(j.candidate_ids) not between 2 and 8 or not event_group_private.inputs_current(j.id) then raise exception 'Local rank inputs unavailable' using errcode='PT409';end if;
 for candidate in
  select peer.id,
   (select count(distinct public.profile_language_key(a.text)) from public.user_interests a join public.user_interests b on b.profile_id=peer.id and public.profile_language_key(b.text)=public.profile_language_key(a.text) where a.profile_id=j.anchor_id) shared,
   (select coalesce(sum(greatest(0,extract(epoch from(least(a.end_time,b.end_time)-greatest(a.start_time,b.start_time))))),0) from public.availability a join public.availability b on b.profile_id=peer.id and b.dow=a.dow where a.profile_id=j.anchor_id) overlap_seconds,
   q.joined_at
  from unnest(j.candidate_ids) peer(id) join event_group_private.queue q on q.actor_id=peer.id and q.listing_id=j.listing_id
  where peer.id<>j.anchor_id and q.active and event_group_private.profile_valid(peer.id)
  and not exists(select 1 from public.connections c where (c.user_a=j.anchor_id and c.user_b=peer.id) or (c.user_b=j.anchor_id and c.user_a=peer.id))
  and public.safety_pair_allowed(j.anchor_id,peer.id)
  order by shared desc,overlap_seconds desc,q.joined_at,peer.id
 loop
  if not exists(select 1 from public.blocks b where (b.blocker_id=candidate.id and b.blocked_id=any(chosen)) or (b.blocked_id=candidate.id and b.blocker_id=any(chosen))) then
   chosen:=array_append(chosen,candidate.id);
   exit when cardinality(chosen)=3;
  end if;
 end loop;
 return chosen;
end $$;
revoke all on function event_group_private.isolated_rank(uuid) from public,anon,authenticated,service_role;
create or replace function public.claim_local_event_group_job(worker_id text,lease_seconds integer,anchor_id_in uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a uuid:=event_group_private.worker(); lid uuid; item record; l public.listings%rowtype;
 j event_group_private.jobs%rowtype; ids uuid[]; peers uuid[]; qrev jsonb; pfp jsonb; attempt_name text;
begin
 if worker_id is null or lease_seconds is null or lease_seconds not between 120 and 600
   or not exists(select 1 from event_group_private.workers w where w.actor_id=a and w.worker_id=claim_local_event_group_job.worker_id and w.enabled) then
  raise exception 'Invalid worker claim' using errcode='42501'; end if;
 -- Both server settings and registry must be enabled. No operator GUC bypass.
 if not exists(select 1 from event_group_private.settings where singleton and scoring_enabled) then return null; end if;
 -- Inspect only: NEVER take a job lock before its listing/profiles fence.
 -- Fixture-only queues wait for a person to join. Otherwise test contacts spend
 -- their enrollment attempts on each other before the development user arrives.
 for item in with targets as materialized (
  select distinct jj.listing_id from event_group_private.jobs jj
  join event_group_private.queue q on q.listing_id=jj.listing_id and q.actor_id=jj.anchor_id and q.active and q.revision=jj.anchor_revision
  where jj.state='pending' and (anchor_id_in is null or jj.anchor_id=anchor_id_in)
  and event_group_private.permit_available(q.attempt_permit)
  and not exists(select 1 from auth.users u where u.id=jj.anchor_id and u.raw_app_meta_data->>'pebble_demo_seed'='pebble-local-demo-v1')
 ), ready as materialized (
  select q.listing_id,q.actor_id,q.revision from event_group_private.queue q
  join targets on targets.listing_id=q.listing_id
  join public.listings ls on ls.id=q.listing_id and ls.listing_type='event' and ls.status in('active','rescheduled') and ls.starts_at>clock_timestamp()
  where q.active and event_group_private.permit_available(q.attempt_permit) and event_group_private.profile_valid(q.actor_id)
  and not exists(select 1 from event_group_private.proposals pr where pr.listing_id=q.listing_id and q.actor_id=any(pr.expected_members) and event_group_private.proposal_valid(pr.id))
  and not exists(select 1 from event_group_private.jobs busy where busy.listing_id=q.listing_id and busy.state in('leased','ranked') and busy.lease_until>clock_timestamp() and q.actor_id=any(busy.candidate_ids))
 ) select distinct x.listing_id from (
  select jj.listing_id,jj.created_at,jj.id from event_group_private.jobs jj
  join ready q on q.listing_id=jj.listing_id and q.actor_id=jj.anchor_id and q.revision=jj.anchor_revision
  where jj.state='pending' and (anchor_id_in is null or jj.anchor_id=anchor_id_in)
  and not exists(select 1 from auth.users u where u.id=jj.anchor_id and u.raw_app_meta_data->>'pebble_demo_seed'='pebble-local-demo-v1')
  and exists(select 1 from ready peer where peer.listing_id=jj.listing_id and peer.actor_id<>jj.anchor_id
   and not exists(select 1 from public.connections c where (c.user_a=jj.anchor_id and c.user_b=peer.actor_id) or (c.user_b=jj.anchor_id and c.user_a=peer.actor_id))
   and not exists(select 1 from public.blocks b where (b.blocker_id=jj.anchor_id and b.blocked_id=peer.actor_id) or (b.blocked_id=jj.anchor_id and b.blocker_id=peer.actor_id)))
  order by jj.created_at,jj.id limit 20
 ) x order by x.listing_id loop
  lid:=item.listing_id;
  select * into l from public.listings where id=lid for update skip locked;
  if not found then continue; end if;
  if l.listing_type<>'event' or l.status not in ('active','rescheduled') or l.starts_at is null or l.starts_at<=clock_timestamp() then continue; end if;
  perform event_group_private.lock_profiles('{}'::uuid[]);
  -- Past leases are terminal, never reclaimed. Reconcile/fail materialize expired
  -- state; claim only reads them and never takes a job lock before profile locks.
  for j in select jj.* from event_group_private.jobs jj join event_group_private.queue q
    on q.listing_id=jj.listing_id and q.actor_id=jj.anchor_id and q.active and q.revision=jj.anchor_revision
    where jj.listing_id=lid and jj.state='pending' and (anchor_id_in is null or jj.anchor_id=anchor_id_in)
     and not exists(select 1 from auth.users u where u.id=jj.anchor_id and u.raw_app_meta_data->>'pebble_demo_seed'='pebble-local-demo-v1')
     and event_group_private.permit_available(q.attempt_permit)
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

revoke all on function public.claim_local_event_group_job(text,integer,uuid) from public,anon,authenticated,service_role;
grant execute on function public.claim_local_event_group_job(text,integer,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
