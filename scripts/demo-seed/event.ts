import { z } from 'zod'
import { seedIdentity,seedMarker } from './plan.js'
import { DevelopmentAnchorSchema,type DevelopmentAnchor } from './development.js'

const literal=(value:unknown)=>`'${JSON.stringify(value).replaceAll("'","''")}'::jsonb`

/** Queue marked fixtures for an event the development account already joined. */
export function eventQueueSql(eventId:string,development:DevelopmentAnchor,count=17,requireJoined=true){
 const id=z.uuid().parse(eventId),primary=DevelopmentAnchorSchema.parse(development)
 if(!Number.isInteger(count)||count<1||count>50)throw new Error('Choose 1–50 event test profiles')
 const pool=Array.from({length:91},(_,index)=>seedIdentity(index+10))
 return `begin;
set local lock_timeout='5s';set local statement_timeout='30s';
do $guard$ begin
 if current_database()<>'postgres' or current_user<>'postgres' then raise exception 'Verified local database required';end if;
 if not exists(select 1 from auth.users u join public.profiles p on p.id=u.id where u.id='${primary.id}' and u.email=${literal(primary.email)}#>>'{}' and u.raw_app_meta_data->'pebble_development'='true'::jsonb and not u.is_anonymous and p.username=${literal(primary.username)}#>>'{}') then raise exception 'Dedicated development account ownership changed';end if;
 perform 1 from public.listings where id='${id}' and listing_type='event' and status in('active','rescheduled') and starts_at>clock_timestamp() for update;
 if not found then raise exception 'Choose a future active event';end if;
 if ${requireJoined?'true':'false'} and not exists(select 1 from event_group_private.queue where listing_id='${id}' and actor_id='${primary.id}' and active) then raise exception 'Join this event as the development account first';end if;
end $guard$;
create temporary table pebble_event_demo_selected on commit drop as
 select u.id from jsonb_array_elements(${literal(pool)}) fixture
 join auth.users u on u.id=(fixture->>'id')::uuid and u.email=fixture->>'email'
 join public.profiles p on p.id=u.id and p.username=fixture->>'username'
 where u.raw_app_meta_data->>'pebble_demo_seed'='${seedMarker}' and u.is_anonymous is false
 and event_group_private.profile_valid(u.id) and public.safety_pair_allowed('${primary.id}',u.id)
 and not exists(select 1 from public.connections c where (c.user_a=u.id and c.user_b='${primary.id}') or (c.user_b=u.id and c.user_a='${primary.id}'))
 order by u.email limit ${count};
do $guard$ begin if (select count(*) from pebble_event_demo_selected)<>${count} then raise exception 'Not enough eligible owned fixtures; run demo:populate or use a smaller --count';end if;end $guard$;
grant select on pebble_event_demo_selected to authenticated;
set local role authenticated;
do $queue$ declare person record;snapshot jsonb;begin
 for person in select id from pebble_event_demo_selected order by id loop
  perform set_config('request.jwt.claim.sub',person.id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',person.id,'role','authenticated')::text,true);
  snapshot:=public.join_event_group_queue('${id}');
  if snapshot->>'state' not in('waiting','proposal') then raise exception 'Event queue readback failed';end if;
 end loop;
end $queue$;
reset role;
select jsonb_build_object('eventId',id,'title',title,'testProfiles',${count}) from public.listings where id='${id}';
commit;
`
}
