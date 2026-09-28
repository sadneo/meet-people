-- ============================================
-- EXTENSIONS
-- ============================================
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ============================================
-- PROFILES
-- ============================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text not null,
  bio text,
  birthdate date,
  gender text,
  location_city text,
  location_country text,
  latitude double precision,
  longitude double precision,
  avatar_url text,
  is_verified boolean default false,
  is_active boolean default true,
  last_seen_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index profiles_location_idx on profiles (latitude, longitude);
create index profiles_username_idx on profiles (username);

-- ============================================
-- INTERESTS
-- ============================================
create table interests (
  id bigint generated always as identity primary key,
  name text unique not null,
  category text
);

create table profile_interests (
  profile_id uuid references profiles(id) on delete cascade,
  interest_id bigint references interests(id) on delete cascade,
  primary key (profile_id, interest_id)
);

-- ============================================
-- PHOTOS
-- ============================================
create table profile_photos (
  id bigint generated always as identity primary key,
  profile_id uuid references profiles(id) on delete cascade,
  url text not null,
  position int default 0,
  created_at timestamptz default now()
);

-- ============================================
-- MEETUPS
-- ============================================
create table meetups (
  id bigint generated always as identity primary key,
  host_id uuid references profiles(id) on delete cascade,
  title text not null,
  description text,
  category text,
  location_name text,
  latitude double precision,
  longitude double precision,
  starts_at timestamptz not null,
  ends_at timestamptz,
  max_attendees int,
  is_public boolean default true,
  created_at timestamptz default now()
);

create index meetups_starts_at_idx on meetups (starts_at);
create index meetups_location_idx on meetups (latitude, longitude);

create table meetup_attendees (
  meetup_id bigint references meetups(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  status text default 'going' check (status in ('going', 'maybe', 'declined')),
  joined_at timestamptz default now(),
  primary key (meetup_id, profile_id)
);

-- ============================================
-- CONNECTIONS (request -> accept flow)
-- ============================================
create table connections (
  id bigint generated always as identity primary key,
  user_a uuid references profiles(id) on delete cascade,
  user_b uuid references profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted')),
  initiated_by uuid references profiles(id) not null,
  created_at timestamptz default now(),
  responded_at timestamptz,
  constraint connection_pair_unique unique (user_a, user_b),
  constraint user_a_lt_user_b check (user_a < user_b),
  constraint initiator_is_participant
    check (initiated_by = user_a or initiated_by = user_b)
);

create index connections_user_a_idx on connections (user_a);
create index connections_user_b_idx on connections (user_b);
create index connections_status_idx on connections (status);
create index connections_initiated_by_idx on connections (initiated_by);

-- ============================================
-- CONVERSATIONS & MESSAGES
-- ============================================
create table conversations (
  id bigint generated always as identity primary key,
  user_a uuid references profiles(id) on delete cascade,
  user_b uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  constraint conversation_pair_unique unique (user_a, user_b),
  constraint conversation_a_lt_b check (user_a < user_b)
);

create table messages (
  id bigint generated always as identity primary key,
  conversation_id bigint references conversations(id) on delete cascade,
  sender_id uuid references profiles(id) on delete cascade,
  body text not null,
  read_at timestamptz,
  created_at timestamptz default now()
);

create index messages_conversation_idx on messages (conversation_id, created_at desc);

-- ============================================
-- BLOCKS & REPORTS
-- ============================================
create table blocks (
  blocker_id uuid references profiles(id) on delete cascade,
  blocked_id uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (blocker_id, blocked_id)
);

create table reports (
  id bigint generated always as identity primary key,
  reporter_id uuid references profiles(id) on delete cascade,
  reported_id uuid references profiles(id) on delete cascade,
  reason text not null,
  details text,
  status text default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz default now()
);