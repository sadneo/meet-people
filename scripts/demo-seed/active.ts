import { queueSelection } from './queue.js'
import { seedMarker } from './plan.js'
export function activeDemoSql(count = 2, start = 1, action: 'join' | 'cancel' | 'status' | 'remove' = 'join', preferredNewFriends = 2, enable = false) {
 const selected = queueSelection(count, start)
 if (!['join','cancel','status','remove'].includes(action)) throw new Error('Unknown demo action')
 if (!Number.isInteger(preferredNewFriends) || preferredNewFriends < 1 || preferredNewFriends > 8) throw new Error('Preferred new friends must be 1–8')
 if (enable && action !== 'join') throw new Error('--enable-active is only valid when joining')
 // Validate the entire selection before any mutation. Never accept arbitrary IDs or URLs.
 const guard = selected.map(p => `if not exists(select 1 from auth.users where id='${p.id}' and email='${p.email}' and raw_app_meta_data->>'pebble_demo_seed'='${seedMarker}' and is_anonymous is false) then raise exception 'Seed-owned demo account missing or changed';end if;`).join('\n')
 return `begin;
set local lock_timeout='5s';set local statement_timeout='30s';
do $$ begin if current_user<>'postgres' or current_database()<>'postgres' then raise exception 'Local operator required';end if;
${guard}
end $$;
${enable ? 'update active_friends_private.policy set enabled=true;' : ''}
${action === 'remove' ? `delete from auth.users where id in (${selected.map(p=>`'${p.id}'`).join(',')});` : selected.map(p=>`reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','${p.id}',true) is not null;
select set_config('request.jwt.claims','{"sub":"${p.id}","role":"authenticated"}',true) is not null;
do $$ begin if public.get_account()->'profile'->>'username' is distinct from '${p.username}' then raise exception 'Demo profile identity changed';end if;end $$;
${action === 'status' ? 'select public.get_active_friends_status();' : `select public.active_friends_command(jsonb_build_object('action','${action}','requestId',gen_random_uuid(),'data',${action === 'cancel' ? "'{}'::jsonb" : `jsonb_build_object('preferredNewFriends',${preferredNewFriends},'minimumGroupSize',2,'maximumGroupSize',${preferredNewFriends+1},'allowExistingGroups',false)`}));`}`).join('\n')}
reset role;
commit;
`
}
