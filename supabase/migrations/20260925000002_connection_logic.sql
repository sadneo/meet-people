-- ============================================
-- can_connect: guard against blocked pairs
-- ============================================
create or replace function can_connect(user1 uuid, user2 uuid)
returns boolean
language sql
stable
as $$
  select not exists (
    select 1 from blocks b
    where (b.blocker_id = user1 and b.blocked_id = user2)
       or (b.blocker_id = user2 and b.blocked_id = user1)
  );
$$;

-- ============================================
-- Rate limit helper
-- ============================================
create or replace function connection_requests_today()
returns int
language sql
stable
security definer
as $$
  select count(*)::int
  from connections c
  where c.initiated_by = auth.uid()
    and c.created_at > now() - interval '24 hours';
$$;

-- ============================================
-- BEFORE INSERT trigger
-- ============================================
create or replace function connections_before_insert()
returns trigger
language plpgsql
as $$
declare
  a uuid;
  b uuid;
begin
  if new.user_a < new.user_b then
    a := new.user_a; b := new.user_b;
  else
    a := new.user_b; b := new.user_a;
  end if;
  new.user_a := a;
  new.user_b := b;

  if new.initiated_by <> a and new.initiated_by <> b then
    raise exception 'initiated_by must be a participant';
  end if;

  if not can_connect(a, b) then
    raise exception 'Cannot connect: blocked relationship exists';
  end if;

  if connection_requests_today() >= 10 then
    raise exception 'Connection request rate limit exceeded';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_connections_before_insert on connections;
create trigger trg_connections_before_insert
  before insert on connections
  for each row execute function connections_before_insert();

-- ============================================
-- AFTER UPDATE trigger: auto-create conversation on accept
-- ============================================
create or replace function connections_after_update()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'accepted' and old.status = 'pending' then
    insert into conversations (user_a, user_b)
    values (new.user_a, new.user_b)
    on conflict (user_a, user_b) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_connections_after_update on connections;
create trigger trg_connections_after_update
  after update on connections
  for each row execute function connections_after_update();

-- ============================================
-- get_incoming_requests
-- ============================================
create or replace function get_incoming_requests()
returns table (
  connection_id bigint,
  from_user     uuid,
  username      text,
  display_name  text,
  avatar_url    text,
  bio           text,
  shared_interests text[],
  created_at    timestamptz
)
language sql
stable
security definer
as $$
  select
    c.id,
    c.initiated_by,
    p.username,
    p.display_name,
    p.avatar_url,
    p.bio,
    (
      select array_agg(i.name order by i.name)
      from profile_interests pi
      join interests i on i.id = pi.interest_id
      where pi.profile_id = p.id
        and pi.interest_id in (
          select pi2.interest_id
          from profile_interests pi2
          where pi2.profile_id = auth.uid()
        )
    ),
    c.created_at
  from connections c
  join profiles p on p.id = c.initiated_by
  where c.status = 'pending'
    and c.initiated_by <> auth.uid()
    and (c.user_a = auth.uid() or c.user_b = auth.uid())
  order by c.created_at desc;
$$;

grant execute on function get_incoming_requests() to authenticated;

-- ============================================
-- get_sent_requests
-- ============================================
create or replace function get_sent_requests()
returns table (
  connection_id bigint,
  to_user       uuid,
  username      text,
  display_name  text,
  avatar_url    text,
  created_at    timestamptz
)
language sql
stable
security definer
as $$
  select
    c.id,
    case when c.user_a = auth.uid() then c.user_b else c.user_a end,
    p.username,
    p.display_name,
    p.avatar_url,
    c.created_at
  from connections c
  join profiles p
    on p.id = case when c.user_a = auth.uid() then c.user_b else c.user_a end
  where c.status = 'pending'
    and c.initiated_by = auth.uid()
  order by c.created_at desc;
$$;

grant execute on function get_sent_requests() to authenticated;

-- ============================================
-- search_people
-- ============================================
create or replace function search_people(q text, max_results int default 20)
returns table (
  profile_id    uuid,
  username      text,
  display_name  text,
  bio           text,
  location_city text,
  avatar_url    text,
  connection_status text
)
language sql
stable
security definer
as $$
  select
    p.id,
    p.username,
    p.display_name,
    p.bio,
    p.location_city,
    p.avatar_url,
    coalesce(
      (
        select case
          when c.status = 'accepted' then 'connected'
          when c.status = 'pending' and c.initiated_by = auth.uid() then 'pending_sent'
          when c.status = 'pending' and c.initiated_by <> auth.uid() then 'pending_received'
          else 'none'
        end
        from connections c
        where (c.user_a = auth.uid() and c.user_b = p.id)
           or (c.user_b = auth.uid() and c.user_a = p.id)
        limit 1
      ),
      'none'
    )
  from profiles p
  where p.is_active = true
    and p.id <> auth.uid()
    and p.id not in (select b.blocked_id from blocks b where b.blocker_id = auth.uid())
    and p.id not in (select b.blocker_id from blocks b where b.blocked_id = auth.uid())
    and (
      p.username ilike '%' || q || '%'
      or p.display_name ilike '%' || q || '%'
      or p.location_city ilike '%' || q || '%'
    )
  order by p.username
  limit max_results;
