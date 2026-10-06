-- ============================================
-- DATING COMPATIBILITY SCORE
-- Heavier weights on collaborative_fit, bio, and reliability.
-- ============================================
create or replace function person_dating_score(me uuid, other uuid)
returns numeric
language plpgsql
stable
as $$
declare
  iscore numeric;
  bscore numeric;
  dscore numeric;
  ascore numeric;
  rscore numeric;
  cf     numeric;
  my_lat double precision; my_lng double precision;
  o_lat  double precision; o_lng  double precision;
  o_last timestamptz;
begin
  iscore := vec_similarity(user_interest_vector(me), user_interest_vector(other))::numeric;
  bscore := vec_similarity(profile_embedding(me), profile_embedding(other))::numeric;

  select latitude, longitude into my_lat, my_lng from profiles where id = me;
  select latitude, longitude, last_seen_at into o_lat, o_lng, o_last
    from profiles where id = other;

  if my_lat is null or o_lat is null then
    dscore := 0.5;
  else
    dscore := greatest(0, 1 - (
      6371 * acos(
        least(1, greatest(-1,
          cos(radians(my_lat)) * cos(radians(o_lat))
          * cos(radians(o_lng) - radians(my_lng))
          + sin(radians(my_lat)) * sin(radians(o_lat))
        ))
      ) / 100.0
    ));
  end if;

  if o_last is null then
    ascore := 0.3;
  else
    ascore := greatest(0, 1 - (
      extract(epoch from (now() - o_last)) / (60*60*24*30)
    ));
  end if;

  rscore := social_reliability(other);
  cf     := collaborative_fit(me, other);

  return round((
      cf     * 0.30
    + bscore * 0.20
    + rscore * 0.15
    + iscore * 0.15
    + dscore * 0.10
    + ascore * 0.10
  )::numeric, 4);
end;
$$;

-- ============================================
-- DATING QUEUE MATCH
-- Best candidate + suggested first date (window + place).
-- ============================================
create or replace function get_dating_match()
returns table (
  match_profile_id   uuid,
  match_username     text,
  match_display_name text,
  match_avatar_url   text,
  match_bio          text,
  match_score        numeric,
  shared_interests   text[],
  suggested_dow      int,
  suggested_start    time,
  suggested_end      time,
  suggested_place    text,
  suggested_lat      double precision,
  suggested_lng      double precision
)
language plpgsql
stable
security definer
as $$
declare
  me      uuid := auth.uid();
  my_type text;
  best    uuid;
  win_rec record;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  select q.queue_type into my_type
  from queue_entries q
  where q.profile_id = me;

  if my_type is null or my_type <> 'dating' then
    raise exception 'You are not in the dating queue';
  end if;

  select q.profile_id
  into best
  from queue_entries q
  join profiles p on p.id = q.profile_id
  where q.queue_type = 'dating'
    and q.profile_id <> me
    and p.is_active = true
    and q.profile_id not in (select blocked_id from blocks where blocker_id = me)
    and q.profile_id not in (select blocker_id from blocks where blocked_id = me)
    and not exists (
      select 1 from dating_matches d
      where (d.user_a = me and d.user_b = q.profile_id)
         or (d.user_b = me and d.user_a = q.profile_id)
    )
  order by person_dating_score(me, q.profile_id) desc
  limit 1;

  if best is null then
    return;
  end if;

  select
    av1.dow,
    greatest(av1.start_time, av2.start_time) as s,
    least(av1.end_time, av2.end_time) as e
  into win_rec
  from availability av1
  join availability av2
    on av2.profile_id = best
   and av2.dow = av1.dow
  where av1.profile_id = me
    and least(av1.end_time, av2.end_time) > greatest(av1.start_time, av2.start_time)
  order by
    (extract(epoch from (least(av1.end_time, av2.end_time)
                        - greatest(av1.start_time, av2.start_time)))) desc,
    av1.dow asc
  limit 1;

  return query
  select
    bp.id,
    bp.username,
    bp.display_name,
    bp.avatar_url,
    bp.bio,
    person_dating_score(me, bp.id),
    shared_interest_labels(me, bp.id),
    win_rec.dow,
    win_rec.s,
    win_rec.e,
    m.location_name,
    m.latitude,
    m.longitude
  from profiles bp
  left join meetups m
    on m.is_public = true
   and m.id in (
     select m2.id from meetups m2
     where m2.is_public = true
       and m2.id not in (select meetup_id from meetup_attendees where profile_id = me)
       and m2.id not in (select meetup_id from meetup_attendees where profile_id = bp.id)
     order by m2.starts_at asc
     limit 1
   )
  where bp.id = best;
end;
$$;

grant execute on function get_dating_match() to authenticated;

-- ============================================
-- DATING MATCH LIFECYCLE
-- ============================================
create or replace function request_dating_match(other_id uuid)
returns bigint
language plpgsql
security definer
as $$
declare
  me uuid := auth.uid();
  a  uuid;
  b  uuid;
  new_id bigint;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  if me = other_id then
    raise exception 'Cannot match with yourself';
  end if;
  if not can_connect(me, other_id) then
    raise exception 'Blocked relationship exists';
  end if;

  if me < other_id then a := me; b := other_id;
  else a := other_id; b := me;
  end if;

  insert into dating_matches (user_a, user_b, status, initiated_by)
  values (a, b, 'pending', me)
  on conflict (user_a, user_b) do nothing
  returning id into new_id;

  if new_id is null then
    select id into new_id from dating_matches
    where user_a = a and user_b = b;
  end if;

  return new_id;
end;
$$;

grant execute on function request_dating_match(uuid) to authenticated;

create or replace function accept_dating_match(match_id bigint)
returns void
language plpgsql
security definer
as $$
begin
  update dating_matches
  set status = 'matched', responded_at = now()
  where id = match_id
    and status = 'pending'
    and initiated_by <> auth.uid()
    and (user_a = auth.uid() or user_b = auth.uid());

  if not found then
    raise exception 'No pending dating match to accept';
  end if;
end;
$$;

grant execute on function accept_dating_match(bigint) to authenticated;

create or replace function end_dating_match(match_id bigint)
returns void
language plpgsql
security definer
as $$
begin
  update dating_matches
  set status = 'ended', ended_at = now()
  where id = match_id
    and status = 'matched'
    and (user_a = auth.uid() or user_b = auth.uid());

  if not found then
    raise exception 'No matched dating row to end';
  end if;
end;
$$;

grant execute on function end_dating_match(bigint) to authenticated;