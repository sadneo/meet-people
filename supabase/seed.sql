-- ============================================
-- AUTH USERS (password: "password123")
-- ============================================
insert into auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'alice@example.com',
   crypt('password123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'bob@example.com',
   crypt('password123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'carol@example.com',
   crypt('password123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'dave@example.com',
   crypt('password123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'erin@example.com',
   crypt('password123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('66666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'frank@example.com',
   crypt('password123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('77777777-7777-7777-7777-777777777777', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'grace@example.com',
   crypt('password123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('88888888-8888-8888-8888-888888888888', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'hank@example.com',
   crypt('password123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('99999999-9999-9999-9999-999999999999', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'iris@example.com',
   crypt('password123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'jack@example.com',
   crypt('password123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'kim@example.com',
   crypt('password123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'liam@example.com',
   crypt('password123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}');

-- ============================================
-- PROFILES
-- ============================================
insert into profiles (id, username, display_name, bio, birthdate,
                      location_city, latitude, longitude, last_seen_at)
values
  ('11111111-1111-1111-1111-111111111111', 'alice', 'Alice Chen',
   'Coffee enthusiast, weekend hiker, and amateur photographer.',
   '1994-03-12', 'San Francisco', 37.7749, -122.4194, now() - interval '2 hours'),
  ('22222222-2222-2222-2222-222222222222', 'bob', 'Bob Martinez',
   'Software engineer. I run, I cook, I read sci-fi.',
   '1990-07-21', 'San Francisco', 37.7749, -122.4194, now() - interval '1 day'),
  ('33333333-3333-3333-3333-333333333333', 'carol', 'Carol Nguyen',
   'Designer. Jazz records. Vintage bikes.',
   '1996-11-02', 'Oakland', 37.8044, -122.2712, now() - interval '4 hours'),
  ('44444444-4444-4444-4444-444444444444', 'dave', 'Dave Okafor',
   'Basketball, tacos, and terrible puns.',
   '1988-01-30', 'Berkeley', 37.8715, -122.2730, now() - interval '5 days'),
  ('55555555-5555-5555-5555-555555555555', 'erin', 'Erin Walsh',
   'Yoga teacher, plant mom, dog person.',
   '1992-05-17', 'San Francisco', 37.7749, -122.4194, now() - interval '30 minutes'),
  ('66666666-6666-6666-6666-666666666666', 'frank', 'Frank Lee',
   'Photographer. Hiker. Always up for coffee.',
   '1993-09-14', 'San Francisco', 37.7749, -122.4194, now() - interval '1 day'),
  ('77777777-7777-7777-7777-777777777777', 'grace', 'Grace Park',
   'Yoga every morning. Plant-based cooking.',
   '1995-02-08', 'San Francisco', 37.7749, -122.4194, now() - interval '3 hours'),
  ('88888888-8888-8888-8888-888888888888', 'hank', 'Hank Rivera',
   'Cyclist, jazz lover, weekend designer.',
   '1991-06-25', 'Oakland', 37.8044, -122.2712, now() - interval '2 days'),
  ('99999999-9999-9999-9999-999999999999', 'iris', 'Iris Tanaka',
   'Sci-fi reader. Runner. Coffee snob.',
   '1997-12-03', 'Berkeley', 37.8715, -122.2730, now() - interval '12 hours'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'jack', 'Jack Murphy',
   'Basketball on weekends. Tacos always.',
   '1989-04-19', 'San Francisco', 37.7749, -122.4194, now() - interval '5 days'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'kim', 'Kim Alvarez',
   'Designer and jazz collector. Bike commuter.',
   '1994-08-11', 'Oakland', 37.8044, -122.2712, now() - interval '1 hour'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'liam', 'Liam Chen',
   'Hiking, photography, sci-fi. New to SF.',
   '1992-10-22', 'San Francisco', 37.7749, -122.4194, now() - interval '30 minutes');

-- ============================================
-- USER INTERESTS (free text; embeddings via trigger)
-- ============================================
insert into user_interests (profile_id, text) values
  ('11111111-1111-1111-1111-111111111111', 'coffee'),
  ('11111111-1111-1111-1111-111111111111', 'weekend hiking'),
  ('11111111-1111-1111-1111-111111111111', 'amateur photography'),
  ('22222222-2222-2222-2222-222222222222', 'running'),
  ('22222222-2222-2222-2222-222222222222', 'cooking'),
  ('22222222-2222-2222-2222-222222222222', 'science fiction novels'),
  ('33333333-3333-3333-3333-333333333333', 'graphic design'),
  ('33333333-3333-3333-3333-333333333333', 'vinyl jazz records'),
  ('33333333-3333-3333-3333-333333333333', 'vintage bicycles'),
  ('44444444-4444-4444-4444-444444444444', 'basketball'),
  ('44444444-4444-4444-4444-444444444444', 'tacos'),
  ('55555555-5555-5555-5555-555555555555', 'yoga'),
  ('55555555-5555-5555-5555-555555555555', 'houseplants'),
  ('55555555-5555-5555-5555-555555555555', 'dogs'),
  ('66666666-6666-6666-6666-666666666666', 'film photography'),
  ('66666666-6666-6666-6666-666666666666', 'trail hiking'),
  ('66666666-6666-6666-6666-666666666666', 'espresso'),
  ('77777777-7777-7777-7777-777777777777', 'morning yoga'),
  ('77777777-7777-7777-7777-777777777777', 'plant-based cooking'),
  ('88888888-8888-8888-8888-888888888888', 'road cycling'),
  ('88888888-8888-8888-8888-888888888888', 'jazz music'),
  ('88888888-8888-8888-8888-888888888888', 'graphic design'),
  ('99999999-9999-9999-9999-999999999999', 'science fiction'),
  ('99999999-9999-9999-9999-999999999999', 'running'),
  ('99999999-9999-9999-9999-999999999999', 'coffee'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'basketball'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cooking'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'graphic design'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'jazz'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bike commuting'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'hiking'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'photography'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'science fiction');

-- ============================================
-- AVAILABILITY
-- ============================================
insert into availability (profile_id, dow, start_time, end_time) values
  ('11111111-1111-1111-1111-111111111111', 1, '18:00', '21:00'),
  ('11111111-1111-1111-1111-111111111111', 3, '18:00', '21:00'),
  ('11111111-1111-1111-1111-111111111111', 6, '09:00', '15:00'),
  ('66666666-6666-6666-6666-666666666666', 1, '18:00', '21:00'),
  ('66666666-6666-6666-6666-666666666666', 3, '18:00', '21:00'),
  ('66666666-6666-6666-6666-666666666666', 6, '10:00', '14:00'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 6, '09:00', '12:00'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 0, '10:00', '14:00'),
  ('99999999-9999-9999-9999-999999999999', 2, '18:00', '20:00'),
  ('99999999-9999-9999-9999-999999999999', 4, '18:00', '20:00'),
  ('55555555-5555-5555-5555-555555555555', 1, '07:00', '10:00'),
  ('55555555-5555-5555-5555-555555555555', 3, '07:00', '10:00'),
  ('77777777-7777-7777-7777-777777777777', 2, '18:00', '21:00'),
  ('77777777-7777-7777-7777-777777777777', 4, '18:00', '21:00'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 2, '18:00', '21:00'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 4, '18:00', '21:00');

-- ============================================
-- MEETUPS
-- ============================================
insert into meetups (host_id, title, description, category,
                     location_name, latitude, longitude,
                     starts_at, ends_at, max_attendees, is_public)
values
  ('11111111-1111-1111-1111-111111111111',
   'Saturday morning hike at Twin Peaks',
   'Easy 5k loop, coffee after. All welcome.',
   'outdoors', 'Twin Peaks, San Francisco', 37.7544, -122.4477,
   now() + interval '3 days', now() + interval '3 days 3 hours',
   10, true),
  ('66666666-6666-6666-6666-666666666666',
   'Golden hour photo walk',
   'Bring any camera. Meet at the Ferry Building, walk the waterfront.',
   'creative', 'Ferry Building, San Francisco', 37.7955, -122.3937,
   now() + interval '5 days', now() + interval '5 days 2 hours',
   8, true),
  ('33333333-3333-3333-3333-333333333333',
   'Coffee crawl: Mission district',
   'Three cafes, three single origins. Casual.',
   'food', 'Mission District, San Francisco', 37.7599, -122.4148,
   now() + interval '4 days', now() + interval '4 days 2 hours',
   6, true),
  ('88888888-8888-8888-8888-888888888888',
   'Sunday jazz at the park',
   'Bring a blanket. Live quartet starting at 2pm.',
   'music', 'Lake Merritt, Oakland', 37.8105, -122.2620,
   now() + interval '6 days', now() + interval '6 days 3 hours',
   20, true);

insert into meetup_attendees (meetup_id, profile_id, status)
select m.id, p.id, 'going'
from meetups m, profiles p
where m.title like 'Saturday morning hike%'
  and p.username in ('bob', 'carol', 'frank');

-- ============================================
-- EVENT INTEREST
-- ============================================
insert into event_interest (meetup_id, profile_id, note)
select m.id, p.id, 'Looking for a hiking buddy'
from meetups m, profiles p
where m.title like 'Saturday morning hike%'
  and p.username in ('frank', 'liam');

insert into event_interest (meetup_id, profile_id, note)
select m.id, p.id, 'Bringing my Fujifilm'
from meetups m, profiles p
where m.title like 'Golden hour photo walk%'
  and p.username in ('alice', 'liam');

-- ============================================
-- ACCEPTED CONNECTIONS
-- ============================================
insert into connections (user_a, user_b, status, initiated_by, responded_at) values
  ('11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222',
   'accepted',
   '11111111-1111-1111-1111-111111111111', now()),
  ('33333333-3333-3333-3333-333333333333',
   '88888888-8888-8888-8888-888888888888',
   'accepted',
   '33333333-3333-3333-3333-333333333333', now()),
  ('33333333-3333-3333-3333-333333333333',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'accepted',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', now()),
  ('66666666-6666-6666-6666-666666666666',
   'cccccccc-cccc-cccc-cccc-cccccccccccc',
   'accepted',
   '66666666-6666-6666-6666-666666666666', now());

-- ============================================
-- PENDING REQUEST
-- ============================================
insert into connections (user_a, user_b, status, initiated_by)
values (
  '11111111-1111-1111-1111-111111111111',
  '55555555-5555-5555-5555-555555555555',
  'pending',
  '55555555-5555-5555-5555-555555555555'
);

-- ============================================
-- MESSAGES
-- ============================================
insert into messages (conversation_id, sender_id, body)
select c.id, '11111111-1111-1111-1111-111111111111', 'Hey! Nice to connect. Coffee this week?'
from conversations c
where c.user_a = '11111111-1111-1111-1111-111111111111'
  and c.user_b = '22222222-2222-2222-2222-222222222222';

insert into messages (conversation_id, sender_id, body)
select c.id, '22222222-2222-2222-2222-222222222222', 'Yes! Thursday at the usual spot?'
from conversations c
where c.user_a = '11111111-1111-1111-1111-111111111111'
  and c.user_b = '22222222-2222-2222-2222-222222222222';

-- ============================================
-- PAST INTERACTIONS
-- NOTE: user_a must be lexicographically < user_b.
-- ============================================
insert into interaction_outcomes
  (user_a, user_b, context, met, rating, became_friends)
values
  -- Frank + Liam: great match (gives Frank reliability = 1.0)
  ('66666666-6666-6666-6666-666666666666',
   'cccccccc-cccc-cccc-cccc-cccccccccccc',
   'queue_match', true, 5, true),
  -- Bob + Liam: great match
  ('22222222-2222-2222-2222-222222222222',
   'cccccccc-cccc-cccc-cccc-cccccccccccc',
   'queue_match', true, 5, true),
  -- Carol + Iris: okay match
  ('33333333-3333-3333-3333-333333333333',
   '99999999-9999-9999-9999-999999999999',
   'queue_match', true, 3, false),
  -- Dave + Jack: bad match
  ('44444444-4444-4444-4444-444444444444',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'queue_match', false, 1, false);

-- ============================================
-- QUEUE ENTRIES
-- ============================================
insert into queue_entries (profile_id, queue_type) values
  ('66666666-6666-6666-6666-666666666666', 'matchmaking'),
  ('99999999-9999-9999-9999-999999999999', 'matchmaking'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'matchmaking'),
  ('77777777-7777-7777-7777-777777777777', 'dating'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'dating')
on conflict (profile_id) do update set queue_type = excluded.queue_type;