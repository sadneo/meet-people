-- REVIEW CANDIDATE ONLY. NOT APPLIED OR DATABASE-EXECUTED BY THE AGENT.
-- Prerequisites in an isolated disposable DB: existing matchmaking schema/RPCs,
-- canonical 20261018160000 identity migration. Do not apply the upstream accounts
-- migration after this candidate: its CREATE TABLE/FUNCTION statements conflict.
-- Preserve canonical storage/projector and namespace race protection; one document writer.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $$ begin
 if to_regclass('public.account_profiles') is null
  or to_regprocedure('public.get_matchmaking_profile()') is null then
  raise exception 'Canonical identity and matchmaking prerequisites missing';
 end if;
 if to_regprocedure('public.reconciliation_identity_write(jsonb)') is null then
  alter function public.save_account_profile(jsonb) rename to reconciliation_identity_write;
 end if;
 if to_regprocedure('public.reconciliation_profile_write(jsonb)') is null then
  alter function public.save_matchmaking_profile(jsonb) rename to reconciliation_profile_write;
 end if;
end $$;
revoke all on function public.reconciliation_identity_write(jsonb), public.reconciliation_profile_write(jsonb) from public, anon, authenticated;

create table if not exists public.account_settings (
 user_id uuid primary key references auth.users(id) on delete cascade,
 preferences jsonb not null, settings jsonb not null,
 completed jsonb not null default '[]', updated_at timestamptz not null default now()
);
alter table public.account_settings enable row level security;
-- Abort instead of silently removing previously granted product write access.
do $$ declare role_name text; table_name text; begin
 foreach role_name in array array['anon','authenticated'] loop
  foreach table_name in array array['public.account_settings','public.account_profiles','public.profiles'] loop
  if has_table_privilege(role_name::name,table_name,'INSERT,UPDATE,DELETE')
   or has_any_column_privilege(role_name::name,table_name,'INSERT')
   or has_any_column_privilege(role_name::name,table_name,'UPDATE') then
   raise exception 'RPC-only settings writes require separate ACL review';
  end if;
  end loop;
 end loop;
end $$;
revoke all on public.account_settings from public, anon;
grant select on public.account_settings to authenticated;
do $$ begin
 if not exists(select from pg_policies where schemaname='public' and tablename='account_settings' and policyname='Read own account settings') then
  create policy "Read own account settings" on public.account_settings for select to authenticated using (user_id = auth.uid());
 end if;
end $$;
-- Empty choices mean not yet chosen, never fabricated ordinary-user defaults.
alter table public.account_settings drop constraint if exists account_preferences_choices;
alter table public.account_settings add constraint account_preferences_choices check (
 coalesce(preferences->>'distance' in ('','Nearby','5 miles','10 miles')
 and preferences->>'group' in ('','One-on-one','Small groups','Either'),false));

