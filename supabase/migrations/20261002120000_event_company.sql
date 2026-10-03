-- Event interest and company are opt-in. Only the verified server may access them.
create table public.event_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 80)
);
create table public.event_interests (
  event_id uuid not null references public.listings(id) on delete cascade,
  user_id uuid not null references public.event_profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create table public.event_groups (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (id, event_id)
);
create table public.event_group_members (
  event_id uuid not null,
  group_id uuid not null,
  user_id uuid not null,
  joined_at timestamptz not null default now(),
  primary key (event_id, user_id),
  foreign key (group_id, event_id) references public.event_groups(id, event_id) on delete cascade,
  foreign key (event_id, user_id) references public.event_interests(event_id, user_id) on delete cascade
);
create index event_group_members_group_idx on public.event_group_members(group_id);

alter table public.event_profiles enable row level security;
alter table public.event_interests enable row level security;
alter table public.event_groups enable row level security;
alter table public.event_group_members enable row level security;
revoke all on public.event_profiles, public.event_interests, public.event_groups, public.event_group_members from anon, authenticated;
grant select, insert, update, delete on public.event_profiles, public.event_interests, public.event_groups, public.event_group_members to service_role;

-- A row lock serializes actions for an event, including simultaneous joins/leaves.
-- Membership is idempotent and capped at four people; a singleton is waiting.
create function public.event_company_action(p_event_id uuid, p_user_id uuid, p_name text, p_action text)
returns void language plpgsql set search_path = '' as $$
declare
  chosen_group uuid;
begin
  perform 1 from public.listings
    where id = p_event_id and listing_type = 'event'
      and (p_action in ('leave', 'uninterest') or
        (status in ('active', 'rescheduled') and (starts_at >= now() or ends_at >= now())))
    for update;
  if not found then raise exception 'Event unavailable' using errcode = 'P0002'; end if;
  if p_action not in ('interest', 'uninterest', 'join', 'leave') then
    raise exception 'Invalid event action' using errcode = '22023';
  end if;
  insert into public.event_profiles(user_id, display_name) values (p_user_id, p_name)
    on conflict (user_id) do update set display_name = excluded.display_name;
  if p_action in ('interest', 'join') then
    insert into public.event_interests(event_id, user_id) values (p_event_id, p_user_id)
      on conflict do nothing;
  end if;
  if p_action = 'join' then
    if exists (select 1 from public.event_group_members where event_id = p_event_id and user_id = p_user_id) then return; end if;
    select g.id into chosen_group from public.event_groups g
      join public.event_group_members m on m.group_id = g.id
      where g.event_id = p_event_id
      group by g.id, g.created_at having count(*) < 4
      order by g.created_at, g.id limit 1;
    if chosen_group is null then
      insert into public.event_groups(event_id) values (p_event_id) returning id into chosen_group;
    end if;
    insert into public.event_group_members(event_id, group_id, user_id) values (p_event_id, chosen_group, p_user_id);
  elsif p_action = 'leave' then
    delete from public.event_group_members where event_id = p_event_id and user_id = p_user_id;
  elsif p_action = 'uninterest' then
    delete from public.event_interests where event_id = p_event_id and user_id = p_user_id;
  end if;
  delete from public.event_groups g where g.event_id = p_event_id
    and not exists (select 1 from public.event_group_members m where m.group_id = g.id);
end;
$$;

-- One statement gives a consistent view; another user's group is never exposed.
create function public.event_company_snapshot(p_event_id uuid, p_user_id uuid)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'interested', coalesce((select jsonb_agg(jsonb_build_object('id', i.user_id, 'name', i.display_name))
      from (select p.user_id, p.display_name from public.event_interests e
        join public.event_profiles p on p.user_id = e.user_id
        where e.event_id = p_event_id order by e.created_at, p.user_id limit 50) i), '[]'::jsonb),
    'interestedCount', (select count(*) from public.event_interests where event_id = p_event_id),
    'isInterested', exists(select 1 from public.event_interests where event_id = p_event_id and user_id = p_user_id),
    'group', (select jsonb_build_object('id', mine.group_id, 'members',
      (select jsonb_agg(jsonb_build_object('id', p.user_id, 'name', p.display_name) order by m.joined_at, p.user_id)
        from public.event_group_members m join public.event_profiles p on p.user_id = m.user_id
        where m.group_id = mine.group_id))
      from public.event_group_members mine where mine.event_id = p_event_id and mine.user_id = p_user_id)
  );
$$;
revoke all on function public.event_company_action(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.event_company_snapshot(uuid, uuid) from public, anon, authenticated;
grant execute on function public.event_company_action(uuid, uuid, text, text) to service_role;
grant execute on function public.event_company_snapshot(uuid, uuid) to service_role;

create function public.event_categories()
returns jsonb language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(category order by category), '[]'::jsonb) from
    (select distinct category from public.listings where listing_type = 'event'
      and status in ('active', 'rescheduled') and (starts_at >= now() or ends_at >= now())
      and category is not null and length(btrim(category)) > 0) categories;
$$;
revoke all on function public.event_categories() from public, anon, authenticated;
grant execute on function public.event_categories() to service_role;

create function public.event_interest_counts(p_event_ids uuid[])
returns jsonb language sql stable set search_path = '' as $$
  select coalesce(jsonb_object_agg(event_id::text, total), '{}'::jsonb) from
    (select event_id, count(*) total from public.event_interests
      where event_id = any(p_event_ids) group by event_id) counts;
$$;
revoke all on function public.event_interest_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.event_interest_counts(uuid[]) to service_role;
