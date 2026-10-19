-- REVIEW CANDIDATE. Requires owner/contact, social, facts and detailed settings.
-- Withdraw raw legacy exposure; owner definer APIs retain their private readback.
-- Install as one reviewed rollout with active matcher, never into app DB here.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
do $$ declare signature text; begin
 if to_regprocedure('social_private.discoverable(uuid)') is null or to_regprocedure('public.get_detailed_settings()') is null then raise exception 'Privacy prerequisites missing' using errcode='22023'; end if;
 foreach signature in array array['public.join_queue(text)','public.leave_queue()','public.express_event_interest(bigint,text)','public.withdraw_event_interest(bigint)','public.search_people(text,integer)','public.get_queue_status()','public.social_connection_list()','public.get_events_with_interest(text,text,integer)','public.get_event_matches(bigint)','public.get_recommended_meetups(integer)','event_group_private.profile_valid(uuid)'] loop
  if to_regprocedure(signature) is not null and not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure(signature) and pg_get_userbyid(proowner)=current_user) then raise exception 'Privacy function owner mismatch: %',signature using errcode='42501'; end if;
 end loop;
 if has_schema_privilege('anon','public','CREATE') or has_schema_privilege('authenticated','public','CREATE') then raise exception 'Untrusted public schema' using errcode='42501'; end if;
end $$;
-- All profile/child writes go through existing actor-bound canonical saves. In
-- particular, users cannot forge coordinates, last-seen flags or readiness by DML.
do $$ declare t text; r text; a record; f text; seq text; begin
 foreach t in array array['profiles','user_interests','availability','queue_entries','event_interest','meetup_attendees','interaction_outcomes','meetups'] loop
  execute format('revoke all on table public.%I from public,anon,authenticated',t);
  for a in select attname from pg_catalog.pg_attribute where attrelid=('public.'||t)::regclass and attnum>0 and not attisdropped loop
   execute format('revoke select(%I),insert(%I),update(%I),references(%I) on public.%I from public,anon,authenticated',a.attname,a.attname,a.attname,a.attname,t);
  end loop;
  if exists(select 1 from pg_catalog.pg_attribute where attrelid=('public.'||t)::regclass and attname='id' and attidentity<>'') then
   seq:=pg_get_serial_sequence('public.'||t,'id'); execute format('revoke all on sequence %s from public,anon,authenticated',seq);
   foreach r in array array['anon','authenticated'] loop
    if has_sequence_privilege(r::name,seq,'SELECT,USAGE,UPDATE') then raise exception 'Inherited privacy sequence bypass: % %',r,seq using errcode='42501'; end if;
   end loop;
  end if;
  foreach r in array array['anon','authenticated'] loop
   if has_table_privilege(r::name,'public.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_any_column_privilege(r::name,'public.'||t,'SELECT,INSERT,UPDATE,REFERENCES') then raise exception 'Inherited raw privacy bypass: % %',r,t using errcode='42501'; end if;
  end loop;
 end loop;
 -- No direct arbitrary-person scoring, profile-text, schedule, outcome or old
 -- queue projection RPC. Owner canonical getters never take another actor ID.
 foreach f in array array['public.user_interest_vector(uuid)','public.profile_text(uuid)','public.profile_embedding(uuid)','public.shared_interest_labels(uuid,uuid)',
 'public.availability_overlap_minutes(uuid,uuid)','public.social_reliability(uuid)','public.collaborative_fit(uuid,uuid)','public.person_friend_score(uuid,uuid)','public.person_dating_score(uuid,uuid)',
 'public.get_queue_match()','public.record_interaction(uuid,text,boolean,integer,boolean,boolean)','public.get_gemini_embedding(text)','public.meetup_embedding(bigint)'] loop
  if to_regprocedure(f) is not null then
   execute format('revoke all on function %s from public,anon,authenticated',f);
   foreach r in array array['anon','authenticated'] loop
    if has_function_privilege(r::name,f,'EXECUTE') then raise exception 'Inherited legacy privacy RPC bypass: % %',r,f using errcode='42501'; end if;
   end loop;
  end if;
 end loop;
end $$;
create function social_private.friends_discoverable(person uuid) returns boolean language sql stable security definer set search_path='' as $$
 select social_private.discoverable(person) and exists(select 1 from public.detailed_settings s where s.user_id=person and s.settings->>'friendsDiscovery'='true');
$$;
-- Historical membership authorizes old bodies, not live metadata about an
-- inactive, blocked or no-longer-connected peer. Pending requests have an
-- explicit current audience only while both owners remain discoverable.
create function social_private.profile_audience(viewer uuid,person uuid) returns boolean language sql stable security definer set search_path='' as $$
 select viewer=person or social_private.contact_allowed(viewer,person) or
 (public.safety_pair_allowed(viewer,person) and social_private.discoverable(viewer) and social_private.discoverable(person)
 and exists(select 1 from public.connections c where c.user_a=least(viewer,person) and c.user_b=greatest(viewer,person) and c.status='pending'
 and not exists(select 1 from safety_private.revoked_connections r where r.connection_id=c.id)));
$$;
create or replace function social_private.person(person uuid,viewer uuid,read_seq bigint default 0) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',person,'display_name',case when social_private.profile_audience(viewer,person) then coalesce(p.display_name,'Account '||person::text) else 'Account '||person::text end,
 'avatar_url',case when social_private.profile_audience(viewer,person) and p.avatar_url ~ '^https://' then p.avatar_url else null end,'last_read_seq',read_seq)
 from (values(person)) me(id) left join public.profiles p on p.id=me.id;
