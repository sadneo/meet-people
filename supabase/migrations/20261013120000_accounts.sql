-- Private preferences are separate from publicly readable profiles.
create table public.account_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferences jsonb not null constraint account_preferences_choices check (coalesce(preferences->>'distance' in ('Nearby','5 miles','10 miles') and preferences->>'group' in ('One-on-one','Small groups','Either'),false)),
  settings jsonb not null,
  completed jsonb not null default '[]',
  updated_at timestamptz not null default now()
);
alter table public.account_settings enable row level security;
revoke all on public.account_settings from anon, authenticated;
grant select on public.account_settings to authenticated;
create policy "Read own account settings" on public.account_settings for select to authenticated using (user_id = auth.uid());

create function public.get_account() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := auth.uid(); saved public.account_settings;
begin
  if actor is null then raise exception 'Not authenticated' using errcode='28000'; end if;
  select * into saved from public.account_settings where user_id=actor;
  return jsonb_build_object('profile',public.get_matchmaking_profile(),
    'preferences',coalesce(saved.preferences,'{"intents":[],"usual":[],"distance":"5 miles","group":"Either"}'::jsonb),
    'settings',coalesce(saved.settings,'{"notifications":true,"availability":true,"discoverable":true,"location":false}'::jsonb),
    'completed',coalesce(saved.completed,'[]'::jsonb));
end;
$$;

create function public.save_account(account_in jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); prefs jsonb := account_in->'preferences'; settings_in jsonb := account_in->'settings'; chapters jsonb := account_in->'completed'; n int; old_n int;
begin
  if actor is null then raise exception 'Not authenticated' using errcode='28000'; end if;
  if jsonb_typeof(account_in)<>'object' or (select count(*) from jsonb_object_keys(account_in))<>4
    or not account_in ?& array['profile','preferences','settings','completed'] then
    raise exception 'Invalid account' using errcode='22023'; end if;
  if jsonb_typeof(prefs)<>'object' or (select count(*) from jsonb_object_keys(prefs))<>4
    or not prefs ?& array['intents','usual','distance','group']
    or jsonb_typeof(prefs->'intents')<>'array' or jsonb_array_length(prefs->'intents')>20
    or jsonb_typeof(prefs->'usual')<>'array' or jsonb_array_length(prefs->'usual')>4
    or jsonb_typeof(prefs->'distance')<>'string' or prefs->>'distance' not in ('Nearby','5 miles','10 miles')
    or jsonb_typeof(prefs->'group')<>'string' or prefs->>'group' not in ('One-on-one','Small groups','Either') then
    raise exception 'Invalid preferences' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(prefs->'intents') v where jsonb_typeof(v)<>'string' or length(trim(v #>> '{}')) not between 1 and 120)
    or exists(select 1 from jsonb_array_elements(prefs->'usual') v where jsonb_typeof(v)<>'string' or v #>> '{}' not in ('Mornings','Afternoons','Evenings','Weekends')) then
    raise exception 'Invalid preference values' using errcode='22023'; end if;
  if jsonb_typeof(settings_in)<>'object' or (select count(*) from jsonb_object_keys(settings_in))<>4
    or not settings_in ?& array['notifications','availability','discoverable','location']
    or exists(select 1 from jsonb_each(settings_in) v where jsonb_typeof(v.value)<>'boolean') then
    raise exception 'Invalid settings' using errcode='22023'; end if;
  if jsonb_typeof(chapters)<>'array' then raise exception 'Invalid chapters' using errcode='22023'; end if;
  n:=jsonb_array_length(chapters);
  if n>4 or exists(select 1 from jsonb_array_elements(chapters) with ordinality v(value,i) where value<>to_jsonb(i-1)) then
    raise exception 'Invalid chapters' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('account:' || actor::text,0));
  select coalesce(jsonb_array_length(completed),0) into old_n from public.account_settings where user_id=actor;
  if n<coalesce(old_n,0) or n>coalesce(old_n,0)+1 then raise exception 'Invalid onboarding progression' using errcode='22023'; end if;
  if (n>0 and (length(trim(account_in->'profile'->>'display_name'))=0 or coalesce(length(trim(account_in->'profile'->>'bio')),0)=0))
    or (n>1 and jsonb_array_length(account_in->'profile'->'interests')=0)
    or (n>2 and jsonb_array_length(prefs->'intents')=0)
    or (n>3 and jsonb_array_length(prefs->'usual')=0 and jsonb_array_length(account_in->'profile'->'availability')=0) then
    raise exception 'Incomplete onboarding' using errcode='22023'; end if;
  perform public.save_matchmaking_profile(account_in->'profile');
  insert into public.account_settings(user_id,preferences,settings,completed) values(actor,prefs,settings_in,chapters)
    on conflict(user_id) do update set preferences=excluded.preferences,settings=excluded.settings,completed=excluded.completed,updated_at=now();
  return public.get_account();
end;
$$;
revoke all on function public.get_account(), public.save_account(jsonb) from public, anon;
grant execute on function public.get_account(), public.save_account(jsonb) to authenticated;
