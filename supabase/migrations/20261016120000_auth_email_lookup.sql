-- Only the API's service role may ask this question. Never grant it to browser roles.
create or replace function public.auth_email_exists(email_in text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users
    where email = lower(trim(email_in))
      and deleted_at is null
      and is_anonymous = false
      and is_sso_user = false
  );
$$;

revoke all on function public.auth_email_exists(text) from public, anon, authenticated;
grant execute on function public.auth_email_exists(text) to service_role;