$$;
create or replace function public.social_connection_list() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=safety_private.actor(); result jsonb;
begin
 select jsonb_build_object('incoming',coalesce(jsonb_agg(person||jsonb_build_object('requested_at',c.created_at) order by c.created_at desc,c.id) filter(where c.status='pending' and c.initiated_by<>actor),'[]'),
 'sent',coalesce(jsonb_agg(person||jsonb_build_object('requested_at',c.created_at) order by c.created_at desc,c.id) filter(where c.status='pending' and c.initiated_by=actor),'[]'),
 'connected',coalesce(jsonb_agg(person||jsonb_build_object('conversationId',social_private.connection_state(actor,other)->'conversationId') order by c.created_at desc,c.id) filter(where c.status='accepted'),'[]')) into result
 from public.connections c cross join lateral (select case when c.user_a=actor then c.user_b else c.user_a end other) peer
 cross join lateral (select social_private.person(other,actor)-'last_read_seq' person) projection
 where actor in(c.user_a,c.user_b) and (c.status='accepted' or (social_private.discoverable(actor) and social_private.discoverable(other))) and public.safety_pair_allowed(c.user_a,c.user_b)
 and not exists(select 1 from safety_private.revoked_connections r where r.connection_id=c.id);
 return result;
end $$;

-- Require current canonical audience even through a legacy elevated writer.
create function social_private.discovery_admission() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if safety_private.maintenance() then return new; end if;
 if tg_op='INSERT' or (tg_op='UPDATE' and new.status is distinct from old.status and new.status='accepted') then
  perform social_private.lock_pair(new.user_a,new.user_b);
  perform 1 from public.account_settings s where s.user_id in(new.user_a,new.user_b) order by s.user_id for share;
  if not social_private.discoverable(new.user_a) or not social_private.discoverable(new.user_b) then raise exception 'Connection unavailable' using errcode='42501'; end if;
 end if;
 return new;
