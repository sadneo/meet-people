-- Adult-only initial release. Do not delete or rewrite existing account records.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';

create function public.enforce_adult_birthdate() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.birthdate is not null and not public.dating_adult_on(new.birthdate,(statement_timestamp() at time zone 'UTC')::date) then
  raise exception 'Pebble is for adults aged 18 and older' using errcode='22023';
 end if;
 if tg_op='UPDATE' and old.birthdate is not null and new.birthdate is distinct from old.birthdate and auth.uid() is not null then
  raise exception 'Contact support to correct a saved birthdate' using errcode='22023';
 end if;
 return new;
end $$;
revoke all on function public.enforce_adult_birthdate() from public,anon,authenticated;
create trigger adult_birthdate_guard before insert or update of birthdate on public.profiles
for each row execute function public.enforce_adult_birthdate();

-- Existing social/discovery functions already require adult eligibility. Garden
-- also needs an explicit gate for historical accounts and direct RPC callers.
alter function public.garden_account(jsonb) set schema garden_private;
alter function garden_private.garden_account(jsonb) rename to account_before_adult;
revoke all on function garden_private.account_before_adult(jsonb) from public,anon,authenticated;
create function public.garden_account(command_in jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid()
  and public.dating_adult_on(p.birthdate,(statement_timestamp() at time zone 'UTC')::date)) then
  raise exception 'Pebble is for adults aged 18 and older. Complete your birthdate to continue.' using errcode='42501';
 end if;
 return garden_private.account_before_adult(command_in);
end $$;
revoke all on function public.garden_account(jsonb) from public,anon;
grant execute on function public.garden_account(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