create or replace function public.reconciliation_chapters(p jsonb, prefs jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare identity jsonb; birth date;
begin
 if p is null or p='null'::jsonb then return '[]'; end if;
 identity := jsonb_build_object('username',p->'username','display_name',p->'display_name','bio',p->'bio','avatar_url',p->'avatar_url');
 if not public.valid_account_identity(identity) then return '[]'; end if;
 if jsonb_typeof(p->'interests') is distinct from 'array' then return '[0]'; end if;
 if (select count(distinct btrim(value #>> '{}')) from jsonb_array_elements(p->'interests')) < 3 then return '[0]'; end if;
 if jsonb_typeof(prefs->'intents') is distinct from 'array' then return '[0,1]'; end if;
 if jsonb_array_length(prefs->'intents')=0 then return '[0,1]'; end if;
 if coalesce(prefs->>'distance','') not in ('Nearby','5 miles','10 miles')
  or coalesce(prefs->>'group','') not in ('One-on-one','Small groups','Either')
  or coalesce(length(btrim(p->>'location_city')),0)=0
  or jsonb_typeof(p->'availability') is distinct from 'array' then return '[0,1,2]'; end if;
 if jsonb_array_length(p->'availability')=0 or coalesce(p->>'birthdate','') !~ '^\d{4}-\d{2}-\d{2}$' then return '[0,1,2]'; end if;
 begin birth := (p->>'birthdate')::date;
 exception when others then return '[0,1,2]'; end;
 if to_char(birth,'YYYY-MM-DD')<>p->>'birthdate' then return '[0,1,2]'; end if;
 return '[0,1,2,3]';
end $$;
revoke all on function public.reconciliation_chapters(jsonb,jsonb) from public, anon, authenticated;

create or replace function public.get_account() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); saved public.account_settings; p jsonb; identity jsonb; prefs jsonb;
begin
 if actor is null then raise exception 'Not authenticated' using errcode='28000'; end if;
 select * into saved from public.account_settings where user_id=actor;
 p := public.get_matchmaking_profile();
 identity := public.get_account_profile();
 if identity is not null then
  p := coalesce(nullif(p,'null'::jsonb),'{"birthdate":null,"location_city":null,"interests":[],"availability":[]}'::jsonb) || identity;
 end if;
 prefs := coalesce(saved.preferences,'{"intents":[],"usual":[],"distance":"","group":""}'::jsonb);
 return jsonb_build_object('profile',p,'preferences',prefs,
  'settings',coalesce(saved.settings,'{"notifications":true,"availability":true,"discoverable":true,"location":false}'::jsonb),
  'completed',public.reconciliation_chapters(p,prefs));
end $$;

create or replace function public.save_account(account_in jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); p jsonb:=account_in->'profile'; prefs jsonb:=account_in->'preferences';
 settings_in jsonb:=account_in->'settings'; chapters jsonb:=account_in->'completed'; previous jsonb; n int; old_n int;
begin
 if actor is null then raise exception 'Not authenticated' using errcode='28000'; end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'READ COMMITTED required' using errcode='25001'; end if;
 -- Always namespace BEFORE actor/row locks, including compatibility RPCs.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('profile-username-namespace',0));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('account:'||actor::text,0));
 if jsonb_typeof(account_in) is distinct from 'object' then raise exception 'Invalid account' using errcode='22023'; end if;
 if (select count(*) from jsonb_object_keys(account_in))<>4 or not account_in ?& array['profile','preferences','settings','completed'] then raise exception 'Invalid account fields' using errcode='22023'; end if;
 if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(prefs) is distinct from 'object' or jsonb_typeof(settings_in) is distinct from 'object' or jsonb_typeof(chapters) is distinct from 'array' then raise exception 'Invalid account document' using errcode='22023'; end if;
 if (select count(*) from jsonb_object_keys(prefs))<>4 or not prefs ?& array['intents','usual','distance','group']
  or jsonb_typeof(prefs->'intents') is distinct from 'array' or jsonb_typeof(prefs->'usual') is distinct from 'array'
  or coalesce(prefs->>'distance','?') not in ('','Nearby','5 miles','10 miles') or coalesce(prefs->>'group','?') not in ('','One-on-one','Small groups','Either') then raise exception 'Invalid preferences' using errcode='22023'; end if;
 if jsonb_array_length(prefs->'intents')>20 or jsonb_array_length(prefs->'usual')>4
  or exists(select from jsonb_array_elements(prefs->'intents') v where jsonb_typeof(v)<>'string' or length(btrim(v #>> '{}')) not between 1 and 120)
  or (select count(*)<>count(distinct btrim(value #>> '{}')) from jsonb_array_elements(prefs->'intents'))
  or exists(select from jsonb_array_elements(prefs->'usual') v where jsonb_typeof(v)<>'string' or v #>> '{}' not in ('Mornings','Afternoons','Evenings','Weekends')) then raise exception 'Invalid preference values' using errcode='22023'; end if;
 if (select count(*) from jsonb_object_keys(settings_in))<>4 or not settings_in ?& array['notifications','availability','discoverable','location']
  or exists(select from jsonb_each(settings_in) v where jsonb_typeof(v.value)<>'boolean') then raise exception 'Invalid settings' using errcode='22023'; end if;
 n:=jsonb_array_length(chapters);
 if n>4 or exists(select from jsonb_array_elements(chapters) with ordinality v(value,i) where value<>to_jsonb(i-1)) then raise exception 'Invalid chapter sequence' using errcode='22023'; end if;
 previous:=public.get_account(); old_n:=jsonb_array_length(previous->'completed');
 if n<old_n or n>old_n+1 or jsonb_array_length(public.reconciliation_chapters(p,prefs))<greatest(n,old_n) then raise exception 'Required fields or sequential progression missing' using errcode='22023'; end if;
 -- Original canonical implementation retains symmetric username reservation and projector.
 perform public.reconciliation_identity_write(jsonb_build_object('username',p->'username','display_name',p->'display_name','bio',p->'bio','avatar_url',p->'avatar_url'));
 -- Original profile implementation validates dates, bounds, labels, windows and overlap.
 -- Any failure rolls back canonical identity AND private settings in this transaction.
 perform public.reconciliation_profile_write(p);
 insert into public.account_settings(user_id,preferences,settings,completed) values(actor,prefs,settings_in,chapters)
 on conflict(user_id) do update set preferences=excluded.preferences,settings=excluded.settings,completed=excluded.completed,updated_at=now();
 return public.get_account();
end $$;

create or replace function public.save_account_profile(profile_in jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare account jsonb; p jsonb;
begin
 if auth.uid() is null then raise exception 'Not authenticated' using errcode='28000'; end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'READ COMMITTED required' using errcode='25001'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('profile-username-namespace',0));
 if not public.valid_account_identity(profile_in) then raise exception 'Invalid identity' using errcode='22023'; end if;
 account:=public.get_account(); p:=coalesce(nullif(account->'profile','null'::jsonb),'{"birthdate":null,"location_city":null,"interests":[],"availability":[]}'::jsonb)||profile_in;
 account:=jsonb_set(account,'{profile}',p);
 if account->'completed'='[]'::jsonb then account:=jsonb_set(account,'{completed}','[0]'); end if;
 perform public.save_account(account);
 return public.get_account_profile();
end $$;
create or replace function public.save_matchmaking_profile(profile_in jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare account jsonb; identity jsonb;
begin
 if auth.uid() is null then raise exception 'Not authenticated' using errcode='28000'; end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'READ COMMITTED required' using errcode='25001'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('profile-username-namespace',0));
 account:=public.get_account(); identity:=public.get_account_profile();
 -- Compatibility matching writes never override canonical identity.
 if identity is not null then profile_in:=profile_in||identity; end if;
 account:=jsonb_set(account,'{profile}',profile_in);
 if account->'completed'='[]'::jsonb then account:=jsonb_set(account,'{completed}','[0]'); end if;
 perform public.save_account(account);
 return public.get_matchmaking_profile();
end $$;
revoke all on function public.get_account(), public.save_account(jsonb), public.save_account_profile(jsonb), public.save_matchmaking_profile(jsonb) from public, anon, authenticated;
grant execute on function public.get_account(), public.save_account(jsonb), public.save_account_profile(jsonb), public.save_matchmaking_profile(jsonb) to authenticated;

-- Idempotent marker mapping; never overwrite identity, preferences, settings or vectors.
update public.account_settings s set completed=public.reconciliation_chapters(
 (select jsonb_build_object('username',p.username,'display_name',p.display_name,'bio',p.bio,'avatar_url',p.avatar_url,
 'birthdate',p.birthdate,'location_city',p.location_city,'interests',(select coalesce(jsonb_agg(i.text),'[]') from public.user_interests i where i.profile_id=p.id),
 'availability',(select coalesce(jsonb_agg(jsonb_build_object('dow',a.dow,'start_time',a.start_time,'end_time',a.end_time)),'[]') from public.availability a where a.profile_id=p.id)) from public.profiles p where p.id=s.user_id),s.preferences);
-- Missing settings rows need no fabricated choices or bulk profile rewrites:
-- get_account maps their valid stored prefix; the next real chapter save persists it.

-- Optional derived enrichment: retain labels, never invent vectors or disable triggers.
create or replace function public.user_interests_embed()
returns trigger language plpgsql set search_path=public,extensions as $$
begin
 begin
  perform set_config('http.curlopt_timeout_ms','2000',true);
  new.embedding:=public.get_gemini_embedding(new.text);
 exception when others then new.embedding:=null;
 end;
 return new;
end $$;
commit;
