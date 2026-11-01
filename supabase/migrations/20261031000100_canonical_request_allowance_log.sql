-- The canonical (bigint-chat) local stack omits the native UUID messaging
-- migration, which originally introduced this log. The shared allowance RPC
-- still requires it. Leave native stores and their existing trigger unchanged.
-- Use a distinct version from dev's 20261031000000 public Events migration.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $migration$
begin
  if to_regclass('public.connection_request_log') is not null then return; end if;
  lock table public.connections in share row exclusive mode;
  create table public.connection_request_log (
    initiated_by uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now()
  );
  create index connection_request_log_recent_idx on public.connection_request_log(initiated_by,created_at);
  alter table public.connection_request_log enable row level security;
  revoke all on public.connection_request_log from public,anon,authenticated;
  grant select,insert,delete on public.connection_request_log to service_role;

  -- Preserve the history that exists. Deleted historical requests cannot be
  -- reconstructed; all requests made after installation remain logged.
  insert into public.connection_request_log(initiated_by,created_at)
    select initiated_by,created_at from public.connections;

  execute $definition$
    create function public.canonical_connection_allowance_guard() returns trigger
    language plpgsql security definer set search_path='' as $body$
    begin
      -- Serialize new requests from one initiator across both modes. Updates
      -- (acceptance/retries) and deletion never consume/refund an allowance.
      perform pg_advisory_xact_lock(hashtextextended('connection-request-allowance:'||new.initiated_by::text,0));
      if (select count(*) from public.connection_request_log
          where initiated_by=new.initiated_by and created_at>now()-interval '24 hours')>=10 then
        raise exception 'Connection request rate limit exceeded' using errcode='CON04';
      end if;
      insert into public.connection_request_log(initiated_by) values(new.initiated_by);
      return new;
    end $body$
  $definition$;
  revoke all on function public.canonical_connection_allowance_guard() from public,anon,authenticated;
  create trigger aa_connection_request_allowance before insert on public.connections
    for each row execute function public.canonical_connection_allowance_guard();
end
$migration$;
notify pgrst,'reload schema';
commit;
