-- ============================================
-- INBOX
-- ============================================
create or replace function get_my_conversations()
returns table (
  conversation_id bigint,
  other_user_id   uuid,
  username        text,
  display_name    text,
  avatar_url      text,
  last_message    text,
  last_message_at timestamptz,
  unread_count    int
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
    (select m.body from messages m
      where m.conversation_id = c.id
      order by m.created_at desc limit 1),
    (select m.created_at from messages m
      where m.conversation_id = c.id
      order by m.created_at desc limit 1),
    (select count(*)::int from messages m
      where m.conversation_id = c.id
        and m.sender_id <> auth.uid()
        and m.read_at is null)
  from conversations c
  join profiles p
    on p.id = case when c.user_a = auth.uid() then c.user_b else c.user_a end
  where c.user_a = auth.uid() or c.user_b = auth.uid()
  order by
    (select m.created_at from messages m
      where m.conversation_id = c.id
      order by m.created_at desc limit 1) desc nulls last;
$$;

grant execute on function get_my_conversations() to authenticated;

create or replace function mark_conversation_read(conv_id bigint)
returns int
language plpgsql
security definer
as $$
declare
  updated int;
begin
  update messages
  set read_at = now()
  where conversation_id = conv_id
    and sender_id <> auth.uid()
    and read_at is null;
  get diagnostics updated = row_count;
  return updated;
end;
$$;

grant execute on function mark_conversation_read(bigint) to authenticated;

create or replace function get_unread_count()
returns int
language sql
stable
security definer
as $$
  select count(*)::int
  from messages m
  join conversations c on c.id = m.conversation_id
  where (c.user_a = auth.uid() or c.user_b = auth.uid())
    and m.sender_id <> auth.uid()
    and m.read_at is null;
$$;

grant execute on function get_unread_count() to authenticated;