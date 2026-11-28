-- OPERATOR-REVIEWED CLEANUP. NOT A MIGRATION. NEVER RUN AUTOMATICALLY.
-- Run before supabase/migrations/20261119050000_username_normalization.sql
-- if that migration aborts with "Case-insensitive duplicate usernames exist".
-- Step 1 lists the clashes. Step 2 is a template: decide per person which
-- account keeps the handle, then rename the others (it never runs as-is).
-- Both tables must be changed together; profiles is a projection of account_profiles.

-- Step 1: list case-insensitive duplicates, oldest account first.
select lower(p.username) as handle, p.id, p.username, u.email, u.created_at
from (select id, username from public.profiles union select id, username from public.account_profiles) p
join auth.users u on u.id = p.id
where lower(p.username) in (
  select lower(username) from (select id, username from public.profiles union select id, username from public.account_profiles) x
  group by lower(username) having count(distinct id) > 1)
order by handle, u.created_at;

-- Step 2 (template, edit ids and new handles, then run inside a transaction):
-- begin;
-- update public.account_profiles set username = 'NEW_HANDLE' where id = 'USER_UUID';
-- update public.profiles set username = 'NEW_HANDLE' where id = 'USER_UUID';
-- commit;