end $$;
create trigger social_discovery_admission before insert or update on public.connections for each row execute function social_private.discovery_admission();
-- Legacy queue RPCs may enroll only their authenticated owner, never Dating.
create function social_private.queue_admission() returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid; begin
 if safety_private.maintenance() then return new; end if;
 actor:=safety_private.actor();
 if new.profile_id is distinct from actor or (tg_op='UPDATE' and new.profile_id is distinct from old.profile_id) or new.queue_type not in('matchmaking','downtime') then raise exception 'Queue unavailable' using errcode='42501'; end if;
 perform 1 from public.profiles p where p.id=actor for share;
 perform 1 from public.account_settings s where s.user_id=actor for share;
 if not social_private.discoverable(actor) or (new.queue_type='matchmaking' and not social_private.friends_discoverable(actor)) then raise exception 'Save your profile and enable discovery before joining' using errcode='PF409'; end if;
 new.joined_at:=statement_timestamp(); return new;
end $$;
create trigger social_queue_admission before insert or update on public.queue_entries for each row execute function social_private.queue_admission();
-- Public-event interest is not itself permission to discover/contact attendees.
-- Hosted-event block admission uses the same pair fence as block/unblock.
create function social_private.event_interest_admission() returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid; host uuid; begin
 if safety_private.maintenance() then return new; end if;
 actor:=safety_private.actor();
 if new.profile_id is distinct from actor or (tg_op='UPDATE' and row(new.profile_id,new.meetup_id,new.created_at) is distinct from row(old.profile_id,old.meetup_id,old.created_at)) then raise exception 'Event unavailable' using errcode='42501'; end if;
 select m.host_id into host from public.meetups m where m.id=new.meetup_id and m.is_public and m.starts_at>statement_timestamp() for share;
 if not found then raise exception 'Event unavailable' using errcode='42501'; end if;
 if host is not null and host<>actor then
  perform social_private.lock_pair(actor,host);
  if not public.safety_pair_allowed(actor,host) then raise exception 'Event unavailable' using errcode='42501'; end if;
 end if;
 if char_length(new.note)>1000 then raise exception 'Event note too long' using errcode='22023'; end if;
 if tg_op='INSERT' then new.created_at:=statement_timestamp(); end if;
 return new;
end $$;
create trigger social_event_interest_admission before insert or update on public.event_interest for each row execute function social_private.event_interest_admission();
-- Pin legacy writer resolution too: an empty-path caller or hostile pg_temp
-- must not redirect a SECURITY DEFINER write into a different relation.
create or replace function public.join_queue(qtype text) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=safety_private.actor(); begin
 if qtype is null or qtype not in('matchmaking','downtime') then raise exception 'Queue unavailable' using errcode='42501'; end if;
 insert into public.queue_entries(profile_id,queue_type) values(actor,qtype)
 on conflict(profile_id) do update set queue_type=excluded.queue_type,joined_at=statement_timestamp();
end $$;
create or replace function public.leave_queue() returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=safety_private.actor(); begin delete from public.queue_entries where profile_id=actor; end $$;
create or replace function public.express_event_interest(meetup_id_in bigint,note_in text default null) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=safety_private.actor(); begin
 if meetup_id_in is null or meetup_id_in<=0 or coalesce(char_length(note_in),0)>1000 then raise exception 'Invalid event interest' using errcode='22023'; end if;
 insert into public.event_interest(meetup_id,profile_id,note) values(meetup_id_in,actor,note_in)
 on conflict(meetup_id,profile_id) do update set note=excluded.note;
end $$;
create or replace function public.withdraw_event_interest(meetup_id_in bigint) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=safety_private.actor(); begin
 if meetup_id_in is null or meetup_id_in<=0 then raise exception 'Invalid event' using errcode='22023'; end if;
 delete from public.event_interest where meetup_id=meetup_id_in and profile_id=actor;
end $$;
revoke all on function public.join_queue(text),public.leave_queue(),public.express_event_interest(bigint,text),public.withdraw_event_interest(bigint) from public,anon,authenticated;
grant execute on function public.join_queue(text),public.leave_queue(),public.express_event_interest(bigint,text),public.withdraw_event_interest(bigint) to authenticated;
-- Preserve legacy status signature but never expose a roster-size side channel.
create or replace function public.get_queue_status() returns table(my_queue text,others_in_my_queue integer)
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=safety_private.actor(); begin
 return query select (select q.queue_type from public.queue_entries q where q.profile_id=actor),null::integer;
