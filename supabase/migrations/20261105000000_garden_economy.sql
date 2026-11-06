-- Account-owned virtual currency. No client-supplied amounts, clocks, ownership or random draws.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
create schema garden_private;
revoke all on schema garden_private from public,anon,authenticated;
create table garden_private.catalog(id text primary key,cost integer not null check(cost>=0),movable boolean not null,geode boolean not null default false);
insert into garden_private.catalog(id,cost,movable,geode) values
 ('flowers',10,true,false),('bench',15,true,false),('lanterns',20,true,false),('picnic',25,true,false),
 ('bridge',30,true,false),('garden',40,true,false),('cafe',55,true,false),('stage',70,true,false),
 ('cottage',90,true,false),('hall',120,true,false),('garnet',300,true,false),('sapphire',300,true,false),('emerald',300,true,false),('citrine',300,true,false),
 ('river',80,false,false),('tree-cluster',60,false,false),('walkway',45,false,false),('flower-meadow',25,false,false),('shrubs',30,false,false),('rock-formation',35,false,false),('grass-detail',20,false,false),
 ('amethyst',0,true,true),('rose-quartz',0,true,true),('aquamarine',0,true,true),('pyrite',0,true,true);
create table garden_private.wallets(
 owner uuid primary key references auth.users(id) on delete cascade,
 balance integer not null default 300 check(balance between 0 and 1000000),
 revision integer not null default 0,
 owned jsonb not null default '[]', unlocks jsonb not null default '[]', positions jsonb not null default '{}', costs jsonb not null default '{}',
 undo jsonb not null default '[]', created_at timestamptz not null default now()
);
create table garden_private.ledger(
 owner uuid not null references garden_private.wallets(owner) on delete cascade,
 key text not null, amount integer not null, created_at timestamptz not null default now(), primary key(owner,key)
);
create table garden_private.receipts(
 owner uuid not null references garden_private.wallets(owner) on delete cascade,
 request_id uuid not null, command jsonb not null, created_at timestamptz not null default now(), primary key(owner,request_id)
);
alter table garden_private.wallets enable row level security;
alter table garden_private.ledger enable row level security;
alter table garden_private.receipts enable row level security;
alter table garden_private.catalog enable row level security;
revoke all on all tables in schema garden_private from public,anon,authenticated;

create or replace function public.garden_account(command_in jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); w garden_private.wallets; item garden_private.catalog;
 today date:=(statement_timestamp() at time zone 'UTC')::date;
 week_start date:=date_trunc('week',statement_timestamp() at time zone 'UTC')::date;
 action text:=command_in->>'action'; item_id text:=command_in->>'id'; req_id uuid;
 prior jsonb; snapshot jsonb; old_command jsonb; account_data jsonb; eligible boolean;
 days integer; before_balance integer; delta integer:=0; old_cost integer; new_cost integer;
 checked boolean; weekly boolean; profile_claimed boolean; choice text;
