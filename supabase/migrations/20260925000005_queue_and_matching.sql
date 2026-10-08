-- ============================================
-- AVAILABILITY OVERLAP (minutes)
-- ============================================
create or replace function availability_overlap_minutes(a uuid, b uuid)
returns int
language sql
stable
as $$
  select coalesce(sum(
    greatest(0,
      extract(epoch from (
        least(av1.end_time, av2.end_time)
        - greatest(av1.start_time, av2.start_time)
      )) / 60
    )
  )::int, 0)
  from availability av1
  join availability av2
    on av2.profile_id = b
   and av2.dow = av1.dow
  where av1.profile_id = a;
$$;

-- ============================================
-- SOCIAL RELIABILITY
-- ============================================
create or replace function social_reliability(p_id uuid)
returns numeric
language sql
stable
as $$
  select coalesce(
    avg(case when met then 1.0 else 0.0 end),
    0.5
  )::numeric
  from interaction_outcomes
  where user_a = p_id or user_b = p_id;
$$;

-- ============================================
-- COLLABORATIVE FIT
-- ============================================
create or replace function collaborative_fit(me uuid, them uuid)
returns numeric
language plpgsql
stable
as $$
declare
  me_vec   double precision[] := user_interest_vector(me);
  them_vec double precision[] := user_interest_vector(them);
  a_vec    double precision[];
  b_vec    double precision[];
  w1       double precision;
  w2       double precision;
  w        double precision;
  weighted double precision := 0;
  total_w  double precision := 0;
  rec      record;
begin
  for rec in
    select user_a, user_b, rating
    from interaction_outcomes
    where rating is not null
      and user_a <> me and user_b <> me
      and user_a <> them and user_b <> them
  loop
    a_vec := user_interest_vector(rec.user_a);
    b_vec := user_interest_vector(rec.user_b);

    w1 := vec_similarity(me_vec, a_vec) * vec_similarity(them_vec, b_vec);
    w2 := vec_similarity(me_vec, b_vec) * vec_similarity(them_vec, a_vec);
    w  := greatest(w1, w2);

    if w > 0.05 then
      weighted := weighted + w * (rec.rating::double precision / 5.0);
      total_w  := total_w + w;
    end if;
  end loop;

  if total_w = 0 then
    return 0.5;
  end if;

  return round((weighted / total_w)::numeric, 4);
end;
$$;

-- ============================================
-- QUEUE MANAGEMENT
-- ============================================
create or replace function join_queue(qtype text)
returns void
language plpgsql
security definer
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if qtype not in ('matchmaking', 'downtime', 'dating') then
    raise exception 'Invalid queue type: %', qtype;
  end if;

  insert into queue_entries (profile_id, queue_type)
  values (auth.uid(), qtype)
  on conflict (profile_id)
  do update set queue_type = excluded.queue_type,
                joined_at  = now();
end;
$$;

grant execute on function join_queue(text) to authenticated;

create or replace function leave_queue()
returns void
language plpgsql
security definer
as $$
begin
  delete from queue_entries where profile_id = auth.uid();
end;
$$;

grant execute on function leave_queue() to authenticated;

-- ============================================
-- FRIENDSHIP SCORE
-- ============================================
create or replace function person_friend_score(me uuid, other uuid)
returns numeric
language plpgsql
stable
as $$
declare
  iscore numeric;
  bscore numeric;
  dscore numeric;
  mscore numeric;
  ascore numeric;
  rscore numeric;
  cf     numeric;
  mutual_n int;
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

  select count(*)::int into mutual_n
  from (
    select case when user_a = me then user_b else user_a end as f
    from connections where status = 'accepted' and (user_a = me or user_b = me)
  ) a
  join (
    select case when user_a = other then user_b else user_a end as f
    from connections where status = 'accepted' and (user_a = other or user_b = other)
  ) b on a.f = b.f;

  mscore := least(1, mutual_n::numeric / 5);

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
      iscore * 0.35
    + bscore * 0.15
    + dscore * 0.15
    + mscore * 0.10
    + ascore * 0.05
    + rscore * 0.10
    + cf     * 0.10
  )::numeric, 4);
end;
$$;

