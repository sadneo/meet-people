-- Profile and settings backend. The API reads and writes these through the
-- service role after verifying the caller's Supabase session.

-- ============================================
-- PROFILE FIELDS
-- ============================================
alter table public.profiles
  add column pronouns         text,
  add column intents          text[] not null default '{}',
  add column usual_times      text[] not null default '{}',
  add column max_distance_miles int  not null default 5,
  add column group_preference text   not null default 'either',
  add column onboarded_at     timestamptz,
  add column username_changed_at timestamptz;

alter table public.profiles
  add constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,30}$'),
  add constraint profiles_display_name_length check (length(btrim(display_name)) between 1 and 30),
  add constraint profiles_bio_length check (bio is null or length(bio) <= 160),
  add constraint profiles_pronouns_length check (pronouns is null or length(pronouns) <= 30),
  add constraint profiles_location_city_length check (location_city is null or length(location_city) <= 80),
  add constraint profiles_coordinates_paired check ((latitude is null) = (longitude is null)),
  add constraint profiles_latitude_range check (latitude is null or latitude between -90 and 90),
  add constraint profiles_longitude_range check (longitude is null or longitude between -180 and 180),
  add constraint profiles_max_distance_range check (max_distance_miles between 1 and 100),
  add constraint profiles_group_preference check (group_preference in ('one_on_one', 'group', 'either')),
  add constraint profiles_intents_limit check (cardinality(intents) <= 10),
  add constraint profiles_usual_times_limit check (cardinality(usual_times) <= 7);

create unique index profiles_username_lower_idx on public.profiles (lower(username));

