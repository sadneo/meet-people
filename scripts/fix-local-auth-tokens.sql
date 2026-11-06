-- Local Supabase only. Run in Studio (http://127.0.0.1:54323) -> SQL Editor.
--
-- Fixes "Database error finding users" / "Database error querying schema" caused by users that were
-- inserted straight into auth.users (for example by a seed script) with NULL in the token columns.
-- The auth service reads those columns as plain text and fails on NULL. This sets NULL to '' and
-- leaves every other value alone. Safe to run more than once; columns your version lacks are skipped.
do $$
declare c text;
begin
  for c in select column_name from information_schema.columns
    where table_schema = 'auth' and table_name = 'users'
      and column_name in ('confirmation_token', 'recovery_token', 'email_change_token_new', 'email_change',
                          'email_change_token_current', 'phone_change', 'phone_change_token', 'reauthentication_token')
  loop
    execute format('update auth.users set %1$I = '''' where %1$I is null', c);
  end loop;
end $$;
