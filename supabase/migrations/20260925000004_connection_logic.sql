-- ============================================
-- updated_at trigger for profiles
-- ============================================
create or replace function profiles_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_profiles_set_updated_at
  before update on profiles
  for each row execute function profiles_set_updated_at();

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
-- BEFORE INSERT trigger on connections
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

create trigger trg_connections_before_insert
  before insert on connections
  for each row execute function connections_before_insert();

-- ============================================
-- AFTER UPDATE trigger: auto-create conversation
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

create trigger trg_connections_after_update
  after update on connections
  for each row execute function connections_after_update();

-- ============================================
-- get_incoming_requests
-- ============================================
create or replace function get_incoming_requests()
returns table (
  connection_id    bigint,
  from_user        uuid,
  username         text,
  display_name     text,
  avatar_url       text,
  bio              text,
  shared_interests text[],
  created_at       timestamptz
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
    shared_interest_labels(c.initiated_by, auth.uid()),
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
  profile_id        uuid,
  username          text,
  display_name      text,
  bio               text,
  location_city     text,
  avatar_url        text,
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
      or exists (
        select 1 from user_interests ui
        where ui.profile_id = p.id
          and ui.text ilike '%' || q || '%'
      )
    )
  order by p.username
  limit max_results;
$$;

grant execute on function search_people(text, int) to authenticated;