-- ============================================
-- USER SETTINGS (one row per profile)
-- ============================================
create table public.user_settings (
  profile_id         uuid primary key references public.profiles(id) on delete cascade,
  notifications      boolean not null default true,
  discoverable       boolean not null default true,
  share_availability boolean not null default true,
  nearby_suggestions boolean not null default false,
  dating_enabled     boolean not null default false,
  downtime_matching  boolean not null default false,
  -- null means "follow the device". The API validates both against Intl.
  locale             text check (locale is null or locale ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  timezone           text check (timezone is null or length(timezone) between 1 and 64),
  updated_at         timestamptz not null default now()
);

create trigger trg_user_settings_set_updated_at
  before update on public.user_settings
  for each row execute function profiles_set_updated_at();

alter table public.user_settings enable row level security;
create policy "Users read own settings" on public.user_settings
  for select using (profile_id = auth.uid());
create policy "Users update own settings" on public.user_settings
  for update using (profile_id = auth.uid());

create function public.profiles_create_settings()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.user_settings(profile_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger trg_profiles_create_settings
  after insert on public.profiles
  for each row execute function public.profiles_create_settings();

insert into public.user_settings(profile_id) select id from public.profiles on conflict do nothing;

-- Security definer so the check sees other users' settings despite their RLS.
-- Matching queries can filter candidates with this as well.
create function public.is_discoverable(p_profile_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select discoverable from public.user_settings where profile_id = p_profile_id), true);
$$;
grant execute on function public.is_discoverable(uuid) to anon, authenticated, service_role;

-- Hidden profiles drop out of public reads; owners always see their own.
drop policy "Profiles are publicly readable" on public.profiles;
create policy "Profiles are publicly readable" on public.profiles
  for select using (id = auth.uid() or (is_active = true and public.is_discoverable(id)));

-- ============================================
-- REPORTS (write-only for users; moderation reads with the service role)
-- ============================================
create table public.user_reports (
  id          bigint generated always as identity primary key,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_id uuid not null references public.profiles(id) on delete cascade,
  reason      text not null check (reason in ('harassment', 'inappropriate_content', 'impersonation', 'other')),
  details     text check (details is null or length(details) <= 400),
  status      text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at  timestamptz not null default now(),
  check (reporter_id <> reported_id)
);

create index user_reports_reported_idx on public.user_reports (reported_id, created_at desc);
create index user_reports_open_idx on public.user_reports (created_at) where status = 'open';

alter table public.user_reports enable row level security;
revoke all on public.user_reports from anon, authenticated;
grant select, insert, update, delete on public.user_reports to service_role;

-- ============================================
-- EMBEDDING FAILURES MUST NOT BLOCK PROFILE EDITS
-- Interests are saved without an embedding; matching already skips nulls.
-- ============================================
create or replace function user_interests_embed()
returns trigger
language plpgsql
as $$
begin
  begin
    new.embedding := get_gemini_embedding(new.text);
  exception when others then
    raise warning 'Interest embedding failed: %', sqlerrm;
    new.embedding := null;
  end;
  return new;
end;
$$;

-- ============================================
-- SAVE PROFILE (atomic upsert of profile, interests, availability)
-- p_profile keys that are absent are left unchanged; present nulls clear.
-- p_interests / p_availability replace the whole set when non-null.
-- ============================================
create function public.save_profile(
  p_user_id      uuid,
  p_profile      jsonb,
  p_interests    text[] default null,
  p_availability jsonb  default null
)
returns void language plpgsql set search_path = '' as $$
declare
  p jsonb := coalesce(p_profile, '{}'::jsonb);
begin
  -- Usernames can change once every 30 days; choosing the first one is free.
  if p ? 'username' and exists (select 1 from public.profiles where id = p_user_id
      and username <> p->>'username' and username_changed_at > now() - interval '30 days') then
    raise exception 'You can change your username once every 30 days' using errcode = 'PU429';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    if not (p ? 'username' and p ? 'display_name') then
      raise exception 'A new profile needs a username and display name' using errcode = '22023';
    end if;
    insert into public.profiles(id, username, display_name)
      values (p_user_id, p->>'username', p->>'display_name');
  end if;

  update public.profiles set
    username_changed_at = case when p ? 'username' and username <> p->>'username' then now()                  else username_changed_at end,
    username           = case when p ? 'username'           then p->>'username'                                   else username end,
    display_name       = case when p ? 'display_name'       then p->>'display_name'                               else display_name end,
    bio                = case when p ? 'bio'                then p->>'bio'                                        else bio end,
    pronouns           = case when p ? 'pronouns'           then p->>'pronouns'                                   else pronouns end,
    birthdate          = case when p ? 'birthdate'          then (p->>'birthdate')::date                          else birthdate end,
    location_city      = case when p ? 'location_city'      then p->>'location_city'                              else location_city end,
    latitude           = case when p ? 'latitude'           then (p->>'latitude')::double precision               else latitude end,
    longitude          = case when p ? 'longitude'          then (p->>'longitude')::double precision              else longitude end,
    avatar_url         = case when p ? 'avatar_url'         then p->>'avatar_url'                                 else avatar_url end,
    intents            = case when p ? 'intents'            then array(select jsonb_array_elements_text(p->'intents'))     else intents end,
    usual_times        = case when p ? 'usual_times'        then array(select jsonb_array_elements_text(p->'usual_times')) else usual_times end,
    max_distance_miles = case when p ? 'max_distance_miles' then (p->>'max_distance_miles')::int                  else max_distance_miles end,
    group_preference   = case when p ? 'group_preference'   then p->>'group_preference'                           else group_preference end,
    onboarded_at       = case when (p->>'onboarded')::boolean then coalesce(onboarded_at, now())                  else onboarded_at end
  where id = p_user_id;

  if p_interests is not null then
    delete from public.user_interests
      where profile_id = p_user_id and not (text = any(p_interests));
    -- Unchanged interests keep their embeddings; only new text is embedded.
    insert into public.user_interests(profile_id, text)
      select p_user_id, t from unnest(p_interests) t
      on conflict (profile_id, text) do nothing;
  end if;

  if p_availability is not null then
    delete from public.availability where profile_id = p_user_id;
    insert into public.availability(profile_id, dow, start_time, end_time)
      select p_user_id, (w->>'dow')::int, (w->>'start_time')::time, (w->>'end_time')::time
      from jsonb_array_elements(p_availability) w;
  end if;
end;
$$;

-- ============================================
-- PROFILE SNAPSHOT
-- p_viewer_id = p_user_id returns the owner's full view (with settings).
-- Other viewers get null when the profile is hidden, inactive, or blocked
-- in either direction, and see availability only as an accepted connection
-- of someone who shares it.
-- ============================================
create function public.profile_snapshot(p_user_id uuid, p_viewer_id uuid)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  is_self    boolean := p_user_id = p_viewer_id;
  prof       public.profiles;
  prefs      public.user_settings;
  connected  boolean;
  result     jsonb;
begin
  select * into prof from public.profiles where id = p_user_id;
  if not found then return null; end if;
  select * into prefs from public.user_settings where profile_id = p_user_id;

  if not is_self then
    if not prof.is_active or not coalesce(prefs.discoverable, true) then return null; end if;
    if p_viewer_id is not null and exists (
      select 1 from public.blocks b
      where (b.blocker_id = p_viewer_id and b.blocked_id = p_user_id)
         or (b.blocker_id = p_user_id and b.blocked_id = p_viewer_id)) then
      return null;
    end if;
  end if;

  connected := p_viewer_id is not null and exists (
    select 1 from public.connections c
    where c.status = 'accepted'
      and c.user_a = least(p_user_id, p_viewer_id) and c.user_b = greatest(p_user_id, p_viewer_id));

  result := jsonb_build_object(
    'id', prof.id,
    'username', prof.username,
    'display_name', prof.display_name,
    'bio', prof.bio,
    'pronouns', prof.pronouns,
    'location_city', prof.location_city,
    'avatar_url', prof.avatar_url,
    'intents', to_jsonb(prof.intents),
    'interests', coalesce((select jsonb_agg(ui.text order by ui.id)
      from public.user_interests ui where ui.profile_id = p_user_id), '[]'::jsonb),
    'availability', case when is_self or (connected and coalesce(prefs.share_availability, true))
      then coalesce((select jsonb_agg(jsonb_build_object(
          'dow', a.dow, 'start_time', to_char(a.start_time, 'HH24:MI'), 'end_time', to_char(a.end_time, 'HH24:MI'))
          order by a.dow, a.start_time)
        from public.availability a where a.profile_id = p_user_id), '[]'::jsonb)
      else null end,
    'is_connected', connected and not is_self
  );

  if is_self then
    result := result || jsonb_build_object(
      'birthdate', prof.birthdate,
      'latitude', prof.latitude,
      'longitude', prof.longitude,
      'usual_times', to_jsonb(prof.usual_times),
      'max_distance_miles', prof.max_distance_miles,
      'group_preference', prof.group_preference,
      'onboarded_at', prof.onboarded_at,
      'username_changeable_at', prof.username_changed_at + interval '30 days',
      'created_at', prof.created_at,
      'updated_at', prof.updated_at
    );
  end if;
  return result;
end;
$$;

-- ============================================
-- BLOCKING
-- Blocking severs any connection and ends any dating match between the pair.
-- Returns false when the target has no profile.
-- ============================================
create function public.block_user(p_blocker_id uuid, p_blocked_id uuid)
returns boolean language plpgsql set search_path = '' as $$
begin
  if p_blocker_id = p_blocked_id then
    raise exception 'You cannot block yourself' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_blocked_id) then return false; end if;
  insert into public.blocks(blocker_id, blocked_id) values (p_blocker_id, p_blocked_id) on conflict do nothing;
  delete from public.connections
    where user_a = least(p_blocker_id, p_blocked_id) and user_b = greatest(p_blocker_id, p_blocked_id);
  update public.dating_matches set status = 'ended', ended_at = now()
    where user_a = least(p_blocker_id, p_blocked_id) and user_b = greatest(p_blocker_id, p_blocked_id)
      and status <> 'ended';
  return true;