$$;

grant execute on function search_people(text, int) to authenticated;

-- ============================================
-- get_suggested_connections
-- Rules-based: interests, location, mutuals, activity.
-- Returns every eligible candidate (not already connected,
-- not blocked) scored and sorted. No interest-must-overlap
-- filter — the score itself reflects the overlap.
-- ============================================
create or replace function get_suggested_connections(
  max_results int default 20,
  min_score numeric default 0.0
)
returns table (
  profile_id        uuid,
  username          text,
  display_name      text,
  bio               text,
  location_city     text,
  avatar_url        text,
  shared_interests  text[],
  mutual_count      int,
  score             numeric
)
language plpgsql
stable
security definer
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  return query
  with my_interests as (
    select pi.interest_id
    from profile_interests pi
    where pi.profile_id = me
  ),
  my_friends as (
    select case when c.user_a = me then c.user_b else c.user_a end as f
    from connections c
    where c.status = 'accepted'
      and (c.user_a = me or c.user_b = me)
  ),
  excluded as (
    select case when c.user_a = me then c.user_b else c.user_a end as f
    from connections c
    where c.user_a = me or c.user_b = me
  ),
  me_profile as (
    select p.latitude, p.longitude
    from profiles p
    where p.id = me
  ),
  scored as (
    select
      p.id,
      p.username,
      p.display_name,
      p.bio,
      p.location_city,
      p.avatar_url,
      p.last_seen_at,
      coalesce(
        (
          select count(*)::numeric
          from profile_interests pi
          where pi.profile_id = p.id
            and pi.interest_id in (select mi.interest_id from my_interests mi)
        ) / greatest(
          (
            select count(*)::numeric
            from profile_interests pi2
            where pi2.profile_id = p.id
          ), 1
        ),
        0
      ) as interest_score,
      (
        select count(*)::int
        from my_friends mf
        where mf.f in (
          select case when c.user_a = p.id then c.user_b else c.user_a end
          from connections c
          where c.status = 'accepted'
            and (c.user_a = p.id or c.user_b = p.id)
        )
      ) as mutual_count,
      case
        when p.latitude is null or p.longitude is null then 0.5
        when mp.latitude is null or mp.longitude is null then 0.5
        else greatest(0, 1 - (
          6371 * acos(
            least(1, greatest(-1,
              cos(radians(mp.latitude)) * cos(radians(p.latitude))
              * cos(radians(p.longitude) - radians(mp.longitude))
              + sin(radians(mp.latitude)) * sin(radians(p.latitude))
            ))
          ) / 100.0
        ))
      end as distance_score,
      case
        when p.last_seen_at is null then 0.3
        else greatest(0, 1 - (
          extract(epoch from (now() - p.last_seen_at))
          / (60*60*24*30)
        ))
      end as activity_score
    from profiles p
    cross join me_profile mp
    where p.id <> me
      and p.is_active = true
      and p.id not in (select e.f from excluded e)
      and p.id not in (select b.blocked_id from blocks b where b.blocker_id = me)
      and p.id not in (select b.blocker_id from blocks b where b.blocked_id = me)
  )
  select
    s.id,
    s.username,
    s.display_name,
    s.bio,
    s.location_city,
    s.avatar_url,
    (
      select array_agg(i.name order by i.name)
      from profile_interests pi
      join interests i on i.id = pi.interest_id
      where pi.profile_id = s.id
        and pi.interest_id in (select mi.interest_id from my_interests mi)
    ),
    s.mutual_count,
    round((
      s.interest_score * 0.45
      + s.distance_score::numeric * 0.25
      + least(1, s.mutual_count::numeric / 5) * 0.15
      + s.activity_score::numeric * 0.15
    )::numeric, 4) as score
  from scored s
  where round((
      s.interest_score * 0.45
      + s.distance_score::numeric * 0.25
      + least(1, s.mutual_count::numeric / 5) * 0.15
      + s.activity_score::numeric * 0.15
    )::numeric, 4) >= min_score
  order by score desc, s.last_seen_at desc nulls last
  limit max_results;
end;
$$;

grant execute on function get_suggested_connections(int, numeric) to authenticated;