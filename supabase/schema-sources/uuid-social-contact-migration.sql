-- Actor-bound frontend RPCs for the installed native UUID messaging schema.
-- Existing service-only messaging functions retain membership, sequence, retry,
-- rate-limit and block filtering behavior. No conversations/messages are copied.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
do $$ begin
 if to_regprocedure('safety_private.lock_pair(uuid,uuid)') is null or to_regprocedure('public.messaging_list_conversations(uuid,integer)') is null
 or to_regprocedure('public.messaging_history(uuid,uuid,bigint,bigint)') is null
 or to_regprocedure('public.messaging_send(uuid,uuid,text,uuid)') is null
 or to_regprocedure('public.messaging_mark_read(uuid,uuid,bigint)') is null
 or to_regprocedure('public.messaging_activity(uuid)') is null
 or has_schema_privilege('anon','public','CREATE') or has_schema_privilege('authenticated','public','CREATE') then
 raise exception 'Native actor messaging prerequisites missing' using errcode='22023';end if;
 if exists(select 1 from public.messages where seq not between 1 and 9007199254740991)
 or exists(select 1 from public.conversation_participants where last_read_seq not between 0 and 9007199254740991) then
 raise exception 'Native message positions exceed frontend contract' using errcode='22023';end if;
end $$;
create schema social_private;
revoke all on schema social_private from public,anon,authenticated;
create table social_private.send_requests (
 actor_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,
 message_id uuid not null references public.messages(id) on delete cascade,
 primary key(actor_id,request_id)
);
alter table social_private.send_requests enable row level security;
revoke all on social_private.send_requests from public,anon,authenticated;
create function social_private.discoverable(person uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join public.account_settings a on a.user_id=p.id
 where p.id=person and p.is_active and public.detailed_settings_masters(a.settings)->>'discoverable'='true'
 and p.birthdate between date '0001-01-01' and date '9999-12-31'
 and p.birthdate<=(statement_timestamp() at time zone 'America/New_York')::date-interval '18 years'
 and char_length(p.username) between 1 and 80 and char_length(p.display_name) between 1 and 120
 and public.profile_language_key(p.username)<>'' and public.profile_language_key(p.display_name)<>''
 and coalesce(char_length(p.bio),0)<=1000 and char_length(p.location_city)<=120 and public.profile_language_key(p.location_city)<>''
 and (select count(*) from public.user_interests i where i.profile_id=p.id) between 3 and 30
 and not exists(select 1 from public.user_interests i where i.profile_id=p.id and (char_length(i.text)>120 or public.profile_language_key(i.text)=''))
 and (select count(*) from public.availability w where w.profile_id=p.id) between 1 and 56
 and not exists(select 1 from public.availability w where w.profile_id=p.id and (w.start_time::text !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9])$' or w.end_time::text !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]|24:00:00)$'))
 and not exists(select 1 from public.availability w join public.availability x on x.profile_id=w.profile_id and x.id>w.id where w.profile_id=p.id and w.dow=x.dow and w.start_time<x.end_time and x.start_time<w.end_time)
 and jsonb_typeof(a.preferences->'intents')='array' and jsonb_array_length(a.preferences->'intents') between 1 and 20
 and not exists(select 1 from jsonb_array_elements(a.preferences->'intents') item where jsonb_typeof(item)<>'string' or char_length(item #>> '{}')>120 or public.profile_language_key(item #>> '{}')='')
 and a.preferences->>'distance' in('Nearby','5 miles','10 miles') and a.preferences->>'group' in('One-on-one','Small groups','Either'));
$$;
-- Existing connections authorize history, not contact with an inactive profile.
create function social_private.contact_allowed(a uuid,b uuid) returns boolean language sql stable security definer set search_path='' as $$
 select safety_private.contact_allowed(a,b) and (select count(*)=2 from public.profiles p where p.id in(a,b) and p.is_active);
$$;
create function social_private.lock_pair(a uuid,b uuid) returns void language plpgsql volatile security definer set search_path='' as $$
begin
 -- Canonical profile saves lock the profile before replacing its child facts.
 -- SHARE also serializes non-key is_active edits; the base FK fence is KEY SHARE.
 perform 1 from public.profiles p where p.id in(a,b) order by p.id for share;
 perform safety_private.lock_pair(a,b);
end $$;
create function social_private.person(person uuid,viewer uuid,read_seq bigint default 0) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',person,'display_name',case when person=viewer or public.safety_pair_allowed(person,viewer) then coalesce(p.display_name,'Account '||person::text) else 'Account '||person::text end,
 'avatar_url',case when (person=viewer or public.safety_pair_allowed(person,viewer)) and p.avatar_url ~ '^https://' then p.avatar_url else null end,'last_read_seq',read_seq)
 from (values(person)) me(id) left join public.profiles p on p.id=me.id;
$$;

