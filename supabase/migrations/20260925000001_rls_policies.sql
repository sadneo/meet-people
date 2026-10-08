-- ============================================
-- ENABLE RLS
-- ============================================
alter table profiles             enable row level security;
alter table user_interests       enable row level security;
alter table availability         enable row level security;
alter table meetups              enable row level security;
alter table meetup_attendees     enable row level security;
alter table event_interest       enable row level security;
alter table queue_entries        enable row level security;
alter table connections          enable row level security;
alter table conversations        enable row level security;
alter table messages             enable row level security;
alter table blocks               enable row level security;
alter table interaction_outcomes enable row level security;
alter table dating_matches       enable row level security;

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
-- USER INTERESTS
-- ============================================
create policy "User interests are publicly readable" on user_interests
  for select using (true);
create policy "Users insert own interests" on user_interests
  for insert with check (profile_id = auth.uid());
create policy "Users update own interests" on user_interests
  for update using (profile_id = auth.uid());
create policy "Users delete own interests" on user_interests
  for delete using (profile_id = auth.uid());

-- ============================================
-- AVAILABILITY
-- ============================================
create policy "Availability is publicly readable" on availability
  for select using (true);
create policy "Users manage own availability" on availability
  for insert with check (profile_id = auth.uid());
create policy "Users update own availability" on availability
  for update using (profile_id = auth.uid());
create policy "Users delete own availability" on availability
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

create policy "Attendees viewable" on meetup_attendees
  for select using (true);
create policy "Users RSVP as themselves" on meetup_attendees
  for insert with check (profile_id = auth.uid());
create policy "Users update own RSVP" on meetup_attendees
  for update using (profile_id = auth.uid());
create policy "Users delete own RSVP" on meetup_attendees
  for delete using (profile_id = auth.uid());

-- ============================================
-- EVENT INTEREST
-- ============================================
create policy "Event interest is publicly readable" on event_interest
  for select using (true);
create policy "Users express own interest" on event_interest
  for insert with check (profile_id = auth.uid());
create policy "Users remove own interest" on event_interest
  for delete using (profile_id = auth.uid());

-- ============================================
-- QUEUE ENTRIES
-- ============================================
create policy "Queue entries are publicly readable" on queue_entries
  for select using (true);
create policy "Users join queue as themselves" on queue_entries
  for insert with check (profile_id = auth.uid());
create policy "Users leave queue as themselves" on queue_entries
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
-- INTERACTION OUTCOMES
-- ============================================
create policy "Participants see own outcomes" on interaction_outcomes
  for select using (user_a = auth.uid() or user_b = auth.uid());
create policy "Participants insert outcomes" on interaction_outcomes
  for insert with check (user_a = auth.uid() or user_b = auth.uid());
create policy "Participants update outcomes" on interaction_outcomes
  for update using (user_a = auth.uid() or user_b = auth.uid());

-- ============================================
-- DATING MATCHES
-- ============================================
create policy "Participants see dating matches" on dating_matches
  for select using (user_a = auth.uid() or user_b = auth.uid());
create policy "Users create their own dating requests" on dating_matches
  for insert with check (
    initiated_by = auth.uid()
    and (user_a = auth.uid() or user_b = auth.uid())
    and status = 'pending'
  );
create policy "Recipient accepts dating request" on dating_matches
  for update using (
    status = 'pending'
    and (user_a = auth.uid() or user_b = auth.uid())
    and initiated_by <> auth.uid()
  )
  with check (status = 'matched');
create policy "Participants end dating match" on dating_matches
  for update using (
    status = 'matched'
    and (user_a = auth.uid() or user_b = auth.uid())
  )
  with check (status = 'ended');