end;
$$;

create function public.blocked_users(p_user_id uuid)
returns jsonb language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'username', p.username, 'display_name', p.display_name,
      'avatar_url', p.avatar_url, 'blocked_at', b.created_at) order by b.created_at desc), '[]'::jsonb)
  from public.blocks b join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = p_user_id;
$$;

revoke all on function public.block_user(uuid, uuid) from public, anon, authenticated;
revoke all on function public.blocked_users(uuid) from public, anon, authenticated;
grant execute on function public.block_user(uuid, uuid) to service_role;
grant execute on function public.blocked_users(uuid) to service_role;

revoke all on function public.save_profile(uuid, jsonb, text[], jsonb) from public, anon, authenticated;
revoke all on function public.profile_snapshot(uuid, uuid) from public, anon, authenticated;
grant execute on function public.save_profile(uuid, jsonb, text[], jsonb) to service_role;
grant execute on function public.profile_snapshot(uuid, uuid) to service_role;

-- ============================================
-- AVATARS (public read; the API issues signed uploads into <user id>/)
-- ============================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- ============================================
-- SESSIONS (signed-in devices)
-- Supabase Auth has no user-facing session listing, so the API reads
-- auth.sessions through these. Deleting a session revokes its refresh tokens
-- and makes Supabase Auth reject its access token.
-- ============================================
create function public.list_sessions(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'created_at', s.created_at,
      'last_active_at', coalesce(s.refreshed_at, s.updated_at, s.created_at),
      'user_agent', s.user_agent, 'ip', host(s.ip), 'aal', s.aal)
    order by coalesce(s.refreshed_at, s.updated_at, s.created_at) desc), '[]'::jsonb)
  from auth.sessions s
  where s.user_id = p_user_id and (s.not_after is null or s.not_after > now());
