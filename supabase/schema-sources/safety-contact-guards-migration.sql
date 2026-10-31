-- PARTIAL SAFETY CANDIDATE ONLY. NOT APPLIED OR SQL-EXECUTED BY THE AGENT.
-- Concrete narrow fixes, NOT authoritative all-surface blocking or UI activation.
-- Does NOT implement block/unblock/report mutation, moderation or delivery.
-- Parent must review owners, ACLs, dependencies and execute network-none role/race
-- tests. Remaining discovery/contact DML/RPC bypasses are mapped in settings-safety-backend.md.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
do $$ begin
  if to_regclass('public.blocks') is null or to_regclass('public.conversations') is null
    or to_regclass('public.messages') is null or to_regclass('public.profiles') is null
    or to_regprocedure('public.can_connect(uuid,uuid)') is null
    or to_regprocedure('public.mark_conversation_read(bigint)') is null then
    raise exception 'Safety prerequisites missing' using errcode='22023'; end if;
  if not exists(select 1 from pg_class where oid='public.blocks'::regclass and relkind in ('r','p')) then
    raise exception 'Canonical blocks table required' using errcode='22023'; end if;
  -- SECURITY DEFINER alone is insufficient if its owner cannot see reverse rows.
  if not has_table_privilege(current_user,'public.blocks','SELECT')
    or (not exists(select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls))
      and not exists(select 1 from pg_class where oid='public.blocks'::regclass and pg_get_userbyid(relowner)=current_user and not relforcerowsecurity)) then
    raise exception 'Reviewed complete-block-read owner required' using errcode='42501'; end if;
  -- CREATE OR REPLACE preserves old owners. Do not install wrappers that cannot
  -- execute the new private helper; parent handles ownership differences explicitly.
  if exists(select 1 from pg_proc where oid in ('public.can_connect(uuid,uuid)'::regprocedure,'public.mark_conversation_read(bigint)'::regprocedure)
    and pg_get_userbyid(proowner)<>current_user) then
    raise exception 'Compatibility function ownership requires parent review' using errcode='42501'; end if;
  -- Check actual catalog shape, not existence alone. Historical messaging SQL
  -- returns scalar int4 (not void/bigint/SETOF/OUT); preserve that signature/OID.
  if exists(select 1 from pg_proc where oid='public.can_connect(uuid,uuid)'::regprocedure
      and (prokind<>'f' or proretset or prorettype<>'pg_catalog.bool'::regtype or proargmodes is not null
        or proargnames is distinct from array['user1','user2']::text[] or pronargdefaults<>0))
    or exists(select 1 from pg_proc where oid='public.mark_conversation_read(bigint)'::regprocedure
      and (prokind<>'f' or proretset or prorettype<>'pg_catalog.int4'::regtype or proargmodes is not null
        or proargnames is distinct from array['conv_id']::text[] or pronargdefaults<>0)) then
    raise exception 'Historical safety function signature mismatch' using errcode='42P13'; end if;
end $$;

create function public.safety_pair_allowed(first_id uuid, second_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select first_id is not null and second_id is not null and first_id <> second_id and not exists(
    select 1 from public.blocks b
    where (b.blocker_id = first_id and b.blocked_id = second_id)
       or (b.blocker_id = second_id and b.blocked_id = first_id));
$$;
revoke all on function public.safety_pair_allowed(uuid,uuid) from public, anon, authenticated;

-- Preserve the old signature for callers, but no third-pair probing or invoker
-- block-RLS blindness. This fixes request-insert checks, NOT acceptance/send/read
-- policies generally and NOT concurrent block/contact admission everywhere.
create or replace function public.can_connect(user1 uuid, user2 uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if actor is distinct from user1 and actor is distinct from user2 then
    raise exception 'Pair unavailable' using errcode='42501'; end if;
  return public.safety_pair_allowed(user1,user2);
end $$;
revoke all on function public.can_connect(uuid,uuid) from public, anon, authenticated;
grant execute on function public.can_connect(uuid,uuid) to authenticated;

-- Narrow membership repair: the old definer RPC accepted any conversation ID.
-- No table-wide block lock or substitute pair-lock machinery is installed.
-- The block predicate rejects observed committed blocks only: the blocked-pair race remains incomplete
-- while legacy direct block DML is uncontrolled. NOT authoritative safety activation.
create or replace function public.mark_conversation_read(conv_id bigint)
returns int language plpgsql volatile security definer set search_path = '' as $$
declare actor uuid := auth.uid(); first_id uuid; second_id uuid; updated int;
begin
  if actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Read mutations require READ COMMITTED' using errcode='25001'; end if;
  if conv_id is null or conv_id <= 0 then raise exception 'Invalid conversation' using errcode='22023'; end if;
  select c.user_a,c.user_b into first_id,second_id from public.conversations c where c.id=conv_id for share;
  if not found or (actor is distinct from first_id and actor is distinct from second_id) then
    raise exception 'Conversation unavailable' using errcode='42501'; end if;
  if not public.safety_pair_allowed(first_id,second_id) then
    raise exception 'Conversation unavailable' using errcode='42501'; end if;
  update public.messages m set read_at=pg_catalog.now()
    where m.conversation_id=conv_id and m.sender_id<>actor and m.read_at is null;
  get diagnostics updated = row_count;
  return updated;
end $$;
revoke all on function public.mark_conversation_read(bigint) from public, anon, authenticated;
grant execute on function public.mark_conversation_read(bigint) to authenticated;

-- No approved live-name/metadata audience exists. A self-created outgoing block
-- must not become a profile lookup capability (inactive/renamed targets included).
-- Fail the ENTIRE resource unavailable, even if empty; no query, fake names,
-- omissions, historical-name guesses or fabricated dates. UI stays unavailable.
create function public.get_owner_blocklist()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
  raise exception 'Blocklist unavailable pending approved metadata audience' using errcode='PT503';
end $$;
revoke all on function public.get_owner_blocklist() from public, anon, authenticated;
grant execute on function public.get_owner_blocklist() to authenticated;
commit;
