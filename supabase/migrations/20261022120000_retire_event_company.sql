-- Event company is retired: the event group queue replaced it and no screen uses it.
-- Its tables stay for messaging history (event_group chats and the event_profiles
-- display-name fallback), but nothing can write to them any more.
drop function public.event_company_action(uuid, uuid, text, text);
drop function public.event_company_snapshot(uuid, uuid);
drop function public.event_interest_counts(uuid[]);
