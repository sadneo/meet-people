-- ============================================
-- EXTENSIONS
-- ============================================
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;
create extension if not exists pg_net;
create extension if not exists http with schema extensions;

-- ============================================
-- PROFILES
-- ============================================
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text unique not null,
  display_name  text not null,
  bio           text,
  birthdate     date,
  location_city text,
  latitude      double precision,
  longitude     double precision,
  avatar_url    text,
  is_active     boolean default true,
  last_seen_at  timestamptz,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index profiles_location_idx on profiles (latitude, longitude);

-- ============================================
-- USER INTERESTS (free text, embedded)
-- ============================================
create table user_interests (
  id         bigint generated always as identity primary key,
  profile_id uuid references profiles(id) on delete cascade,
  text       text not null check (length(trim(text)) > 0),
  embedding  double precision[],
  created_at timestamptz default now(),
  constraint user_interests_unique_per_user unique (profile_id, text)
);

create index user_interests_profile_idx on user_interests (profile_id);

-- ============================================
-- AVAILABILITY (recurring weekly windows)
-- dow: 0=Sunday..6=Saturday
-- ============================================
create table availability (
  id         bigint generated always as identity primary key,
  profile_id uuid references profiles(id) on delete cascade,
  dow        int  not null check (dow between 0 and 6),
  start_time time not null,
  end_time   time not null,
  created_at timestamptz default now(),
  check (start_time < end_time)
);

create index availability_profile_idx on availability (profile_id);
create index availability_dow_idx on availability (dow);

-- ============================================
-- MEETUPS
-- ============================================
create table meetups (
  id            bigint generated always as identity primary key,
  host_id       uuid references profiles(id) on delete cascade,
  title         text not null,
  description   text,
  category      text,
  location_name text,
  latitude      double precision,
  longitude     double precision,
  starts_at     timestamptz not null,
  ends_at       timestamptz,
  max_attendees int,
  is_public     boolean default true,
  created_at    timestamptz default now()
);

create index meetups_starts_at_idx on meetups (starts_at);

create table meetup_attendees (
  meetup_id  bigint references meetups(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  status     text default 'going' check (status in ('going', 'maybe', 'declined')),
  joined_at  timestamptz default now(),
  primary key (meetup_id, profile_id)
);

-- ============================================
-- EVENT INTEREST ("I'm down")
-- ============================================
create table event_interest (
  meetup_id  bigint references meetups(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  note       text,
  created_at timestamptz default now(),
  primary key (meetup_id, profile_id)
);

create index event_interest_meetup_idx on event_interest (meetup_id);

-- ============================================
-- QUEUE ENTRIES (one queue per user)
-- queue_type: matchmaking | downtime | dating
-- ============================================
create table queue_entries (
  profile_id uuid primary key references profiles(id) on delete cascade,
  queue_type text not null check (queue_type in ('matchmaking', 'downtime', 'dating')),
  joined_at  timestamptz default now()
);

create index queue_entries_type_idx on queue_entries (queue_type, joined_at);

-- ============================================
-- CONNECTIONS (request -> accept)
-- ============================================
create table connections (
  id           bigint generated always as identity primary key,
  user_a       uuid references profiles(id) on delete cascade,
  user_b       uuid references profiles(id) on delete cascade,
  status       text not null default 'pending'
                 check (status in ('pending', 'accepted')),
  initiated_by uuid references profiles(id) not null,
  created_at   timestamptz default now(),
  responded_at timestamptz,
  constraint connection_pair_unique unique (user_a, user_b),
  constraint user_a_lt_user_b check (user_a < user_b),
  constraint initiator_is_participant
    check (initiated_by = user_a or initiated_by = user_b)
);

create index connections_user_a_idx on connections (user_a);
create index connections_user_b_idx on connections (user_b);
create index connections_status_idx on connections (status);

-- ============================================
-- CONVERSATIONS & MESSAGES
-- ============================================
create table conversations (
  id         bigint generated always as identity primary key,
  user_a     uuid references profiles(id) on delete cascade,
  user_b     uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  constraint conversation_pair_unique unique (user_a, user_b),
  constraint conversation_a_lt_b check (user_a < user_b)
);

create table messages (
  id              bigint generated always as identity primary key,
  conversation_id bigint references conversations(id) on delete cascade,
  sender_id       uuid references profiles(id) on delete cascade,
  body            text not null,
  read_at         timestamptz,
  created_at      timestamptz default now()
);

create index messages_conversation_idx on messages (conversation_id, created_at desc);

-- ============================================
-- BLOCKS
-- ============================================
create table blocks (
  blocker_id uuid references profiles(id) on delete cascade,
  blocked_id uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (blocker_id, blocked_id)
);

-- ============================================
-- INTERACTION OUTCOMES (feeds collaborative filter)
-- ============================================
create table interaction_outcomes (
  id             bigint generated always as identity primary key,
  user_a         uuid references profiles(id) on delete cascade,
  user_b         uuid references profiles(id) on delete cascade,
  context        text not null check (context in ('queue_match', 'event_match', 'date')),
  met            boolean,
  rating         int check (rating between 1 and 5),
  became_friends boolean default false,
  became_dating  boolean default false,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  constraint interaction_pair_context_unique unique (user_a, user_b, context),
  constraint interaction_user_a_lt_b check (user_a < user_b)
);

create index interaction_user_a_idx on interaction_outcomes (user_a);
create index interaction_user_b_idx on interaction_outcomes (user_b);

-- ============================================
-- DATING MATCHES
-- ============================================
create table dating_matches (
  id           bigint generated always as identity primary key,
  user_a       uuid references profiles(id) on delete cascade,
  user_b       uuid references profiles(id) on delete cascade,
  status       text not null default 'pending'
                 check (status in ('pending', 'matched', 'ended')),
  initiated_by uuid references profiles(id) not null,
  created_at   timestamptz default now(),
  responded_at timestamptz,
  ended_at     timestamptz,
  constraint dating_pair_unique unique (user_a, user_b),
  constraint dating_a_lt_b check (user_a < user_b)
);

create index dating_user_a_idx on dating_matches (user_a);
create index dating_user_b_idx on dating_matches (user_b);
create index dating_status_idx on dating_matches (status);