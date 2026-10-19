-- DISPOSABLE ONLY. Parent loads after schema/legacy RPCs and BEFORE the candidate.
-- No real Auth, HTTP, provider, queue, seed or data dump operations.
begin;
do $$ begin
 if current_database() <> 'pebble_namespace_disposable' then
  raise exception 'Wrong database for destructive disposable fixture'; end if;
end $$;

-- Make the synthetic database RPC-only without altering product migration grants.
revoke insert, update, delete on public.profiles from public, anon, authenticated;
revoke create on schema public from public, anon, authenticated;
do $$
declare col record;
begin
 for col in select attname from pg_attribute where attrelid='public.profiles'::regclass and attnum>0 and not attisdropped loop
  execute format('revoke insert (%I), update (%I) on public.profiles from public, anon, authenticated',col.attname,col.attname);
 end loop;
end $$;

-- Raising guard, never a fake embedding. Any attempted embedding aborts the save.
create or replace function public.get_gemini_embedding(interest_text text)
returns double precision[] language plpgsql security definer set search_path = '' as $$
begin
 -- NAMESPACE_TEST_PROVIDER_GUARD
 raise exception 'Provider use forbidden in namespace test' using errcode='PZ001';
end $$;

create table public.namespace_test_marker (
 singleton boolean primary key check(singleton),
 purpose text not null check(purpose='network-none-disposable-namespace')
);
insert into public.namespace_test_marker values(true,'network-none-disposable-namespace');
revoke all on public.namespace_test_marker from public, anon, authenticated;
commit;
