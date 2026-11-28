-- Personal stats: lets a signed-in person see their own usage, and nobody else's.
-- The API passes the caller's verified user ID; service_role only.
begin;

create function public.usage_my_stats(actor_in uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with days as (
    select d::date as day from generate_series((now() at time zone 'utc')::date - 29, (now() at time zone 'utc')::date, interval '1 day') d
  ), per_day as (
    select days.day, coalesce(u.seconds, 0) / 60 as minutes, coalesce(u.profile_opens, 0) as profile_opens
    from days left join usage_private.daily u on u.day = days.day and u.user_id = actor_in
  ), totals as (
    select coalesce(sum(seconds), 0) as seconds,
      count(*) filter (where seconds > 0) as days_active,
      coalesce(sum(profile_opens), 0) as profile_opens
    from usage_private.daily where user_id = actor_in
  ), sent as (
    select count(*) as n from public.messages where sender_id = actor_in
  ), received as (
    select count(*) as n
    from public.conversation_participants p
    join public.messages m on m.conversation_id = p.conversation_id
      and m.seq > p.joined_after_seq
      and m.sender_id is distinct from p.user_id
      and (p.left_at is null or m.created_at <= p.left_at)
    where p.user_id = actor_in
  )
  select jsonb_build_object(
    'minutesUsed', (select seconds from totals) / 60,
    'daysActive', (select days_active from totals),
    'profileOpens', (select profile_opens from totals),
    'messagesSent', (select n from sent),
    'messagesReceived', (select n from received),
    'lastSeen', (select last_beat from usage_private.presence where user_id = actor_in),
    'series', (select jsonb_agg(jsonb_build_object('day', day, 'minutes', minutes, 'profileOpens', profile_opens) order by day) from per_day)
  )
$$;

revoke all on function public.usage_my_stats(uuid) from public, anon, authenticated;
grant execute on function public.usage_my_stats(uuid) to service_role;

commit;