begin
 if actor is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in required' using errcode='28000'; end if;
 if not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then raise exception 'Confirmed account required' using errcode='42501'; end if;
 -- One row lock serializes initialization, claims, spending, undo and requests across devices.
 insert into garden_private.wallets(owner) values(actor) on conflict do nothing;
 select * into w from garden_private.wallets where owner=actor for update;
 insert into garden_private.ledger(owner,key,amount) values(actor,'welcome',300) on conflict do nothing;
 account_data:=public.get_account();
 eligible:=coalesce(account_data->'completed'='[0,1,2,3]'::jsonb,false);
 before_balance:=w.balance;
 if command_in is not null then
  if jsonb_typeof(command_in)<>'object' or not(command_in ?& array['action','requestId','revision'])
   or (command_in-array['action','requestId','revision','id','position'])<>'{}'::jsonb
   or action not in ('check-in','profile-reward','build','remove','geode','reset','move','undo')
   or jsonb_typeof(command_in->'revision')<>'number'
   or (command_in->>'revision') !~ '^[0-9]{1,9}$'
   or ((action in ('build','remove','move')) is distinct from (command_in ? 'id'))
   or ((action='move') is distinct from (command_in ? 'position'))
   then raise exception 'Invalid command' using errcode='22023'; end if;
  begin req_id:=(command_in->>'requestId')::uuid; exception when others then raise exception 'Invalid request' using errcode='22023'; end;
  if req_id is null or action is null then raise exception 'Invalid command' using errcode='22023'; end if;
  select command into old_command from garden_private.receipts where owner=actor and request_id=req_id;
  if found then
   if old_command<>command_in then raise exception 'Request reused' using errcode='GR409'; end if;
   action:=null; -- A retry returns CURRENT state, never replays an award/spend or stale snapshot.
  else
   if (command_in->>'revision')::integer<>w.revision then raise exception 'Stale garden' using errcode='GR409'; end if;
   if (select count(*) from garden_private.receipts where owner=actor and created_at>statement_timestamp()-interval '1 minute')>=60 then raise exception 'Slow down' using errcode='GR429'; end if;
  end if;
 end if;
 if action is not null then
  snapshot:=jsonb_build_object('owned',w.owned,'positions',w.positions,'costs',w.costs);
  if action='check-in' then
   insert into garden_private.ledger(owner,key,amount) values(actor,'daily:'||today,20) on conflict do nothing;
   if found then delta:=20; end if;
   select count(*) into days from garden_private.ledger where owner=actor and key like 'daily:%' and substring(key from 7)::date between week_start and week_start+6;
   if days>=5 then
    insert into garden_private.ledger(owner,key,amount) values(actor,'weekly:'||week_start,50) on conflict do nothing;
    if found then delta:=delta+50; end if;
   end if;
   w.balance:=w.balance+delta;
  elsif action='profile-reward' then
   if not eligible then raise exception 'Finish onboarding first' using errcode='GR400'; end if;
   insert into garden_private.ledger(owner,key,amount) values(actor,'profile',100) on conflict do nothing;
   if found then w.balance:=w.balance+100; end if;
  elsif action='build' then
   select * into item from garden_private.catalog where id=item_id;
   if not found or w.owned ? item_id or (item.geode and not(w.unlocks ? item_id)) or w.balance<item.cost then raise exception 'Cannot purchase' using errcode='GR400'; end if;
   w.balance:=w.balance-item.cost; w.owned:=w.owned||jsonb_build_array(item_id); w.costs:=w.costs||jsonb_build_object(item_id,item.cost);
  elsif action='remove' then
   if not(w.owned ? item_id) then raise exception 'Not placed' using errcode='GR400'; end if;
   w.balance:=w.balance+coalesce((w.costs->>item_id)::integer,0);
   w.owned:=w.owned-item_id; w.costs:=w.costs-item_id; w.positions:=w.positions-item_id;
  elsif action='geode' then
   if w.balance<300 then raise exception 'Insufficient Pebbles' using errcode='GR400'; end if;
   select id into choice from garden_private.catalog where geode and not(w.unlocks ? id) order by random() limit 1;
   if choice is null then raise exception 'All collected' using errcode='GR400'; end if;
   w.balance:=w.balance-300; w.unlocks:=w.unlocks||jsonb_build_array(choice); w.undo:='[]';
  elsif action='reset' then
   select coalesce(sum(value::integer),0) into old_cost from jsonb_each_text(w.costs);
   w.balance:=w.balance+old_cost; w.owned:='[]'; w.costs:='{}'; w.positions:='{}';
  elsif action='move' then
   if item_id<>'pebble' and not exists(select 1 from garden_private.catalog where id=item_id and movable and w.owned ? item_id) then raise exception 'Cannot move item' using errcode='GR400'; end if;
   if jsonb_typeof(command_in->'position') is distinct from 'object' or ((command_in->'position')-array['x','y'])<>'{}'::jsonb
    or jsonb_typeof(command_in#>'{position,x}') is distinct from 'number' or jsonb_typeof(command_in#>'{position,y}') is distinct from 'number' then raise exception 'Invalid position' using errcode='22023'; end if;
   if (command_in#>>'{position,x}')::numeric not between 0 and 1448 or (command_in#>>'{position,y}')::numeric not between 0 and 1086 then raise exception 'Invalid position' using errcode='22023'; end if;
   w.positions:=w.positions||jsonb_build_object(item_id,command_in->'position');
  elsif action='undo' then
   if jsonb_array_length(w.undo)=0 then raise exception 'Nothing to undo' using errcode='GR400'; end if;
   prior:=w.undo->-1; w.undo:=w.undo-(jsonb_array_length(w.undo)-1);
   select coalesce(sum(value::integer),0) into old_cost from jsonb_each_text(w.costs);
   select coalesce(sum(value::integer),0) into new_cost from jsonb_each_text(prior->'costs');
   if w.balance+old_cost<new_cost then raise exception 'Insufficient Pebbles' using errcode='GR400'; end if;
   -- Restore only a SERVER snapshot; earnings are never undone or minted from client state.
   w.balance:=w.balance+old_cost-new_cost; w.owned:=prior->'owned'; w.costs:=prior->'costs'; w.positions:=prior->'positions';
  end if;
  if action in ('build','remove','reset','move') and snapshot<>jsonb_build_object('owned',w.owned,'positions',w.positions,'costs',w.costs) then
   if jsonb_array_length(w.undo)>=20 then w.undo:=w.undo-0; end if;
   w.undo:=w.undo||jsonb_build_array(snapshot);
  end if;
  if w.balance>1000000 then raise exception 'Balance limit reached' using errcode='GR400'; end if;
  if action not in ('check-in','profile-reward') and w.balance<>before_balance then
   insert into garden_private.ledger(owner,key,amount) values(actor,'action:'||req_id,w.balance-before_balance);
  end if;
  insert into garden_private.receipts(owner,request_id,command) values(actor,req_id,command_in);
  w.revision:=w.revision+1;
  update garden_private.wallets set balance=w.balance,revision=w.revision,owned=w.owned,unlocks=w.unlocks,positions=w.positions,costs=w.costs,undo=w.undo where owner=actor;
 end if;
 select exists(select 1 from garden_private.ledger where owner=actor and key='daily:'||today),
  exists(select 1 from garden_private.ledger where owner=actor and key='weekly:'||week_start),
  exists(select 1 from garden_private.ledger where owner=actor and key='profile') into checked,weekly,profile_claimed;
 select count(*) into days from garden_private.ledger where owner=actor and key like 'daily:%' and substring(key from 7)::date between week_start and week_start+6;
 return jsonb_build_object('revision',w.revision,'canUndo',jsonb_array_length(w.undo)>0,
  'community',jsonb_build_object('balance',w.balance,'owned',w.owned,'positions',w.positions,'purchaseCosts',w.costs,'geodeUnlocks',w.unlocks,'earnedChapters','[]'::jsonb,'freshStart',true),
  'rewards',jsonb_build_object('day',today,'nextCheckIn',to_char(today+1,'YYYY-MM-DD')||'T00:00:00Z','checkedIn',checked,'weekDays',days,'weeklyBonus',weekly,'profileEligible',eligible,'profileClaimed',profile_claimed));
end $$;
revoke all on function public.garden_account(jsonb) from public,anon;
grant execute on function public.garden_account(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
