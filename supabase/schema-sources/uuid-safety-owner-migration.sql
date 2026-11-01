-- Native UUID messaging activation. Keeps existing conversations, message IDs,
-- membership, read positions, sender request IDs and service-only messaging RPCs.
-- Uses the existing owner block/report and pair-lock implementation; UUID chat
-- access is mediated by the actor-bound social wrappers installed next.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
do $$ declare t text; signature text; begin
 if current_setting('server_encoding')<>'UTF8' or to_regnamespace('safety_private') is not null
 or to_regprocedure('public.messaging_history(uuid,uuid,bigint,bigint)') is null
 or to_regprocedure('public.messaging_send(uuid,uuid,text,uuid)') is null
 or to_regprocedure('public.messaging_sync_connection()') is null
 then raise exception 'Native UUID messaging prerequisites missing' using errcode='22023';end if;
 foreach t in array array['profiles','blocks','connections','conversations','messages','conversation_participants','dating_matches'] loop
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=t and c.relkind='r' and pg_get_userbyid(c.relowner)=current_user and not c.relforcerowsecurity) then
   raise exception 'Native messaging table owner mismatch: %',t using errcode='42501';end if;
 end loop;
 if (select atttypid from pg_attribute where attrelid='public.conversations'::regclass and attname='id' and not attisdropped) is distinct from 'uuid'::regtype
 or (select atttypid from pg_attribute where attrelid='public.messages'::regclass and attname='id' and not attisdropped) is distinct from 'uuid'::regtype
 or (select atttypid from pg_attribute where attrelid='public.messages'::regclass and attname='seq' and not attisdropped) is distinct from 'bigint'::regtype
 or exists(select 1 from public.blocks where blocker_id=blocked_id)
 then raise exception 'Native messaging shape mismatch' using errcode='22023';end if;
 if not exists(select 1 from pg_trigger where tgrelid='public.connections'::regclass and tgname='messaging_sync_connection' and tgfoid='public.messaging_sync_connection()'::regprocedure and tgenabled='O') then
  raise exception 'Native connection lifecycle trigger missing' using errcode='22023';end if;
 foreach signature in array array['public.messaging_history(uuid,uuid,bigint,bigint)','public.messaging_send(uuid,uuid,text,uuid)','public.messaging_mark_read(uuid,uuid,bigint)'] loop
  if has_function_privilege('anon',signature,'EXECUTE') or has_function_privilege('authenticated',signature,'EXECUTE')
  or not has_function_privilege('service_role',signature,'EXECUTE') then raise exception 'Native messaging ACL mismatch' using errcode='42501';end if;
 end loop;
