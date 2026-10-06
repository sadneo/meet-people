create or replace function get_events_with_interest(
  filter_category text default null,
  filter_city     text default null,
  max_results     int  default 30
)
returns table (
  event_id          bigint,
  title             text,
  description       text,
  category          text,
  location_name     text,
  location_city     text,
  starts_at         timestamptz,
  ends_at           timestamptz,
  host_id           uuid,
  host_username     text,
  host_display_name text,
  host_avatar_url   text,
  interested_count  int,
  i_am_interested   boolean
)
language sql
stable
security definer
as $$
  select
    m.id,
    m.title,
    m.description,
    m.category,
    m.location_name,
    p.location_city,
    m.starts_at,
    m.ends_at,
    m.host_id,
    p.username,
    p.display_name,
    p.avatar_url,
    (select count(*)::int from event_interest ei where ei.meetup_id = m.id),
    exists (
      select 1 from event_interest ei
      where ei.meetup_id = m.id and ei.profile_id = auth.uid()
    )
  from meetups m
  join profiles p on p.id = m.host_id
  where m.is_public = true
    and m.starts_at > now()
    and (filter_category is null or m.category = filter_category)
    and (filter_city is null or p.location_city = filter_city)
  order by m.starts_at asc
  limit max_results;
$$;

grant execute on function get_events_with_interest(text, text, int) to authenticated;

create or replace function express_event_interest(
  meetup_id_in bigint,
  note_in       text default null
)
returns void
language plpgsql
security definer
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into event_interest (meetup_id, profile_id, note)
  values (meetup_id_in, auth.uid(), note_in)
  on conflict (meetup_id, profile_id)
  do update set note = excluded.note;
end;
$$;

grant execute on function express_event_interest(bigint, text) to authenticated;

create or replace function withdraw_event_interest(meetup_id_in bigint)
returns void
language plpgsql
security definer
as $$
begin
  delete from event_interest
  where meetup_id = meetup_id_in
    and profile_id = auth.uid();
end;
$$;

grant execute on function withdraw_event_interest(bigint) to authenticated;

create or replace function get_event_matches(meetup_id_in bigint)
returns table (
  profile_id       uuid,
  username         text,
  display_name     text,
  avatar_url       text,
  bio              text,
  note             text,
  shared_interests text[],
  match_score      numeric
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
  select
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.bio,
    ei.note,
    shared_interest_labels(me, p.id),
    person_friend_score(me, p.id)
  from event_interest ei
  join profiles p on p.id = ei.profile_id
  where ei.meetup_id = meetup_id_in
    and ei.profile_id <> me
    and p.is_active = true
    and ei.profile_id not in (
      select case when user_a = me then user_b else user_a end
      from connections where user_a = me or user_b = me
    )
    and ei.profile_id not in (select blocked_id from blocks where blocker_id = me)
    and ei.profile_id not in (select blocker_id from blocks where blocked_id = me)
  order by person_friend_score(me, p.id) desc;
end;
$$;

grant execute on function get_event_matches(bigint) to authenticated;

create or replace function get_recommended_meetups(max_results int default 10)
returns table (
  meetup_id     bigint,
  title         text,
  description   text,
  category      text,
  location_name text,
  starts_at     timestamptz,
  host_username text,
  similarity    numeric
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
  select
    m.id,
    m.title,
    m.description,
    m.category,
    m.location_name,
    m.starts_at,
    p.username,
    round((
      vec_similarity(user_interest_vector(me), meetup_embedding(m.id)) * 0.6
      + vec_similarity(profile_embedding(me), meetup_embedding(m.id)) * 0.4
    )::numeric, 4)
  from meetups m
  join profiles p on p.id = m.host_id
  where m.is_public = true
    and m.starts_at > now()
    and m.id not in (select meetup_id from meetup_attendees where profile_id = me)
  order by 8 desc, m.starts_at asc
  limit max_results;
end;
$$;

grant execute on function get_recommended_meetups(int) to authenticated;