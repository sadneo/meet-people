-- Usage dashboard: privacy-minimal activity counters.
--
-- Stored per user, per day: seconds of foreground use and number of profile
-- opens. No message text, no counterpart IDs, no locations. Rows are removed
-- with the account (ON DELETE CASCADE on auth.users).
--
-- Only the verified Express service (service_role) can call these functions.
-- The API decides who may see what:
--   public  -> usage_public_summary()   aggregate totals only, no per-user data
--   admin   -> usage_admin_users()      per-user table, allowlisted accounts only
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- The functions below read messaging tables. Resolve them when called rather than
-- when created, so this migration also applies on databases replayed without them.
set local check_function_bodies = off;

create schema if not exists usage_private;
revoke all on schema usage_private from public, anon, authenticated;

create table usage_private.daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  seconds integer not null default 0 check (seconds between 0 and 86400),
  profile_opens integer not null default 0 check (profile_opens >= 0),
  primary key (user_id, day)
);
create index usage_daily_day_idx on usage_private.daily(day);

create table usage_private.presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_beat timestamptz not null
);

alter table usage_private.daily enable row level security;
alter table usage_private.presence enable row level security;
revoke all on usage_private.daily, usage_private.presence from public, anon, authenticated;

-- A heartbeat credits the time since the previous beat, capped at 65 seconds,
-- so closing the app or leaving a tab open cannot inflate "minutes used".
-- Beats less than 10 seconds apart are ignored. A beat after a long gap starts
-- a new session and is credited a flat 15 seconds.
create function public.usage_heartbeat(actor_in uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  previous timestamptz;
  elapsed integer;
  credit integer;
  today date := (now() at time zone 'utc')::date;
begin
  if actor_in is null then return; end if;
  select last_beat into previous from usage_private.presence where user_id = actor_in for update;
  if not found then
    insert into usage_private.presence(user_id, last_beat) values (actor_in, now()) on conflict do nothing;
    insert into usage_private.daily(user_id, day) values (actor_in, today) on conflict do nothing;
    return;
  end if;
  elapsed := floor(extract(epoch from (now() - previous)))::integer;
  if elapsed < 10 then return; end if;
  credit := case when elapsed <= 65 then elapsed else 15 end;
  update usage_private.presence set last_beat = now() where user_id = actor_in;
  insert into usage_private.daily(user_id, day, seconds) values (actor_in, today, credit)
    on conflict (user_id, day) do update
      set seconds = least(86400, usage_private.daily.seconds + excluded.seconds);
end $$;

create function public.usage_profile_open(actor_in uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare today date := (now() at time zone 'utc')::date;
begin
  if actor_in is null then return; end if;
  insert into usage_private.daily(user_id, day, profile_opens) values (actor_in, today, 1)
    on conflict (user_id, day) do update set profile_opens = usage_private.daily.profile_opens + 1;
end $$;

-- Public aggregate: totals and a 30-day series. Nothing here identifies anyone.
create function public.usage_public_summary() returns jsonb
language sql stable security definer set search_path = '' as $$
  with days as (
    select d::date as day from generate_series((now() at time zone 'utc')::date - 29, (now() at time zone 'utc')::date, interval '1 day') d
  ), per_day as (
    select days.day,
      count(u.user_id) filter (where u.seconds > 0) as active_users,
      coalesce(sum(u.seconds), 0) / 60 as minutes,
      coalesce(sum(u.profile_opens), 0) as profile_opens
    from days left join usage_private.daily u on u.day = days.day
    group by days.day
  ), msg as (
    select
      count(*) as total,
      count(*) filter (where created_at >= now() - interval '24 hours') as last_24h,
      count(*) filter (where created_at >= now() - interval '7 days') as last_7d
    from public.messages
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'totalUsers', (select count(*) from public.account_profiles),
    'onlineNow', (select count(*) from usage_private.presence where last_beat >= now() - interval '2 minutes'),
    'activeToday', (select count(distinct user_id) from usage_private.daily where day = (now() at time zone 'utc')::date and seconds > 0),
    'active7d', (select count(distinct user_id) from usage_private.daily where day >= (now() at time zone 'utc')::date - 6 and seconds > 0),
    'active30d', (select count(distinct user_id) from usage_private.daily where day >= (now() at time zone 'utc')::date - 29 and seconds > 0),
    'minutesTotal', (select coalesce(sum(seconds), 0) / 60 from usage_private.daily),
    'profileOpensTotal', (select coalesce(sum(profile_opens), 0) from usage_private.daily),
    'messagesTotal', (select total from msg),
    'messages24h', (select last_24h from msg),
    'messages7d', (select last_7d from msg),
    'series', (select coalesce(jsonb_agg(jsonb_build_object(
        'day', day, 'activeUsers', active_users, 'minutes', minutes, 'profileOpens', profile_opens) order by day), '[]'::jsonb) from per_day)
  )
$$;

-- Admin listing: one row per account. Names and avatar URL come from the
-- account profile; photos are fetched separately by the admin-only photo route.
create function public.usage_admin_users() returns jsonb
language sql stable security definer set search_path = '' as $$
  with usage as (
    select user_id,
      sum(seconds) as seconds,
      count(*) filter (where seconds > 0) as days_active,
      sum(profile_opens) as profile_opens,
      max(day) filter (where seconds > 0) as last_day
    from usage_private.daily group by user_id
  ), sent as (
    select sender_id as user_id, count(*) as n from public.messages where sender_id is not null group by sender_id
  ), received as (
    select p.user_id, count(*) as n
    from public.conversation_participants p
    join public.messages m on m.conversation_id = p.conversation_id
      and m.seq > p.joined_after_seq
      and m.sender_id is distinct from p.user_id
      and (p.left_at is null or m.created_at <= p.left_at)
    group by p.user_id
  )
  select coalesce(jsonb_agg(entry order by (entry->>'lastSeen') desc nulls last, entry->>'displayName'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', a.id,
      'username', a.username,
      'displayName', a.display_name,
      'avatarUrl', a.avatar_url,
      'joinedAt', a.created_at,
      'lastSeen', pr.last_beat,
      'online', coalesce(pr.last_beat >= now() - interval '2 minutes', false),
      'minutesUsed', coalesce(u.seconds, 0) / 60,
      'daysActive', coalesce(u.days_active, 0),
      'profileOpens', coalesce(u.profile_opens, 0),
      'messagesSent', coalesce(s.n, 0),
      'messagesReceived', coalesce(r.n, 0),
      'hasUploadedPhoto', exists(select 1 from photo_private.photos ph where ph.user_id = a.id and ph.jpeg is not null)
    ) as entry
    from public.account_profiles a
    left join usage u on u.user_id = a.id
    left join usage_private.presence pr on pr.user_id = a.id
    left join sent s on s.user_id = a.id
    left join received r on r.user_id = a.id
  ) listing
$$;

-- Primary uploaded photo as base64 JPEG, for the admin dashboard thumbnail.
create function public.usage_admin_photo(owner_in uuid) returns text
language sql stable security definer set search_path = '' as $$
  select encode(jpeg, 'base64') from photo_private.photos where user_id = owner_in and jpeg is not null
$$;

revoke all on function public.usage_heartbeat(uuid), public.usage_profile_open(uuid),
  public.usage_public_summary(), public.usage_admin_users(), public.usage_admin_photo(uuid)
  from public, anon, authenticated;
grant execute on function public.usage_heartbeat(uuid), public.usage_profile_open(uuid),
  public.usage_public_summary(), public.usage_admin_users(), public.usage_admin_photo(uuid)
  to service_role;

commit;
