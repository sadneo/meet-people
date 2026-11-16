-- Ephemeral typing notifications share the existing private owner channels.
-- Only the server derives the sender and recipients; drafts never leave the client.
begin;
create function public.messaging_typing(conversation_in uuid, group_in boolean, typing_in boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := safety_private.actor(); snapshot jsonb; members jsonb; recipient uuid;
begin
  if conversation_in is null or group_in is null or typing_in is null then
    raise exception 'Invalid typing status' using errcode = '22023';
  end if;
  if group_in then
    -- Reuse the group's current adult-account and active-membership checks.
    snapshot := public.get_active_friends_group(conversation_in);
    members := snapshot->'members';
  else
    -- Covers native UUID conversations and legacy UUID aliases, including blocks,
    -- inactive/departed members and revoked connections through the current API.
    snapshot := public.social_history(conversation_in, null, null);
    if not coalesce((snapshot->>'canSend')::boolean, false) then
      raise exception 'Conversation unavailable' using errcode = '42501';
    end if;
    members := snapshot->'participants';
  end if;
  for recipient in select (member->>'id')::uuid from jsonb_array_elements(members) member loop
    if recipient <> actor and public.safety_pair_allowed(actor, recipient) then
      perform realtime.send(jsonb_build_object('conversationId', conversation_in,
        'userId', actor, 'isGroup', group_in, 'typing', typing_in),
        'typing', 'messaging:' || recipient::text, true);
    end if;
  end loop;
  return '{"ok":true}'::jsonb;
end $$;
revoke all on function public.messaging_typing(uuid,boolean,boolean) from public, anon, authenticated;
grant execute on function public.messaging_typing(uuid,boolean,boolean) to authenticated;
commit;