end $$;
revoke all on function public.get_queue_status() from public,anon,authenticated;
grant execute on function public.get_queue_status() to authenticated;
create or replace function public.search_people(q text,max_results integer default 20)
returns table(profile_id uuid,username text,display_name text,bio text,location_city text,avatar_url text,connection_status text)
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=safety_private.actor(); begin
 if q is null or char_length(q) not between 2 and 120 or max_results is null or max_results not between 1 and 20 then raise exception 'Invalid search' using errcode='22023'; end if;
 if not social_private.friends_discoverable(actor) then return; end if;
 return query select p.id,p.username,p.display_name,p.bio,p.location_city,case when p.avatar_url ~ '^https://' then p.avatar_url else null end,
 case social_private.connection_state(actor,p.id)->>'status' when 'sent' then 'pending_sent' when 'incoming' then 'pending_received' when 'connected' then 'connected' else 'none' end
 from public.profiles p where p.id<>actor and social_private.friends_discoverable(p.id) and public.safety_pair_allowed(actor,p.id)
 and (p.username ilike '%'||q||'%' or p.display_name ilike '%'||q||'%' or p.location_city ilike '%'||q||'%'
 or exists(select 1 from public.user_interests i where i.profile_id=p.id and i.text ilike '%'||q||'%'))
 order by p.username,p.id limit max_results;
end $$;
revoke all on function public.search_people(text,integer) from public,anon,authenticated;
grant execute on function public.search_people(text,integer) to authenticated;
revoke all on all functions in schema social_private from public,anon,authenticated;

