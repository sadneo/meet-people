-- Forward-only reconciliation for the empty pre-canonical contact installation.
-- Preserve every old object and refuse the transition if any contact data exists.
do $$ begin
  if to_regnamespace('messaging_archive') is not null or to_regnamespace('safety_private') is not null then
    raise exception 'Unexpected contact installation; inspect before deployment';
  end if;
  if (select atttypid from pg_attribute where attrelid='public.conversations'::regclass and attname='id') <> 'uuid'::regtype then
    raise exception 'Expected pre-canonical UUID conversations';
  end if;
end $$;
lock table public.connections,public.conversations,public.messages,public.conversation_participants in access exclusive mode;
do $$ begin
  if exists(select 1 from public.connections) or exists(select 1 from public.conversations)
    or exists(select 1 from public.messages) or exists(select 1 from public.conversation_participants) then
    raise exception 'Existing contact data requires an explicit data-preserving conversion; refusing empty-store transition';
  end if;
end $$;
drop trigger messaging_sync_connection on public.connections;
drop trigger messaging_sync_event_group_member on public.event_group_members;
create schema messaging_archive;
revoke all on schema messaging_archive from public,anon,authenticated,service_role;
alter table public.conversation_participants set schema messaging_archive;
alter table public.messages set schema messaging_archive;
alter table public.conversations set schema messaging_archive;
revoke all on all tables in schema messaging_archive from public,anon,authenticated,service_role;
-- Retired service-only entrypoints must not write the canonical replacement tables.
do $$ declare f regprocedure;begin
  for f in select p.oid::regprocedure from pg_proc p where p.pronamespace='public'::regnamespace
    and (p.proname like 'messaging\_%' or p.proname like 'connection\_%') loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f);
  end loop;
end $$;
