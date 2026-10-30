import { createHash } from 'node:crypto'
import { seedIdentity, seedMarker } from './plan.js'
import { DevelopmentAnchorSchema,type DevelopmentAnchor } from './development.js'

export const scenarioMarker = 'pebble-local-scenarios-v1'
function stableId(key: string) {
  const bytes = createHash('sha256').update(`${scenarioMarker}:${key}`).digest().subarray(0, 16)
  bytes[6] = (bytes[6] & 15) | 64
  bytes[8] = (bytes[8] & 63) | 128
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function scenarioPlan(count: number, development?:DevelopmentAnchor) {
  if (!Number.isInteger(count) || count < 6 || count > 100) throw new Error('Scenarios require 6–100 demo accounts')
  const primary=development?DevelopmentAnchorSchema.parse(development):null
  if(primary&&count<12)throw new Error('Development-account scenarios require 12–100 contacts')
  const plan={
    marker: scenarioMarker,
    users: Array.from({ length: count }, (_, index) => ({ index: index + 1, ...seedIdentity(index + 1) })),
    conversation: { first: 1, second: 2, messages: [
      { sender: 1, requestId: stableId('message:1'), body: '[DEMO] Hi! This conversation is here to test messaging.' },
      { sender: 2, requestId: stableId('message:2'), body: '[DEMO] Hello! Try replying, refreshing, and reopening this chat.' },
      { sender: 1, requestId: stableId('message:3'), body: '[DEMO] Read receipts and unread badges use the real messaging backend.' },
    ] },
    pending: { from: 3, to: 1 },
    friends: [5, 6],
    events: [
      { id: stableId('event:1'), externalId: 'campus-coffee', title: '[DEMO] Campus coffee and conversation', category: 'Demo social', hoursFromNow: 24, members: [1, 2, 3, 4] },
      { id: stableId('event:2'), externalId: 'board-games', title: '[DEMO] Board game afternoon', category: 'Demo games', hoursFromNow: 48, members: [3, 4, 5, 6] },
      { id: stableId('event:3'), externalId: 'study-break', title: '[DEMO] Study break walk', category: 'Demo outdoors', hoursFromNow: 72, members: [5, 6] },
    ],
  }
  const conversations=primary?Array.from({length:6},(_,i)=>({first:0,second:i+1,messages:[
    {sender:0,requestId:stableId(`${primary.id}:chat:${i+1}:1`),body:'[DEMO] Hi! This is a test conversation for the development account.'},
    {sender:i+1,requestId:stableId(`${primary.id}:chat:${i+1}:2`),body:`[DEMO] Hello from demo contact ${String(i+1).padStart(3,'0')}! You can message me here.`},
    {sender:i+1,requestId:stableId(`${primary.id}:chat:${i+1}:3`),body:'[DEMO] Try replying, checking unread badges, and reopening this chat.'},
  ]})): [plan.conversation]
  const pendingRequests=primary?[{from:7,to:0},{from:8,to:0},{from:0,to:9}]:[plan.pending]
  const friends=primary?plan.users.map(person=>person.index):plan.friends
  const groupPool=plan.users.filter(person=>person.index>=10).map(person=>person.index)
  const events=primary?plan.events.map((event,i)=>({...event,members:[0,...groupPool.filter((_,index)=>index%3===i)]})):plan.events
  return {...plan,primary,conversations,pendingRequests,friends,events,profileShowcase:primary?[10,11,12]:[4,5,6]}
}
export type DemoScenarios = ReturnType<typeof scenarioPlan>

const literal = (value: unknown) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`
const actor = (id: string) => `perform set_config('request.jwt.claim.sub','${id}',true);perform set_config('request.jwt.claims','{"sub":"${id}","role":"authenticated"}',true);`

export function scenarioSql(count: number, refreshEvents = false, development?:DevelopmentAnchor) {
  const plan = scenarioPlan(count,development)
  const identity = (index: number) => index===0?plan.primary!.id:plan.users[index - 1].id
  let sql = `\\set ON_ERROR_STOP on
begin;
set local lock_timeout='5s';set local statement_timeout='60s';
do $guard$ declare person jsonb;event jsonb;begin
 if current_database()<>'postgres' or current_user<>'postgres' or to_regprocedure('public.social_send(uuid,text,uuid)') is null or to_regprocedure('public.join_event_group_queue(uuid)') is null then raise exception 'Local scenario prerequisites missing';end if;
 ${plan.primary?`if not exists(select 1 from auth.users u join public.profiles p on p.id=u.id where u.id='${plan.primary.id}' and u.email=${literal(plan.primary.email)}#>>'{}' and u.raw_app_meta_data->'pebble_development'='true'::jsonb and not u.is_anonymous and p.username=${literal(plan.primary.username)}#>>'{}') then raise exception 'Dedicated development account not owned';end if;`:''}
 for person in select value from jsonb_array_elements(${literal(plan.users)}) loop
  if not exists(select 1 from auth.users u join public.profiles p on p.id=u.id where u.id=(person->>'id')::uuid and u.email=person->>'email' and u.raw_app_meta_data->>'pebble_demo_seed'='${seedMarker}' and u.is_anonymous is false and p.username=person->>'username') then raise exception 'Scenario account not owned by seeder';end if;
 end loop;
 for event in select value from jsonb_array_elements(${literal(plan.events)}) loop
  if exists(select 1 from public.listings l where (l.id=(event->>'id')::uuid and (l.source<>'${scenarioMarker}' or l.external_id<>event->>'externalId')) or (l.source='${scenarioMarker}' and l.external_id=event->>'externalId' and l.id<>(event->>'id')::uuid)) then raise exception 'Scenario event identity collision';end if;
 end loop;
end $guard$;
do $events$ declare event jsonb;begin
 for event in select value from jsonb_array_elements(${literal(plan.events)}) loop
  insert into public.listings(id,listing_type,title,description,category,starts_at,ends_at,location_name,source,external_id,status,last_synced_at)
  values((event->>'id')::uuid,'event',event->>'title','Fictional local testing event. No real gathering, attendance, or group chat is implied.',event->>'category',statement_timestamp()+make_interval(hours=>(event->>'hoursFromNow')::int),statement_timestamp()+make_interval(hours=>(event->>'hoursFromNow')::int+2),'Stony Brook University (demo event)','${scenarioMarker}',event->>'externalId','active',statement_timestamp())
  on conflict(source,external_id) do nothing;
  if ${refreshEvents ? 'true' : 'false'} then
   update public.listings set starts_at=statement_timestamp()+make_interval(hours=>(event->>'hoursFromNow')::int),ends_at=statement_timestamp()+make_interval(hours=>(event->>'hoursFromNow')::int+2),status='active',last_synced_at=statement_timestamp()
   where id=(event->>'id')::uuid and source='${scenarioMarker}' and (starts_at<=statement_timestamp() or status not in('active','rescheduled'));
  end if;
  if not exists(select 1 from public.listings where id=(event->>'id')::uuid and status in('active','rescheduled') and starts_at>statement_timestamp()) then raise exception 'Demo event expired/cancelled; use --refresh-events to renew owned fixtures';end if;
 end loop;
end $events$;
set local role authenticated;
`
  for(const conversation of plan.conversations)sql+=`do $conversation$ declare state jsonb;chat uuid;saved jsonb;begin
 ${actor(identity(conversation.first))}
 state:=public.social_connection('${identity(conversation.second)}','get');
 if state->>'status'='none' then perform public.social_connection('${identity(conversation.second)}','request');end if;
 ${actor(identity(conversation.second))}
 state:=public.social_connection('${identity(conversation.first)}','get');
 if state->>'status'='incoming' then state:=public.social_connection('${identity(conversation.first)}','accept');end if;
 if state->>'status' is distinct from 'connected' then raise exception 'Fixture connection cannot be confirmed';end if;
 chat:=(state->>'conversationId')::uuid;
 ${conversation.messages.map(message => `${actor(identity(message.sender))}
 saved:=public.social_send(chat,${literal(message.body)}#>>'{}','${message.requestId}');
 if saved->>'conversation_id' is distinct from chat::text then raise exception 'Fixture message readback failed';end if;`).join('\n')}
end $conversation$;
`
  for(const pending of plan.pendingRequests)sql+=`do $request$ begin ${actor(identity(pending.from))} if public.social_connection('${identity(pending.to)}','get')->>'status'='none' then perform public.social_connection('${identity(pending.to)}','request');end if;end $request$;\n`
  for (const index of plan.friends) sql += `do $friends$ begin ${actor(identity(index))} if public.get_friends_runtime()->>'canJoin' is distinct from 'true' then raise exception 'Fixture Friends preferences not ready';end if;perform public.join_queue('matchmaking');end $friends$;\n`
  for (const event of plan.events) for (const index of event.members) sql += `do $company$ declare snapshot jsonb;begin ${actor(identity(index))} snapshot:=public.join_event_group_queue('${event.id}');if snapshot->>'state' not in('waiting','proposal') then raise exception 'Fixture event queue readback failed';end if;end $company$;\n`
  return sql + `reset role;
commit;
`
}
