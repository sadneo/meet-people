-- ============================================
-- TEST AUTH USERS
-- Password for all: "password123"
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
insert into profiles (id, username, display_name, bio, birthdate, gender,
                      location_city, location_country, latitude, longitude, last_seen_at)
values
  ('11111111-1111-1111-1111-111111111111', 'alice', 'Alice Chen',
   'Coffee enthusiast, weekend hiker, and amateur photographer.',
   '1994-03-12', 'female', 'San Francisco', 'USA', 37.7749, -122.4194, now() - interval '2 hours'),
  ('22222222-2222-2222-2222-222222222222', 'bob', 'Bob Martinez',
   'Software engineer. I run, I cook, I read sci-fi.',
   '1990-07-21', 'male', 'San Francisco', 'USA', 37.7749, -122.4194, now() - interval '1 day'),
  ('33333333-3333-3333-3333-333333333333', 'carol', 'Carol Nguyen',
   'Designer. Jazz records. Vintage bikes.',
   '1996-11-02', 'female', 'Oakland', 'USA', 37.8044, -122.2712, now() - interval '4 hours'),
  ('44444444-4444-4444-4444-444444444444', 'dave', 'Dave Okafor',
   'Basketball, tacos, and terrible puns.',
   '1988-01-30', 'male', 'Berkeley', 'USA', 37.8715, -122.2730, now() - interval '5 days'),
  ('55555555-5555-5555-5555-555555555555', 'erin', 'Erin Walsh',
   'Yoga teacher, plant mom, dog person.',
   '1992-05-17', 'female', 'San Francisco', 'USA', 37.7749, -122.4194, now() - interval '30 minutes'),
  ('66666666-6666-6666-6666-666666666666', 'frank', 'Frank Lee',
   'Photographer. Hiker. Always up for coffee.',
   '1993-09-14', 'male', 'San Francisco', 'USA', 37.7749, -122.4194, now() - interval '1 day'),
  ('77777777-7777-7777-7777-777777777777', 'grace', 'Grace Park',
   'Yoga every morning. Plant-based cooking.',
   '1995-02-08', 'female', 'San Francisco', 'USA', 37.7749, -122.4194, now() - interval '3 hours'),
  ('88888888-8888-8888-8888-888888888888', 'hank', 'Hank Rivera',
   'Cyclist, jazz lover, weekend designer.',
   '1991-06-25', 'male', 'Oakland', 'USA', 37.8044, -122.2712, now() - interval '2 days'),
  ('99999999-9999-9999-9999-999999999999', 'iris', 'Iris Tanaka',
   'Sci-fi reader. Runner. Coffee snob.',
   '1997-12-03', 'female', 'Berkeley', 'USA', 37.8715, -122.2730, now() - interval '12 hours'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'jack', 'Jack Murphy',
   'Basketball on weekends. Tacos always.',
   '1989-04-19', 'male', 'San Francisco', 'USA', 37.7749, -122.4194, now() - interval '5 days'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'kim', 'Kim Alvarez',
   'Designer and jazz collector. Bike commuter.',
   '1994-08-11', 'female', 'Oakland', 'USA', 37.8044, -122.2712, now() - interval '1 hour'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'liam', 'Liam Chen',
   'Hiking, photography, sci-fi. New to SF.',
   '1992-10-22', 'male', 'San Francisco', 'USA', 37.7749, -122.4194, now() - interval '30 minutes');

-- ============================================
-- INTERESTS
-- ============================================
insert into interests (name, category) values
  ('hiking', 'outdoors'),
  ('coffee', 'food'),
  ('photography', 'creative'),
  ('running', 'sports'),
  ('cooking', 'food'),
  ('sci-fi', 'books'),
  ('design', 'creative'),
  ('jazz', 'music'),
  ('cycling', 'sports'),
  ('basketball', 'sports'),
  ('yoga', 'wellness'),
  ('plants', 'home'),
  ('dogs', 'pets');

insert into profile_interests (profile_id, interest_id)
select p.id, i.id from profiles p, interests i
where (p.username = 'alice' and i.name in ('coffee', 'hiking', 'photography'))
   or (p.username = 'bob'   and i.name in ('running', 'cooking', 'sci-fi'))
   or (p.username = 'carol' and i.name in ('design', 'jazz', 'cycling'))
   or (p.username = 'dave'  and i.name in ('basketball', 'cooking'))
   or (p.username = 'erin'  and i.name in ('yoga', 'plants', 'dogs'))
   or (p.username = 'frank' and i.name in ('photography', 'hiking', 'coffee'))
   or (p.username = 'grace' and i.name in ('yoga', 'cooking', 'plants'))
   or (p.username = 'hank'  and i.name in ('cycling', 'jazz', 'design'))
   or (p.username = 'iris'  and i.name in ('sci-fi', 'running', 'coffee'))
   or (p.username = 'jack'  and i.name in ('basketball', 'cooking'))
   or (p.username = 'kim'   and i.name in ('design', 'jazz', 'cycling'))
   or (p.username = 'liam'  and i.name in ('hiking', 'photography', 'sci-fi'));

-- ============================================
-- MEETUP + RSVPs
-- ============================================
insert into meetups (host_id, title, description, category,
                     location_name, latitude, longitude,
                     starts_at, ends_at, max_attendees, is_public)
values (
  '11111111-1111-1111-1111-111111111111',
  'Saturday morning hike at Twin Peaks',
  'Easy 5k loop, coffee after. All welcome.',
  'outdoors',
  'Twin Peaks, San Francisco',
  37.7544, -122.4477,
  now() + interval '3 days',
  now() + interval '3 days 3 hours',
  10, true
);

insert into meetup_attendees (meetup_id, profile_id, status)
select m.id, p.id, 'going'
from meetups m, profiles p
where m.title like 'Saturday morning hike%'
  and p.username in ('bob', 'carol', 'frank');

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
-- A PENDING REQUEST (Erin -> Alice)
-- ============================================
insert into connections (user_a, user_b, status, initiated_by)
values (
  '11111111-1111-1111-1111-111111111111',
  '55555555-5555-5555-5555-555555555555',
  'pending',
  '55555555-5555-5555-5555-555555555555'
);

-- ============================================
-- CONVERSATIONS + MESSAGES
-- ============================================
insert into conversations (user_a, user_b) values
  ('11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222'),
  ('66666666-6666-6666-6666-666666666666',
   'cccccccc-cccc-cccc-cccc-cccccccccccc');

insert into messages (conversation_id, sender_id, body)
select c.id, '11111111-1111-1111-1111-111111111111', 'Hey! Nice to connect. Coffee this week?'
from conversations c
where c.user_a = '11111111-1111-1111-1111-111111111111';

insert into messages (conversation_id, sender_id, body)
select c.id, '22222222-2222-2222-2222-222222222222', 'Yes! Thursday at the usual spot?'
from conversations c
where c.user_a = '11111111-1111-1111-1111-111111111111';