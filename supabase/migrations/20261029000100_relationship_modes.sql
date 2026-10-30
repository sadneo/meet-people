-- Keep origin as metadata, without creating a second relationship or chat.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create table social_private.relationship_modes (
 user_a uuid not null references public.profiles(id) on delete cascade,
 user_b uuid not null references public.profiles(id) on delete cascade,
 connection_id bigint unique references public.connections(id) on delete set null,
 mode text not null check(mode in('friends','dating')),
 primary key(user_a,user_b),check(user_a<user_b)
);
alter table social_private.relationship_modes enable row level security;
revoke all on social_private.relationship_modes from public,anon,authenticated;

create function social_private.record_relationship_mode(actor uuid,target uuid,mode_in text) returns void
language plpgsql security definer set search_path='' as $$
declare c public.connections;begin
 if mode_in is null or mode_in not in('friends','dating') then raise exception 'Invalid relationship mode';end if;
 select * into c from public.connections where user_a=least(actor,target) and user_b=greatest(actor,target);
 if c.id is null then raise exception 'Relationship required';end if;
 insert into social_private.relationship_modes(user_a,user_b,connection_id,mode)
 values(c.user_a,c.user_b,c.id,mode_in)
 on conflict(user_a,user_b) do update set connection_id=excluded.connection_id,mode=excluded.mode
 where social_private.relationship_modes.connection_id is distinct from excluded.connection_id
 or social_private.relationship_modes.mode=excluded.mode;
 if not found then raise exception 'Relationship mode cannot be changed' using errcode='42501';end if;
end $$;
revoke all on function social_private.record_relationship_mode(uuid,uuid,text) from public,anon,authenticated;

create or replace function public.friends_discovery_connection(target_in uuid,action_in text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=safety_private.actor();current_connection public.connections;origin text;result jsonb;
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'READ COMMITTED required' using errcode='25001';end if;
 if target_in is null or target_in=actor or action_in is null or action_in not in('request','accept') then raise exception 'Invalid Friends action' using errcode='22023';end if;
 perform friends_private.lock_pair(actor,target_in);
 if not friends_private.pair_allowed(actor,target_in) then raise exception 'Friends connection unavailable' using errcode='42501';end if;
 select * into current_connection from public.connections c where c.user_a=least(actor,target_in) and c.user_b=greatest(actor,target_in);
 select mode into origin from social_private.relationship_modes where connection_id=current_connection.id;
 if origin='dating' then raise exception 'Respond through Dating, not Friends' using errcode='FR409';end if;
 if action_in='request' and current_connection.status='pending' and current_connection.initiated_by<>actor then
  raise exception 'Accept the incoming request explicitly' using errcode='FR409';end if;
 if action_in='accept' and (current_connection.id is null or (current_connection.status<>'accepted' and current_connection.initiated_by=actor)) then
  raise exception 'No incoming Friends request' using errcode='FR409';end if;
 result:=public.social_connection(target_in,action_in);
 -- Never infer the mode of historical, unrecorded relationships on a retry.
 if current_connection.id is null or origin='friends' then
  perform social_private.record_relationship_mode(actor,target_in,'friends');end if;
 return result;
end $$;

create or replace function public.request_dating_connection(target_in uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=safety_private.actor();c public.connections;origin text;result jsonb;begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'READ COMMITTED required' using errcode='25001';end if;
 if target_in is null or target_in=actor then raise exception 'Invalid target' using errcode='22023';end if;
 perform 1 from auth.users u where u.id in(actor,target_in) order by u.id for share;
 perform dating_private.lock_eligibility(actor,target_in);
 if not dating_private.rules_pair(actor,target_in) then raise exception 'Dating connection unavailable' using errcode='DL409';end if;
 select * into c from public.connections where user_a=least(actor,target_in) and user_b=greatest(actor,target_in);
 select mode into origin from social_private.relationship_modes where connection_id=c.id;
 if origin='friends' or (c.id is not null and origin is null) then
  raise exception 'Existing relationship must be resolved in its original context' using errcode='DL409';end if;
 result:=public.social_connection(target_in,'request');
 perform social_private.record_relationship_mode(actor,target_in,'dating');
 return result;
end $$;

create or replace function public.social_connection_list() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=safety_private.actor(); result jsonb;
begin
 select jsonb_build_object('incoming',coalesce(jsonb_agg(person||jsonb_build_object('requested_at',c.created_at,'mode',origin.mode) order by c.created_at desc,c.id) filter(where c.status='pending' and c.initiated_by<>actor),'[]'),
 'sent',coalesce(jsonb_agg(person||jsonb_build_object('requested_at',c.created_at,'mode',origin.mode) order by c.created_at desc,c.id) filter(where c.status='pending' and c.initiated_by=actor),'[]'),
 'connected',coalesce(jsonb_agg(person||jsonb_build_object('conversationId',social_private.connection_state(actor,other)->'conversationId','mode',origin.mode) order by c.created_at desc,c.id) filter(where c.status='accepted'),'[]')) into result
 from public.connections c left join social_private.relationship_modes origin on origin.connection_id=c.id
 cross join lateral (select case when c.user_a=actor then c.user_b else c.user_a end other) peer
 cross join lateral (select social_private.person(other,actor)-'last_read_seq' person) projection
 where actor in(c.user_a,c.user_b) and (c.status='accepted' or (social_private.discoverable(actor) and social_private.discoverable(other))) and public.safety_pair_allowed(c.user_a,c.user_b)
 and not exists(select 1 from safety_private.revoked_connections r where r.connection_id=c.id);
 return result;
end $$;

create or replace function public.social_inbox(page_in integer default 1) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=safety_private.actor(); items jsonb; more boolean;
begin
 if page_in is null or page_in not between 1 and 10000 then raise exception 'Invalid inbox page' using errcode='22023';end if;
 select coalesce(jsonb_agg(item order by activity desc,id),'[]'),count(*)>30 into items,more from (
  select alias.id,coalesce((select max(m.created_at) from public.messages m where m.conversation_id=c.id),c.created_at) activity,
   jsonb_build_object('id',alias.id,'kind','direct','created_at',c.created_at,'participants',social_private.participants(c.id,actor),'mode',origin.mode,
    'latest_message',(select social_private.message(m.id) from public.messages m where m.conversation_id=c.id order by m.id desc limit 1),
    'unread_count',social_private.unread(c.id,actor)) item
  from public.conversations c join social_private.conversations alias on alias.legacy_id=c.id
  left join social_private.relationship_modes origin on origin.user_a=c.user_a and origin.user_b=c.user_b
  where actor in(c.user_a,c.user_b)
  order by activity desc,alias.id limit 31 offset (page_in-1)*30
 ) rows;
 if more then items:=items-30;end if;
 return jsonb_build_object('conversations',items,'hasMore',more);
end $$;
notify pgrst,'reload schema';
commit;
