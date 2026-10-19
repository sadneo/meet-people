import { seedIdentity,seedMarker } from './plan.js'
export function queueSelection(count=2,start=1){
 if(!Number.isInteger(count)||count<1||count>100||!Number.isInteger(start)||start<1||start+count-1>100)throw new Error('Select 1–100 accounts within demo indices 1–100')
 return Array.from({length:count},(_,i)=>seedIdentity(start+i))
}
export function queueSql(count=2,start=1,leave=false){
 const selected=queueSelection(count,start)
 return `begin;
set local lock_timeout='5s';set local statement_timeout='30s';
do $$ begin if current_database()<>'postgres' or current_user<>'postgres' then raise exception 'Local operator required';end if;end $$;
${selected.map(p=>`reset role;
do $$ begin if not exists(select 1 from auth.users where id='${p.id}' and email='${p.email}' and raw_app_meta_data->>'pebble_demo_seed'='${seedMarker}' and is_anonymous is false) then raise exception 'Seed-owned demo account missing; run demo:seed first';end if;end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','${p.id}',true) is not null;
select set_config('request.jwt.claims','{"sub":"${p.id}","role":"authenticated"}',true) is not null;
do $$ begin
 if public.get_account()->'profile'->>'username' is distinct from '${p.username}' then raise exception 'Demo profile identity changed';end if;
 ${leave?"perform public.leave_queue();":"if public.get_friends_runtime()->>'canJoin' is distinct from 'true' then raise exception 'Demo Friends preferences/location not ready; review and rerun demo:seed';end if;perform public.join_queue('matchmaking');"}
 if not exists(select 1 from public.get_queue_status() s where ${leave?"s.my_queue is null":"s.my_queue='matchmaking'"}) then raise exception 'Queue readback failed';end if;
end $$;`).join('\n')}
reset role;
commit;
`
}
