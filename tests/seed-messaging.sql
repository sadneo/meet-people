-- Run after migrations + supabase/seed.sql in a disposable local database.
begin;
do $$
declare conversation uuid;
begin
  select id into strict conversation from public.conversations
    where source_key = 'direct:11111111-1111-1111-1111-111111111111:22222222-2222-2222-2222-222222222222';
  assert (select last_seq = 2 from public.conversations where id = conversation), 'Seed conversation sequence is wrong';
  assert (select count(*) = 2 from public.messages where conversation_id = conversation), 'Seed messages missing';
  assert (select array_agg(seq order by seq) = array[1,2]::bigint[] from public.messages where conversation_id = conversation), 'Seed message order is wrong';
  assert (select count(*) = 2 from public.conversation_participants where conversation_id = conversation and left_at is null), 'Seed participants missing';
  perform public.messaging_send('11111111-1111-1111-1111-111111111111', conversation,
    'Hey! Nice to connect. Coffee this week?', 'd0000000-0000-4000-8000-000000000001');
  assert (select last_seq = 2 from public.conversations where id = conversation), 'Retry duplicated a seed message';
end $$;
rollback;
