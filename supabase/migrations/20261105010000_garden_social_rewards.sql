-- Additive Garden rewards. Existing wallets, purchases, receipts and balances stay intact.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';

-- Keep the established spending/check-in implementation behind the same public RPC.
alter function public.garden_account(jsonb) set schema garden_private;
alter function garden_private.garden_account(jsonb) rename to account_v1;
revoke all on function garden_private.account_v1(jsonb) from public,anon,authenticated;

create function garden_private.social_candidates(actor uuid,returning_in boolean)
returns table(peer uuid) language sql stable security definer set search_path='' as $$
 with pairs as (
  select c.*,case when c.user_a=actor then c.user_b else c.user_a end other
  from public.connections c where actor in(c.user_a,c.user_b) and c.status='accepted'
  and not exists(select 1 from safety_private.revoked_connections r where r.connection_id=c.id)
 ), eligible as (
  select p.other,chat.id, greatest(coalesce(p.responded_at,p.created_at),mine.joined_at,theirs.joined_at,
   case when returning_in then greatest(date_trunc('week',statement_timestamp() at time zone 'UTC') at time zone 'UTC',reward.created_at+interval '7 days')
    else statement_timestamp()-interval '30 days' end) since,
   greatest(mine.joined_after_seq,theirs.joined_after_seq) after_seq
  from pairs p
  join auth.users a on a.id=actor and a.email_confirmed_at is not null and a.created_at<=statement_timestamp()-interval '7 days'
  join auth.users b on b.id=p.other and b.email_confirmed_at is not null and b.created_at<=statement_timestamp()-interval '7 days'
  join public.conversations chat on chat.kind='direct' and chat.source_key='direct:'||p.user_a||':'||p.user_b
  join public.conversation_participants mine on mine.conversation_id=chat.id and mine.user_id=actor and mine.left_at is null
  join public.conversation_participants theirs on theirs.conversation_id=chat.id and theirs.user_id=p.other and theirs.left_at is null
  left join garden_private.ledger reward on reward.owner=actor and reward.key='connection:'||p.other
  where social_private.contact_allowed(actor,p.other)
   and ((not returning_in and reward.key is null) or (returning_in and reward.created_at<=statement_timestamp()-interval '7 days'))
 ), days as (
  select e.other,(m.created_at at time zone 'UTC')::date as check_day,
   min(m.created_at) filter(where m.sender_id=actor) first_a,max(m.created_at) filter(where m.sender_id=actor) last_a,
   min(m.created_at) filter(where m.sender_id=e.other) first_b,max(m.created_at) filter(where m.sender_id=e.other) last_b
  from eligible e join public.messages m on m.conversation_id=e.id and m.sender_id in(actor,e.other)
   and m.created_at>=e.since and m.created_at<=statement_timestamp() and m.seq>e.after_seq
  group by e.other,(m.created_at at time zone 'UTC')::date
  having count(distinct m.sender_id)=2
 )
 select other from days group by other having count(*)>=2
  and max(last_a)-min(first_a)>=interval '24 hours' and max(last_b)-min(first_b)>=interval '24 hours'
 order by other;
$$;
revoke all on function garden_private.social_candidates(uuid,boolean) from public,anon,authenticated;

create function public.garden_account(command_in jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); action text:=command_in->>'action'; result jsonb; request uuid; prior jsonb;
 week_start date:=date_trunc('week',statement_timestamp() at time zone 'UTC')::date;
 week_instant timestamptz:=date_trunc('week',statement_timestamp() at time zone 'UTC') at time zone 'UTC';
 connection_count integer; touch_claimed boolean; target uuid; payout integer; reward_key text; dates jsonb;
begin
 -- Base RPC authenticates/initializes and holds the wallet row lock until this transaction ends.
 if action in('connection-reward','keep-in-touch') then
  result:=garden_private.account_v1(null);
  if jsonb_typeof(command_in)<>'object' or not(command_in ?& array['action','requestId','revision'])
   or (command_in-array['action','requestId','revision'])<>'{}'::jsonb
   or jsonb_typeof(command_in->'revision') is distinct from 'number'
   or (command_in->>'revision') !~ '^[0-9]{1,9}$' then raise exception 'Invalid command' using errcode='22023';end if;
  begin request:=(command_in->>'requestId')::uuid;exception when others then raise exception 'Invalid request' using errcode='22023';end;
  if request is null then raise exception 'Invalid request' using errcode='22023';end if;
  select command into prior from garden_private.receipts where owner=actor and request_id=request;
  if found then
   if prior<>command_in then raise exception 'Request reused' using errcode='GR409';end if;
  else
   if (command_in->>'revision')::integer<>(result->>'revision')::integer then raise exception 'Stale garden' using errcode='GR409';end if;
   if (select count(*) from garden_private.receipts where owner=actor and created_at>statement_timestamp()-interval '1 minute')>=60 then raise exception 'Slow down' using errcode='GR429';end if;
   if action='connection-reward' then
    if (select count(*) from garden_private.ledger where owner=actor and key like 'connection:%' and created_at>=week_instant)>=2 then raise exception 'Weekly limit reached' using errcode='GR400';end if;
    payout:=30;
   else
    if exists(select 1 from garden_private.ledger where owner=actor and key='touch:'||week_start) then raise exception 'Already collected this week' using errcode='GR400';end if;
    payout:=20;
   end if;
   select peer into target from garden_private.social_candidates(actor,action='keep-in-touch') limit 1;
   if target is null then raise exception 'No eligible connection yet' using errcode='GR400';end if;
   -- Serialize with existing block/connection safety operations, then recheck eligibility.
   perform social_private.lock_pair(actor,target);
   if not exists(select 1 from garden_private.social_candidates(actor,action='keep-in-touch') where peer=target) then raise exception 'Connection no longer eligible' using errcode='GR400';end if;
   reward_key:=case when action='connection-reward' then 'connection:'||target else 'touch:'||week_start end;
   if (result#>>'{community,balance}')::integer+payout>1000000 then raise exception 'Balance limit reached' using errcode='GR400';end if;
   insert into garden_private.ledger(owner,key,amount) values(actor,reward_key,payout);
   update garden_private.wallets set balance=balance+payout,revision=revision+1 where owner=actor;
   insert into garden_private.receipts(owner,request_id,command) values(actor,request,command_in);
   result:=garden_private.account_v1(null);
  end if;
 else result:=garden_private.account_v1(command_in);
 end if;
 select count(*) into connection_count from garden_private.ledger where owner=actor and key like 'connection:%' and created_at>=week_instant;
 select exists(select 1 from garden_private.ledger where owner=actor and key='touch:'||week_start) into touch_claimed;
 select coalesce(jsonb_agg(substring(key from 7) order by key),'[]') into dates from garden_private.ledger
  where owner=actor and key like 'daily:%' and substring(key from 7)::date between week_start and week_start+6;
 return jsonb_set(result,'{rewards}',(result->'rewards')||jsonb_build_object('weekStart',week_start,'checkInDays',dates,
  'social',jsonb_build_object('connectionsClaimed',connection_count,
   'connectionAvailable',connection_count<2 and exists(select 1 from garden_private.social_candidates(actor,false)),
   'keepInTouchClaimed',touch_claimed,'keepInTouchAvailable',not touch_claimed and exists(select 1 from garden_private.social_candidates(actor,true)))));
end $$;
revoke all on function public.garden_account(jsonb) from public,anon;
grant execute on function public.garden_account(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