-- ============================================
-- UNIFIED QUEUE MATCH (matchmaking + downtime)
-- ============================================
create or replace function get_queue_match()
returns table (
  queue_kind          text,
  match_profile_id    uuid,
  match_username      text,
  match_display_name  text,
  match_avatar_url    text,
  match_bio           text,
  match_score         numeric,
  shared_interests    text[],
  overlap_minutes     int,
  shared_windows      jsonb,
  event_id            bigint,
  event_title         text,
  event_description   text,
  event_category      text,
  event_location      text,
  event_starts_at     timestamptz,
  event_host_id       uuid
)
language plpgsql
stable
security definer
as $$
declare
  me      uuid := auth.uid();
  my_type text;
  best_match uuid;
  my_ivec double precision[];
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  select q.queue_type into my_type
  from queue_entries q
  where q.profile_id = me;

  if my_type is null then
    raise exception 'You are not in a queue';
  end if;

  if my_type = 'dating' then
    return;
  end if;

  my_ivec := user_interest_vector(me);

  select q.profile_id
  into best_match
  from queue_entries q
  join profiles p on p.id = q.profile_id
  where q.queue_type = my_type
    and q.profile_id <> me
    and p.is_active = true
    and q.profile_id not in (
      select case when user_a = me then user_b else user_a end
      from connections where user_a = me or user_b = me
    )
    and q.profile_id not in (select blocked_id from blocks where blocker_id = me)
    and q.profile_id not in (select blocker_id from blocks where blocked_id = me)
  order by
    case when my_type = 'downtime'
      then availability_overlap_minutes(me, q.profile_id)
      else 0
    end desc,
    person_friend_score(me, q.profile_id) desc
  limit 1;

  if best_match is null then
    return;
  end if;

  if my_type = 'downtime' then
    return query
    select
      'downtime',
      bp.id,
      bp.username,
      bp.display_name,
      bp.avatar_url,
      bp.bio,
      person_friend_score(me, bp.id),
      shared_interest_labels(me, bp.id),
      availability_overlap_minutes(me, bp.id),
      (
        select jsonb_agg(jsonb_build_object(
          'dow', av1.dow,
          'start', greatest(av1.start_time, av2.start_time),
          'end', least(av1.end_time, av2.end_time)
        ) order by av1.dow, av1.start_time)
        from availability av1
        join availability av2
          on av2.profile_id = bp.id
         and av2.dow = av1.dow
        where av1.profile_id = me
          and least(av1.end_time, av2.end_time) > greatest(av1.start_time, av2.start_time)
      ),
      null::bigint, null::text, null::text, null::text, null::text,
      null::timestamptz, null::uuid
    from profiles bp
    where bp.id = best_match;
    return;
  end if;

  return query
  select
    'matchmaking',
    bp.id,
    bp.username,
    bp.display_name,
    bp.avatar_url,
    bp.bio,
    person_friend_score(me, bp.id),
    shared_interest_labels(me, bp.id),
    availability_overlap_minutes(me, bp.id),
    null::jsonb,
    m.id,
    m.title,
    m.description,
    m.category,
    m.location_name,
    m.starts_at,
    m.host_id
  from profiles bp
  left join meetups m
    on m.is_public = true
   and m.starts_at > now()
   and (
     m.max_attendees is null
     or (select count(*) from meetup_attendees where meetup_id = m.id) < m.max_attendees
   )
   and vec_similarity(my_ivec, meetup_embedding(m.id)) > 0.02
   and vec_similarity(user_interest_vector(bp.id), meetup_embedding(m.id)) > 0.02
   and m.id not in (select meetup_id from meetup_attendees where profile_id = me)
   and m.id not in (select meetup_id from meetup_attendees where profile_id = bp.id)
  where bp.id = best_match
  order by
    (
      vec_similarity(my_ivec, meetup_embedding(m.id))
      + vec_similarity(user_interest_vector(bp.id), meetup_embedding(m.id))
    ) desc nulls last,
    m.starts_at asc nulls last
  limit 1;
end;
$$;

grant execute on function get_queue_match() to authenticated;

-- ============================================
-- RECORD AN OUTCOME
-- ============================================
create or replace function record_interaction(
  other_id       uuid,
  context_in     text,
  met_in         boolean,
  rating_in      int,
  friends_in     boolean default false,
  dating_in      boolean default false
)
returns void
language plpgsql
security definer
as $$
declare
  me uuid := auth.uid();
  a  uuid;
  b  uuid;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  if context_in not in ('queue_match', 'event_match', 'date') then
    raise exception 'Invalid context';
  end if;
  if rating_in is not null and (rating_in < 1 or rating_in > 5) then
    raise exception 'Rating must be 1-5';
  end if;

  if me < other_id then a := me; b := other_id;
  else a := other_id; b := me;
  end if;

  insert into interaction_outcomes
    (user_a, user_b, context, met, rating, became_friends, became_dating)
  values
    (a, b, context_in, met_in, rating_in, friends_in, dating_in)
  on conflict (user_a, user_b, context)
  do update set
    met            = coalesce(excluded.met, interaction_outcomes.met),
    rating         = coalesce(excluded.rating, interaction_outcomes.rating),
    became_friends = interaction_outcomes.became_friends or excluded.became_friends,
    became_dating  = interaction_outcomes.became_dating  or excluded.became_dating,
    updated_at     = now();
end;
$$;

grant execute on function record_interaction(uuid, text, boolean, int, boolean, boolean) to authenticated;

-- ============================================
-- QUEUE STATUS
-- ============================================
create or replace function get_queue_status()
returns table (
  my_queue     text,
  others_in_my_queue int
)
language sql
stable
security definer
as $$
  select
    (select queue_type from queue_entries where profile_id = auth.uid()),
    (
      select count(*)::int
      from queue_entries
      where queue_type = (
        select queue_type from queue_entries where profile_id = auth.uid()
      )
      and profile_id <> auth.uid()
    );
$$;

grant execute on function get_queue_status() to authenticated;