end $$;
create function public.safety_pair_allowed(first_id uuid,second_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select first_id is not null and second_id is not null and first_id<>second_id and not exists(select 1 from public.blocks b where (b.blocker_id=first_id and b.blocked_id=second_id) or (b.blocker_id=second_id and b.blocked_id=first_id));
$$;
revoke all on function public.safety_pair_allowed(uuid,uuid) from public,anon,authenticated;
create schema safety_private;
revoke all on schema safety_private from public,anon,authenticated;

create function safety_private.lock_pair(a uuid,b uuid) returns void language plpgsql volatile security definer set search_path='' as $$
begin
  if current_setting('transaction_isolation')<>'read committed' then raise exception 'READ COMMITTED required' using errcode='25001'; end if;
  if a is null or b is null or a=b then raise exception 'Invalid pair' using errcode='22023'; end if;
  -- Lock canonical FK endpoints in UUID order before the advisory pair key.
  -- Normal owner writes cannot hold the pair while waiting for profile deletion.
  perform 1 from public.profiles p where p.id in (a,b) order by p.id for key share;
  -- One canonical unordered-pair key, held through commit. Hash collisions only
  -- over-serialize; they cannot admit an excluded pair. No table-wide lock.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pebble.safety.pair.v1:'||least(a,b)::text||':'||greatest(a,b)::text,0));
end $$;
create function safety_private.actor() returns uuid language plpgsql stable set search_path='' as $$
declare actor uuid:=auth.uid(); begin
  if actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
  return actor;
end $$;
create function safety_private.maintenance() returns boolean language sql stable set search_path='' as $$
  -- SECURITY DEFINER current_user is not evidence of maintenance authority.
  -- SET ROLE authenticated on an executor session must still exercise browser checks.
  select current_setting('role') not in ('anon','authenticated') and exists(
    select 1 from pg_catalog.pg_roles where rolname=session_user and (rolsuper or rolbypassrls));
$$;
create table safety_private.revoked_connections(connection_id bigint primary key);
-- Not a block store: an existing relationship ID is permanently quarantined on
-- block so unblock cannot reactivate its acceptance. No row/history deletion.
-- No FK lock on the connection row: pair serialization governs this marker.
create table safety_private.reports (
  actor_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null, id uuid not null unique default pg_catalog.gen_random_uuid(),
  target_id uuid not null, reason text not null check (reason in ('Harassment','Inappropriate content','Impersonation','Safety concern','Other')),
  context text not null check (char_length(context)<=1000), received_at timestamptz not null default statement_timestamp(),
  primary key(actor_id,request_id)
);
-- Target intentionally has no profile FK: report intake is not an existence/name oracle.
create index safety_reports_actor_time on safety_private.reports(actor_id,received_at);
alter table safety_private.revoked_connections enable row level security;
alter table safety_private.reports enable row level security;
revoke all on safety_private.revoked_connections,safety_private.reports from public,anon,authenticated;

create function safety_private.contact_allowed(a uuid,b uuid) returns boolean language sql stable security definer set search_path='' as $$
  select public.safety_pair_allowed(a,b) and exists(select 1 from public.connections c
    where c.user_a=least(a,b) and c.user_b=greatest(a,b) and c.status='accepted'
      and not exists(select 1 from safety_private.revoked_connections r where r.connection_id=c.id));
$$;
create function safety_private.guard_blocks() returns trigger language plpgsql volatile security definer set search_path='' as $$
declare a uuid; b uuid; actor uuid:=auth.uid(); cleanup boolean;
begin
  if tg_op='UPDATE' then raise exception 'Block identity/metadata is immutable' using errcode='42501'; end if;
  if tg_op='DELETE' then a:=old.blocker_id; b:=old.blocked_id; else a:=new.blocker_id; b:=new.blocked_id; end if;
  cleanup:=tg_op='DELETE' and (not exists(select 1 from public.profiles where id=a) or not exists(select 1 from public.profiles where id=b));
  if not cleanup and not safety_private.maintenance() and actor is distinct from a then raise exception 'Owner block mutation required' using errcode='42501'; end if;
  perform safety_private.lock_pair(a,b);
  if tg_op='INSERT' then
    new.created_at:=statement_timestamp();
    insert into safety_private.revoked_connections(connection_id)
      select c.id from public.connections c where c.user_a=least(a,b) and c.user_b=greatest(a,b) on conflict do nothing;
    return new;
  end if;
  return old;
end $$;
create trigger safety_blocks_guard before insert or update or delete on public.blocks for each row execute function safety_private.guard_blocks();
-- Existing accepted/pending relationships of already-blocked pairs are also inert.
insert into safety_private.revoked_connections(connection_id)
  select c.id from public.connections c where exists(select 1 from public.blocks b where (b.blocker_id=c.user_a and b.blocked_id=c.user_b) or (b.blocker_id=c.user_b and b.blocked_id=c.user_a));

create function safety_private.guard_connections() returns trigger language plpgsql volatile security definer set search_path='' as $$
declare a uuid; b uuid; actor uuid:=auth.uid(); cleanup boolean; begin
  if tg_op='DELETE' then a:=old.user_a; b:=old.user_b; else a:=new.user_a; b:=new.user_b; end if;
  if tg_op='UPDATE' and row(new.id,new.user_a,new.user_b,new.initiated_by,new.created_at) is distinct from row(old.id,old.user_a,old.user_b,old.initiated_by,old.created_at) then raise exception 'Immutable connection identity' using errcode='42501'; end if;
  cleanup:=tg_op='DELETE' and (not exists(select 1 from public.profiles where id=a) or not exists(select 1 from public.profiles where id=b));
  if not cleanup and not safety_private.maintenance() and (actor is null or (actor<>a and actor<>b)) then raise exception 'Connection unavailable' using errcode='42501'; end if;
  perform safety_private.lock_pair(a,b);
  if tg_op='DELETE' then return old; end if;
  if not public.safety_pair_allowed(a,b) then raise exception 'Contact unavailable' using errcode='42501'; end if;
  if tg_op='INSERT' then
    if new.initiated_by is distinct from actor or new.status<>'pending' then raise exception 'Actor-bound pending request required' using errcode='42501'; end if;
    new.created_at:=statement_timestamp(); new.responded_at:=null;
  else
    if old.status<>'pending' or new.status<>'accepted' or actor=old.initiated_by
      or exists(select 1 from safety_private.revoked_connections where connection_id=old.id) then raise exception 'Acceptance unavailable' using errcode='42501'; end if;
    new.responded_at:=statement_timestamp();
  end if;
  return new;
end $$;
-- After the historical insert normalizer/rate trigger; BEFORE any after-update
-- conversation creation. UPDATE/ON CONFLICT retargeting cannot bypass this guard.
create trigger zz_safety_connections_guard before insert or update or delete on public.connections for each row execute function safety_private.guard_connections();

-- The existing UUID messaging tables and lifecycle triggers are retained.
create function safety_private.guard_dating() returns trigger language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid(); begin
  if tg_op='UPDATE' and row(new.id,new.user_a,new.user_b,new.initiated_by,new.created_at) is distinct from row(old.id,old.user_a,old.user_b,old.initiated_by,old.created_at) then raise exception 'Immutable Dating pair identity' using errcode='42501'; end if;
  if actor is null or (actor is distinct from new.user_a and actor is distinct from new.user_b) then raise exception 'Dating unavailable' using errcode='42501'; end if;
  perform safety_private.lock_pair(new.user_a,new.user_b);
  if not public.safety_pair_allowed(new.user_a,new.user_b) then raise exception 'Dating unavailable' using errcode='42501'; end if;
  -- No real Dating admission until aggregate/reciprocity/discovery are consumed.
  raise exception 'Legacy Dating admissions unavailable' using errcode='42501';
end $$;
create trigger safety_dating_guard before insert or update on public.dating_matches for each row execute function safety_private.guard_dating();

create function public.get_owner_block_state(target_in uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=safety_private.actor(); begin
  if target_in is null or target_in=actor then raise exception 'Invalid target' using errcode='22023'; end if;
  return jsonb_build_object('targetId',target_in,'outgoingBlocked',exists(select 1 from public.blocks where blocker_id=actor and blocked_id=target_in),'enforcement','contact-mutations-only');
end $$;
create or replace function public.get_owner_blocklist() returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=safety_private.actor(); result jsonb; begin
  select coalesce(jsonb_agg(jsonb_build_object('targetId',b.blocked_id,'displayName',null,'blockedAt',case when isfinite(b.created_at) then b.created_at else null end) order by b.blocked_id),'[]'::jsonb) into result
    from public.blocks b where b.blocker_id=actor;
  return jsonb_build_object('enforcement','contact-mutations-only','blocks',result);
end $$;
create function public.block_owner_target(target_in uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=safety_private.actor(); begin
  perform safety_private.lock_pair(actor,target_in);
  insert into public.blocks(blocker_id,blocked_id) values(actor,target_in) on conflict(blocker_id,blocked_id) do nothing;
  return public.get_owner_block_state(target_in);
end $$;
create function public.unblock_owner_target(target_in uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=safety_private.actor(); begin
  perform safety_private.lock_pair(actor,target_in);
  delete from public.blocks where blocker_id=actor and blocked_id=target_in;
  -- No connection recreation, marker removal, conversation deletion or reverse unblock.
  return public.get_owner_block_state(target_in);
end $$;

create function safety_private.report_receipt(r safety_private.reports) returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',(r).id,'requestId',(r).request_id,'targetId',(r).target_id,'receivedAt',to_char((r).received_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'status','received');
$$;
create function public.get_owner_safety_report(request_id_in uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=safety_private.actor(); r safety_private.reports; begin
  select saved.* into r from safety_private.reports saved where saved.actor_id=actor and saved.request_id=request_id_in;
  if not found then raise exception 'Owner receipt unavailable' using errcode='PT404'; end if;
  return safety_private.report_receipt(r);
end $$;
create function public.submit_safety_report(report_in jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=safety_private.actor(); request_key uuid; target uuid; k text; r safety_private.reports;
begin
  if current_setting('transaction_isolation')<>'read committed' then raise exception 'READ COMMITTED required' using errcode='25001'; end if;
  if jsonb_typeof(report_in) is distinct from 'object' then raise exception 'Invalid report' using errcode='22023'; end if;
  if (select count(*) from jsonb_object_keys(report_in))<>4 or not report_in ?& array['requestId','targetId','reason','context'] then raise exception 'Invalid report fields' using errcode='22023'; end if;
  foreach k in array array['requestId','targetId'] loop
    if jsonb_typeof(report_in->k) is distinct from 'string' or char_length(report_in->>k)<>36
      or (report_in->>k collate "C") !~ '^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$' then raise exception 'Invalid report UUID' using errcode='22023'; end if;
  end loop;
  if jsonb_typeof(report_in->'reason') is distinct from 'string' or (report_in->>'reason' collate "C") not in ('Harassment','Inappropriate content','Impersonation','Safety concern','Other')
    or jsonb_typeof(report_in->'context') is distinct from 'string' or char_length(report_in->>'context')>1000 then raise exception 'Invalid report text' using errcode='22023'; end if;
  request_key:=(report_in->>'requestId')::uuid; target:=(report_in->>'targetId')::uuid;
  if target=actor then raise exception 'Invalid report target' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pebble.safety.report.v1:'||actor::text,0));
  select saved.* into r from safety_private.reports saved where saved.actor_id=actor and saved.request_id=request_key;
  if found then
    if r.target_id<>target or (r.reason collate "C") is distinct from (report_in->>'reason' collate "C") or (r.context collate "C") is distinct from (report_in->>'context' collate "C") then raise exception 'Report request conflict' using errcode='SR409'; end if;
    return safety_private.report_receipt(r);
  end if;
  if (select count(*) from safety_private.reports where actor_id=actor and received_at>statement_timestamp()-interval '1 hour')>=5
    or (select count(*) from safety_private.reports where actor_id=actor and received_at>statement_timestamp()-interval '24 hours')>=20 then raise exception 'Report intake rate limited' using errcode='SR429'; end if;
  insert into safety_private.reports(actor_id,request_id,target_id,reason,context) values(actor,request_key,target,report_in->>'reason',report_in->>'context') returning * into r;
  return safety_private.report_receipt(r);
end $$;

-- Withdraw browser bypasses, including column grants. Old permissive policies do
-- not override a missing grant. Privileged legacy DML still traverses the guards.
do $$ declare t text; cols text; seq text; r text; sig text; begin
  foreach t in array array['blocks','connections','conversations','messages','dating_matches'] loop
    execute format('revoke all on table public.%I from public,anon,authenticated',t);
    select string_agg(quote_ident(attname),',') into cols from pg_catalog.pg_attribute where attrelid=('public.'||t)::regclass and attnum>0 and not attisdropped;
    execute format('revoke all (%s) on table public.%I from public,anon,authenticated',cols,t);
    seq:=case when t='blocks' then null else pg_get_serial_sequence('public.'||t,'id') end;
    if seq is not null then execute format('revoke all on sequence %s from public,anon,authenticated',seq); end if;
    foreach r in array array['anon','authenticated'] loop
      if seq is not null and has_sequence_privilege(r::name,seq,'SELECT,USAGE,UPDATE') then raise exception 'Inherited sequence bypass requires review: % %',r,seq using errcode='42501'; end if;
      if has_table_privilege(r::name,'public.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_any_column_privilege(r::name,'public.'||t,'SELECT') or has_any_column_privilege(r::name,'public.'||t,'INSERT') or has_any_column_privilege(r::name,'public.'||t,'UPDATE') or has_any_column_privilege(r::name,'public.'||t,'REFERENCES') then raise exception 'Inherited browser bypass requires review: % %',r,t using errcode='42501'; end if;
    end loop;
  end loop;
  -- Historical read/receipt policy is undecided: withdraw, do not delete history
  -- or fabricate empty inbox/unread success. Legacy Dating stays unavailable.
  foreach sig in array array['public.get_incoming_requests()','public.get_sent_requests()','public.get_my_conversations()','public.get_unread_count()','public.mark_conversation_read(bigint)','public.get_dating_match()','public.request_dating_match(uuid)','public.accept_dating_match(bigint)','public.end_dating_match(bigint)'] loop
    if to_regprocedure(sig) is not null then
      execute format('revoke all on function %s from public,anon,authenticated',sig);
      foreach r in array array['anon','authenticated'] loop
        if has_function_privilege(r::name,sig,'EXECUTE') then raise exception 'Inherited legacy RPC bypass requires review: %',sig using errcode='42501'; end if;
      end loop;
    end if;
  end loop;
end $$;
revoke all on all functions in schema safety_private from public,anon,authenticated;
revoke all on function public.get_owner_blocklist(),public.get_owner_block_state(uuid),public.block_owner_target(uuid),public.unblock_owner_target(uuid),public.submit_safety_report(jsonb),public.get_owner_safety_report(uuid) from public,anon,authenticated;
grant execute on function public.get_owner_blocklist(),public.get_owner_block_state(uuid),public.block_owner_target(uuid),public.unblock_owner_target(uuid),public.submit_safety_report(jsonb),public.get_owner_safety_report(uuid) to authenticated;
do $$ declare r text; t text; f record; sig text; begin
  foreach r in array array['anon','authenticated'] loop
    if has_schema_privilege(r::name,'safety_private','USAGE,CREATE') then raise exception 'Inherited private schema access requires review' using errcode='42501'; end if;
    foreach t in array array['safety_private.reports','safety_private.revoked_connections'] loop
      if has_table_privilege(r::name,t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_any_column_privilege(r::name,t,'SELECT') or has_any_column_privilege(r::name,t,'INSERT') or has_any_column_privilege(r::name,t,'UPDATE') or has_any_column_privilege(r::name,t,'REFERENCES') then raise exception 'Inherited private table access requires review' using errcode='42501'; end if;
    end loop;
    for f in select p.oid from pg_catalog.pg_proc p where p.pronamespace='safety_private'::regnamespace loop
      if has_function_privilege(r::name,f.oid,'EXECUTE') then raise exception 'Inherited private helper access requires review' using errcode='42501'; end if;
    end loop;
  end loop;
  foreach sig in array array['public.get_owner_blocklist()','public.get_owner_block_state(uuid)','public.block_owner_target(uuid)','public.unblock_owner_target(uuid)','public.submit_safety_report(jsonb)','public.get_owner_safety_report(uuid)'] loop
    if has_function_privilege('anon',sig,'EXECUTE') then raise exception 'Inherited anonymous RPC access requires review' using errcode='42501'; end if;
  end loop;
end $$;
commit;
