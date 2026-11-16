begin;
-- Notification fixtures are privileged inserts, not API admission tests.
-- Restore these guards with the surrounding transaction rollback.
alter table public.conversations disable trigger safety_conversations_guard;
alter table public.messages disable trigger safety_messages_guard;
insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'realtime-a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'realtime-b@example.test');
insert into public.profiles(id, username, display_name) values
  ('11111111-1111-1111-1111-111111111111', 'realtime-a', 'Realtime A'),
  ('22222222-2222-2222-2222-222222222222', 'realtime-b', 'Realtime B');
delete from realtime.messages;
do $$
declare chat bigint; position bigint;
begin
  insert into public.conversations(user_a, user_b) values
    ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222') returning id into chat;
  insert into public.messages(conversation_id, sender_id, body) values
    (chat, '11111111-1111-1111-1111-111111111111', 'Legacy realtime') returning id into position;
  assert (select count(*) = 2 from realtime.messages), 'Legacy message notifications missing';
  assert not exists(select 1 from realtime.messages where payload - 'id' <> '{}'::jsonb or not private), 'Legacy notification leaked data';
  delete from realtime.messages;
  insert into social_private.read_states(conversation_id, actor_id, seq) values
    (chat, '22222222-2222-2222-2222-222222222222', position);
  assert (select count(*) = 2 from realtime.messages), 'Legacy read notifications missing';
  update social_private.read_states set seq = position where conversation_id = chat;
  assert (select count(*) = 2 from realtime.messages), 'Legacy read no-op created a loop';
end $$;
rollback;
