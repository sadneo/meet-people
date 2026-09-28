-- ============================================
-- ENABLE RLS
-- ============================================
alter table profiles enable row level security;
alter table interests enable row level security;
alter table profile_interests enable row level security;
alter table profile_photos enable row level security;
alter table meetups enable row level security;
alter table meetup_attendees enable row level security;
alter table connections enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table blocks enable row level security;
alter table reports enable row level security;

-- ============================================
-- PROFILES
-- ============================================
create policy "Profiles are publicly readable" on profiles
  for select using (is_active = true);
create policy "Users insert own profile" on profiles
  for insert with check (auth.uid() = id);
create policy "Users update own profile" on profiles
  for update using (auth.uid() = id);

-- ============================================
-- INTERESTS
-- ============================================
create policy "Interests are publicly readable" on interests
  for select using (true);
create policy "Profile interests are publicly readable" on profile_interests
  for select using (true);
create policy "Users manage own interests" on profile_interests
  for insert with check (profile_id = auth.uid());
create policy "Users delete own interests" on profile_interests
  for delete using (profile_id = auth.uid());

-- ============================================
-- PHOTOS
-- ============================================
create policy "Photos are publicly readable" on profile_photos
  for select using (true);
create policy "Users manage own photos" on profile_photos
  for insert with check (profile_id = auth.uid());
create policy "Users update own photos" on profile_photos
  for update using (profile_id = auth.uid());
create policy "Users delete own photos" on profile_photos
  for delete using (profile_id = auth.uid());

-- ============================================
-- MEETUPS
-- ============================================
create policy "Public meetups are viewable" on meetups
  for select using (is_public = true or host_id = auth.uid());
create policy "Users create own meetups" on meetups
  for insert with check (host_id = auth.uid());
create policy "Hosts update own meetups" on meetups
  for update using (host_id = auth.uid());
create policy "Hosts delete own meetups" on meetups
  for delete using (host_id = auth.uid());

-- ============================================
-- MEETUP ATTENDEES
-- ============================================
create policy "Attendees viewable" on meetup_attendees
  for select using (true);
create policy "Users RSVP as themselves" on meetup_attendees
  for insert with check (profile_id = auth.uid());
create policy "Users update own RSVP" on meetup_attendees
  for update using (profile_id = auth.uid());
create policy "Users delete own RSVP" on meetup_attendees
  for delete using (profile_id = auth.uid());

-- ============================================
-- CONNECTIONS
-- ============================================
create policy "Participants see own connections" on connections
  for select using (user_a = auth.uid() or user_b = auth.uid());

create policy "Users create their own requests" on connections
  for insert with check (
    initiated_by = auth.uid()
    and (user_a = auth.uid() or user_b = auth.uid())
    and status = 'pending'
  );

create policy "Recipient accepts pending request" on connections
  for update using (
    status = 'pending'
    and (user_a = auth.uid() or user_b = auth.uid())
    and initiated_by <> auth.uid()
  )
  with check (status = 'accepted');

create policy "Participants delete own connections" on connections
  for delete using (user_a = auth.uid() or user_b = auth.uid());

-- ============================================
-- CONVERSATIONS
-- ============================================
create policy "Participants see own conversations" on conversations
  for select using (user_a = auth.uid() or user_b = auth.uid());

-- ============================================
-- MESSAGES
-- ============================================
create policy "Participants read messages" on messages
  for select using (
    exists (
      select 1 from conversations c
      where c.id = messages.conversation_id
        and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

create policy "Participants send messages" on messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from conversations c
      where c.id = messages.conversation_id
        and (c.user_a = auth.uid() or c.user_b = auth.uid())
        and exists (
          select 1 from connections
          where status = 'accepted'
            and user_a = c.user_a and user_b = c.user_b
        )
    )
  );

create policy "Recipients mark read" on messages
  for update using (
    exists (
      select 1 from conversations c
      where c.id = messages.conversation_id
        and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

-- ============================================
-- BLOCKS
-- ============================================
create policy "Users see own blocks" on blocks
  for select using (blocker_id = auth.uid());
create policy "Users create own blocks" on blocks
  for insert with check (blocker_id = auth.uid());
create policy "Users delete own blocks" on blocks
  for delete using (blocker_id = auth.uid());

-- ============================================
-- REPORTS
-- ============================================
create policy "Users see own reports" on reports
  for select using (reporter_id = auth.uid());
create policy "Users create reports" on reports
  for insert with check (reporter_id = auth.uid());