create function social_private.peer(conversation_in uuid,actor uuid) returns uuid language sql stable security definer set search_path='' as $$
 select other.user_id from public.conversations c
 join public.conversation_participants mine on mine.conversation_id=c.id and mine.user_id=actor and mine.left_at is null
 join public.conversation_participants other on other.conversation_id=c.id and other.user_id<>actor
 where c.id=conversation_in and c.kind='direct'
 and c.source_key='direct:'||least(actor,other.user_id)||':'||greatest(actor,other.user_id)
 limit 1;
$$;
create function social_private.participants(conversation_in uuid,actor uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(social_private.person(p.user_id,actor,case when p.user_id=actor or social_private.contact_allowed(actor,p.user_id) then p.last_read_seq else 0 end) order by p.joined_at,p.user_id),'[]')
 from public.conversation_participants p where p.conversation_id=conversation_in and p.left_at is null;
$$;
create function social_private.connection_state(actor uuid,target uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce((select jsonb_build_object('status',case when c.status='accepted' then 'connected' when c.initiated_by=actor then 'sent' else 'incoming' end,
 'conversationId',case when c.status='accepted' then chat.id else null end)
 from public.connections c left join public.conversations chat on chat.source_key='direct:'||c.user_a||':'||c.user_b
 where c.user_a=least(actor,target) and c.user_b=greatest(actor,target) and public.safety_pair_allowed(actor,target)
 and not exists(select 1 from safety_private.revoked_connections r where r.connection_id=c.id)), '{"status":"none","conversationId":null}'::jsonb);
$$;
create function public.social_connection(target_in uuid,action_in text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=safety_private.actor(); c public.connections;
begin
 if target_in is null or target_in=actor or action_in not in('get','request','accept','remove') or action_in is null then raise exception 'Invalid connection request' using errcode='22023'; end if;
 if action_in='get' then return social_private.connection_state(actor,target_in); end if;
 perform social_private.lock_pair(actor,target_in);
 select * into c from public.connections where user_a=least(actor,target_in) and user_b=greatest(actor,target_in);
 perform 1 from public.account_settings prefs where prefs.user_id in(actor,target_in) order by prefs.user_id for share;
 if action_in='remove' then
  delete from public.connections where id=c.id;
  return social_private.connection_state(actor,target_in);
 end if;
 if not public.safety_pair_allowed(actor,target_in) or not social_private.discoverable(actor) or not social_private.discoverable(target_in)
 or exists(select 1 from safety_private.revoked_connections r where r.connection_id=c.id) then raise exception 'Connection unavailable' using errcode='42501'; end if;
 if c.id is null then
  if action_in='accept' then raise exception 'No incoming request' using errcode='42501'; end if;
  insert into public.connections(user_a,user_b,initiated_by) values(least(actor,target_in),greatest(actor,target_in),actor);
 elsif c.status='pending' and c.initiated_by<>actor then
  update public.connections set status='accepted' where id=c.id;
 elsif action_in='accept' and c.status<>'accepted' then raise exception 'No incoming request' using errcode='42501';
 end if;
 return social_private.connection_state(actor,target_in);
end $$;
create function public.social_connection_list() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=safety_private.actor(); result jsonb;
begin
 select jsonb_build_object('incoming',coalesce(jsonb_agg(person||jsonb_build_object('requested_at',c.created_at) order by c.created_at desc,c.id) filter(where c.status='pending' and c.initiated_by<>actor),'[]'),
 'sent',coalesce(jsonb_agg(person||jsonb_build_object('requested_at',c.created_at) order by c.created_at desc,c.id) filter(where c.status='pending' and c.initiated_by=actor),'[]'),
 'connected',coalesce(jsonb_agg(person||jsonb_build_object('conversationId',social_private.connection_state(actor,other)->'conversationId') order by c.created_at desc,c.id) filter(where c.status='accepted'),'[]')) into result
 from public.connections c cross join lateral (select case when c.user_a=actor then c.user_b else c.user_a end other) peer
 cross join lateral (select social_private.person(other,actor)-'last_read_seq' person) projection
 where actor in(c.user_a,c.user_b) and public.safety_pair_allowed(c.user_a,c.user_b)
 and not exists(select 1 from safety_private.revoked_connections r where r.connection_id=c.id);
 return result;
end $$;

create function public.social_inbox(page_in integer default 1) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=safety_private.actor(); result jsonb; items jsonb;
begin
 if page_in is null or page_in not between 1 and 10000 then raise exception 'Invalid inbox page' using errcode='22023';end if;
 result:=public.messaging_list_conversations(actor,page_in);
 select coalesce(jsonb_agg(jsonb_set(item,'{participants}',social_private.participants((item->>'id')::uuid,actor)) order by ord),'[]') into items
 from jsonb_array_elements(result->'conversations') with ordinality rows(item,ord);
 return jsonb_set(result,'{conversations}',items);
end $$;
create function public.social_history(conversation_in uuid,before_in bigint default null,after_in bigint default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=safety_private.actor(); result jsonb; other uuid;
begin
 if (before_in is not null and after_in is not null) or before_in<1 or after_in<0 or coalesce(before_in,0)>9007199254740991 or coalesce(after_in,0)>9007199254740991 then raise exception 'Invalid message cursor' using errcode='22023';end if;
 result:=public.messaging_history(actor,conversation_in,before_in,after_in);
 other:=social_private.peer(conversation_in,actor);
 return result||jsonb_build_object('canSend',coalesce(other is not null and social_private.contact_allowed(actor,other),false),'participants',social_private.participants(conversation_in,actor));
end $$;
create function public.social_send(conversation_in uuid,body_in text,request_in uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=safety_private.actor(); other uuid; previous public.messages; result jsonb;
begin
 body_in:=regexp_replace(body_in,'^[[:space:]]+|[[:space:]]+$','','g');
 if body_in is null or public.profile_language_key(body_in)='' or (select coalesce(sum(case when ascii(ch)>65535 then 2 else 1 end),0) from regexp_split_to_table(body_in,'') ch)>2000 or request_in is null then raise exception 'Invalid message' using errcode='22023';end if;
 other:=social_private.peer(conversation_in,actor);
 if other is null then raise exception 'Conversation unavailable' using errcode='42501';end if;
 perform social_private.lock_pair(actor,other);
 if not social_private.contact_allowed(actor,other) then raise exception 'Contact unavailable' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('pebble.social.send.v1:'||actor::text||':'||request_in::text,0));
 select m.* into previous from social_private.send_requests r join public.messages m on m.id=r.message_id where r.actor_id=actor and r.request_id=request_in;
 if found then
  if previous.body<>body_in or previous.conversation_id<>conversation_in then raise exception 'Message request conflict' using errcode='SC409';end if;
  return to_jsonb(previous)-'client_request_id';
 end if;
 result:=public.messaging_send(actor,conversation_in,body_in,request_in);
 insert into social_private.send_requests(actor_id,request_id,message_id) values(actor,request_in,(result->>'id')::uuid);
 return result;
end $$;
create function public.social_read(conversation_in uuid,seq_in bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=safety_private.actor(); other uuid; saved bigint;
begin
 if seq_in is null or seq_in not between 0 and 9007199254740991 then raise exception 'Invalid read position' using errcode='22023';end if;
 other:=social_private.peer(conversation_in,actor);
 if other is null then raise exception 'Conversation unavailable' using errcode='42501';end if;
 perform social_private.lock_pair(actor,other);
 if not social_private.contact_allowed(actor,other) then raise exception 'Contact unavailable' using errcode='42501';end if;
 if seq_in<>0 and not exists(select 1 from public.messages m where m.conversation_id=conversation_in and m.seq=seq_in and not public.messaging_hidden(actor,m.sender_id)) then raise exception 'Message unavailable' using errcode='42501';end if;
 saved:=public.messaging_mark_read(actor,conversation_in,seq_in);
 return jsonb_build_object('lastReadSeq',saved);
end $$;
create function public.social_activity() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=safety_private.actor(); result jsonb;begin
 result:=public.messaging_activity(actor);
 return result||jsonb_build_object('incomingRequests',jsonb_array_length(public.social_connection_list()->'incoming'));
end $$;
revoke all on all functions in schema social_private from public,anon,authenticated;
revoke all on function public.social_connection(uuid,text),public.social_connection_list(),public.social_inbox(integer),public.social_history(uuid,bigint,bigint),public.social_send(uuid,text,uuid),public.social_read(uuid,bigint),public.social_activity() from public,anon,authenticated;
grant execute on function public.social_connection(uuid,text),public.social_connection_list(),public.social_inbox(integer),public.social_history(uuid,bigint,bigint),public.social_send(uuid,text,uuid),public.social_read(uuid,bigint),public.social_activity() to authenticated;
do $$ declare r text; t text; f record; signature text; begin
 foreach r in array array['anon','authenticated'] loop
  if has_schema_privilege(r::name,'social_private','USAGE') then raise exception 'Inherited social schema grant' using errcode='42501'; end if;
  for t in select tablename from pg_catalog.pg_tables where schemaname='social_private' loop
   if has_table_privilege(r::name,'social_private.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    or has_any_column_privilege(r::name,'social_private.'||t,'SELECT,INSERT,UPDATE,REFERENCES') then raise exception 'Inherited social table grant' using errcode='42501'; end if;
  end loop;
  for f in select p.oid from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='social_private' loop
   if has_function_privilege(r::name,f.oid,'EXECUTE') then raise exception 'Inherited social helper grant' using errcode='42501'; end if;
  end loop;
 end loop;
 foreach signature in array array['public.social_connection(uuid,text)','public.social_connection_list()','public.social_inbox(integer)','public.social_history(uuid,bigint,bigint)','public.social_send(uuid,text,uuid)','public.social_read(uuid,bigint)','public.social_activity()'] loop
  if has_function_privilege('anon',signature,'EXECUTE') or not has_function_privilege('authenticated',signature,'EXECUTE') then raise exception 'Social RPC privilege mismatch' using errcode='42501'; end if;
 end loop;
end $$;
commit;