create or replace function public.get_events_with_interest(
  filter_category text default null,
  filter_city     text default null,
  max_results     int  default 30
)
returns table (
  event_id          bigint,
  title             text,
  description       text,
  category          text,
  location_name     text,
  location_city     text,
  starts_at         timestamptz,
  ends_at           timestamptz,
  host_id           uuid,
  host_username     text,
  host_display_name text,
  host_avatar_url   text,
  interested_count  int,
  i_am_interested   boolean
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if max_results is null or max_results not between 1 and 30 or coalesce(char_length(filter_city),0)>120 or coalesce(char_length(filter_category),0)>120 then raise exception 'Invalid event filters' using errcode='22023'; end if;
  return query select
    m.id,
    m.title,
    m.description,
    m.category,
    m.location_name,
    p.location_city,
    m.starts_at,
    m.ends_at,
    m.host_id,
    p.username,
    p.display_name,
    p.avatar_url,
    (select count(*)::int from public.event_interest ei where ei.meetup_id = m.id and (ei.profile_id=auth.uid() or (social_private.discoverable(ei.profile_id) and public.safety_pair_allowed(auth.uid(),ei.profile_id)))),
    exists (
      select 1 from public.event_interest ei
      where ei.meetup_id = m.id and ei.profile_id = auth.uid()
    )
  from public.meetups m
  join public.profiles p on p.id = m.host_id
  where auth.uid() is not null and social_private.discoverable(auth.uid())
    and (m.host_id=auth.uid() or (social_private.discoverable(m.host_id) and public.safety_pair_allowed(auth.uid(),m.host_id)))
    and m.is_public = true
    and m.starts_at > now()
    and (filter_category is null or m.category = filter_category)
    and (filter_city is null or p.location_city = filter_city)
  order by m.starts_at asc
  limit max_results;
end;
$$;

create or replace function public.get_event_matches(meetup_id_in bigint)
returns table (
  profile_id       uuid,
  username         text,
  display_name     text,
  avatar_url       text,
  bio              text,
  note             text,
  shared_interests text[],
  match_score      numeric
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  return query
  select
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.bio,
    ei.note,
    shared_interest_labels(me, p.id),
    person_friend_score(me, p.id)
  from public.event_interest ei
  join public.profiles p on p.id = ei.profile_id
  where social_private.discoverable(me) and social_private.discoverable(ei.profile_id)
    and exists(select 1 from public.event_interest own where own.meetup_id=meetup_id_in and own.profile_id=me)
    and exists(select 1 from public.meetups event where event.id=meetup_id_in and event.is_public and event.starts_at>statement_timestamp() and (event.host_id is null or event.host_id=me or public.safety_pair_allowed(me,event.host_id)))
    and ei.meetup_id = meetup_id_in
    and ei.profile_id <> me
    and p.is_active = true
    and ei.profile_id not in (
      select case when user_a = me then user_b else user_a end
      from public.connections where user_a = me or user_b = me
    )
    and ei.profile_id not in (select blocked_id from public.blocks where blocker_id = me)
    and ei.profile_id not in (select blocker_id from public.blocks where blocked_id = me)
  order by person_friend_score(me, p.id) desc;
end;
$$;

create or replace function public.get_recommended_meetups(max_results int default 10)
returns table (
  meetup_id     bigint,
  title         text,
  description   text,
  category      text,
  location_name text,
  starts_at     timestamptz,
  host_username text,
  similarity    numeric
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  if max_results is null or max_results not between 1 and 30 then raise exception 'Invalid recommendation limit' using errcode='22023'; end if;
  return query
  select
    m.id,
    m.title,
    m.description,
    m.category,
    m.location_name,
    m.starts_at,
    p.username,
    round((
      vec_similarity(user_interest_vector(me), meetup_embedding(m.id)) * 0.6
      + vec_similarity(profile_embedding(me), meetup_embedding(m.id)) * 0.4
    )::numeric, 4)
  from public.meetups m
  join public.profiles p on p.id = m.host_id
  where auth.uid() is not null and social_private.discoverable(auth.uid())
    and (m.host_id=auth.uid() or (social_private.discoverable(m.host_id) and public.safety_pair_allowed(auth.uid(),m.host_id)))
    and m.is_public = true
    and m.starts_at > now()
    and m.id not in (select meetup_id from public.meetup_attendees where profile_id = me)
  order by 8 desc, m.starts_at asc
  limit max_results;
end;
$$;

-- Existing group workers/proposals already recheck bilateral blocks. Extend
-- their profile eligibility, not group membership or post-match lifecycle.
do $$ declare definition text; begin
 if to_regprocedure('event_group_private.profile_valid(uuid)') is not null then
  definition:=pg_catalog.pg_get_functiondef('event_group_private.profile_valid(uuid)'::regprocedure);
  if position('where p.id=actor_in and p.is_active' in definition)=0 then raise exception 'Unreviewed group eligibility body' using errcode='22023'; end if;
  definition:=replace(definition,'where p.id=actor_in and p.is_active','where p.id=actor_in and p.is_active and social_private.discoverable(actor_in)');
  execute definition;
 end if;
end $$;
revoke all on function public.get_events_with_interest(text,text,integer),public.get_event_matches(bigint),public.get_recommended_meetups(integer) from public,anon,authenticated;
grant execute on function public.get_events_with_interest(text,text,integer),public.get_event_matches(bigint),public.get_recommended_meetups(integer) to authenticated;
do $$ declare signature text; begin
 foreach signature in array array['public.join_queue(text)','public.leave_queue()','public.express_event_interest(bigint,text)','public.withdraw_event_interest(bigint)','public.get_queue_status()','public.search_people(text,integer)','public.get_events_with_interest(text,text,integer)','public.get_event_matches(bigint)','public.get_recommended_meetups(integer)'] loop
  if has_function_privilege('anon',signature,'EXECUTE') or not has_function_privilege('authenticated',signature,'EXECUTE') then raise exception 'Discovery RPC privilege mismatch' using errcode='42501'; end if;
 end loop;
end $$;
commit;