$$;

-- Revokes one session, or every session except p_keep when p_session_id is null.
create function public.revoke_sessions(p_user_id uuid, p_session_id uuid, p_keep uuid default null)
returns int language plpgsql security definer set search_path = '' as $$
declare
  removed int;
begin
  delete from auth.sessions
    where user_id = p_user_id
      and (p_session_id is null or id = p_session_id)
      and (p_keep is null or id <> p_keep);
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.list_sessions(uuid) from public, anon, authenticated;
revoke all on function public.revoke_sessions(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.list_sessions(uuid) to service_role;
grant execute on function public.revoke_sessions(uuid, uuid, uuid) to service_role;

-- ============================================
-- DATA EXPORT ("download my data")
-- The API stores the JSON privately under exports/<user id>/ for 7 days.
-- ============================================
create table public.data_export_requests (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  path       text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);
create index data_export_requests_user_idx on public.data_export_requests (user_id, created_at desc);

alter table public.data_export_requests enable row level security;
revoke all on public.data_export_requests from anon, authenticated;
grant select, insert, update, delete on public.data_export_requests to service_role;

-- Everything stored about the user. Other people appear only by username.
create function public.export_user_data(p_user_id uuid)
returns jsonb language sql stable set search_path = '' as $$
  with name_of as (select id, username from public.profiles)
  select jsonb_build_object(
    'profile', (select to_jsonb(p) from public.profiles p where p.id = p_user_id),
    'settings', (select to_jsonb(s) - 'profile_id' from public.user_settings s where s.profile_id = p_user_id),
    'interests', coalesce((select jsonb_agg(jsonb_build_object('text', text, 'created_at', created_at) order by id)
      from public.user_interests where profile_id = p_user_id), '[]'),
    'availability', coalesce((select jsonb_agg(jsonb_build_object('dow', dow, 'start_time', start_time, 'end_time', end_time) order by dow, start_time)
      from public.availability where profile_id = p_user_id), '[]'),
    'connections', coalesce((select jsonb_agg(jsonb_build_object(
        'with', (select username from name_of where id = case when c.user_a = p_user_id then c.user_b else c.user_a end),
        'status', c.status, 'requested_by_me', c.initiated_by = p_user_id, 'created_at', c.created_at, 'responded_at', c.responded_at) order by c.created_at)
      from public.connections c where p_user_id in (c.user_a, c.user_b)), '[]'),
    'messages', coalesce((select jsonb_agg(jsonb_build_object(
        'conversation_with', (select username from name_of where id = case when cv.user_a = p_user_id then cv.user_b else cv.user_a end),
        'from_me', m.sender_id = p_user_id, 'body', m.body, 'sent_at', m.created_at, 'read_at', m.read_at) order by m.created_at)
      from public.messages m join public.conversations cv on cv.id = m.conversation_id
      where p_user_id in (cv.user_a, cv.user_b)), '[]'),
    'blocked', coalesce((select jsonb_agg(jsonb_build_object('username', n.username, 'blocked_at', b.created_at) order by b.created_at)
      from public.blocks b join name_of n on n.id = b.blocked_id where b.blocker_id = p_user_id), '[]'),
    'reports_filed', coalesce((select jsonb_agg(jsonb_build_object('reported', n.username, 'reason', r.reason, 'details', r.details, 'status', r.status, 'created_at', r.created_at) order by r.created_at)
      from public.user_reports r join name_of n on n.id = r.reported_id where r.reporter_id = p_user_id), '[]'),
    'queue', (select jsonb_build_object('queue_type', queue_type, 'joined_at', joined_at) from public.queue_entries where profile_id = p_user_id),
    'interactions', coalesce((select jsonb_agg(jsonb_build_object(
        'with', (select username from name_of where id = case when i.user_a = p_user_id then i.user_b else i.user_a end),
        'context', i.context, 'met', i.met, 'rating', i.rating, 'became_friends', i.became_friends, 'became_dating', i.became_dating, 'created_at', i.created_at) order by i.created_at)
      from public.interaction_outcomes i where p_user_id in (i.user_a, i.user_b)), '[]'),
    'dating_matches', coalesce((select jsonb_agg(jsonb_build_object(
        'with', (select username from name_of where id = case when d.user_a = p_user_id then d.user_b else d.user_a end),
        'status', d.status, 'created_at', d.created_at, 'ended_at', d.ended_at) order by d.created_at)
      from public.dating_matches d where p_user_id in (d.user_a, d.user_b)), '[]'),
    'meetups_hosted', coalesce((select jsonb_agg(to_jsonb(m) - 'host_id' order by m.starts_at)
      from public.meetups m where m.host_id = p_user_id), '[]'),
    'meetups_attended', coalesce((select jsonb_agg(jsonb_build_object('meetup', m.title, 'status', a.status, 'joined_at', a.joined_at) order by a.joined_at)
      from public.meetup_attendees a join public.meetups m on m.id = a.meetup_id where a.profile_id = p_user_id), '[]'),
    'meetup_interest', coalesce((select jsonb_agg(jsonb_build_object('meetup', m.title, 'note', e.note, 'created_at', e.created_at) order by e.created_at)
      from public.event_interest e join public.meetups m on m.id = e.meetup_id where e.profile_id = p_user_id), '[]'),
    'event_interest', coalesce((select jsonb_agg(jsonb_build_object('event', l.title, 'starts_at', l.starts_at, 'created_at', e.created_at,
        'in_group', exists (select 1 from public.event_group_members g where g.event_id = e.event_id and g.user_id = p_user_id)) order by e.created_at)
      from public.event_interests e join public.listings l on l.id = e.event_id where e.user_id = p_user_id), '[]'),
    'event_display_name', (select display_name from public.event_profiles where user_id = p_user_id)
  );
$$;

revoke all on function public.export_user_data(uuid) from public, anon, authenticated;
grant execute on function public.export_user_data(uuid) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exports', 'exports', false, 52428800, array['application/json'])
on conflict (id) do nothing;
