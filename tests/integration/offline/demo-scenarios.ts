/** Empty schema-only disposable DB; synthetic users only, no Auth service/keys. */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { demoPlan, developmentDemoPlan,onboardingChapters, seedContainer, seedMarker, campusId, campusLabel } from '../../../scripts/demo-seed/plan.js'
import { seedSql } from '../../../scripts/demo-seed/sql.js'
import { scenarioSql, scenarioMarker } from '../../../scripts/demo-seed/scenarios.js'
import { eventQueueSql } from '../../../scripts/demo-seed/event.js'

const database = `pebble_seed_scenarios_check_${Date.now()}`
const profiles = demoPlan(6)
const schemas = ['public','extensions','auth','safety_private','social_private','location_private','dating_private','photo_private','active_private','event_group_private']
function execute(args: string[], input?: string | Buffer) {
  const result = spawnSync('docker', args, { input, maxBuffer: 16 * 1024 * 1024 })
  assert.equal(result.status, 0, `Disposable operation failed; app database unchanged: ${result.stderr.toString().slice(-3000)}`)
  return result.stdout.toString().trim()
}
function sql(source: string) {
  assert.match(database, /^pebble_seed_scenarios_check_\d+$/)
  return execute(['exec','-i',seedContainer,'psql','-X','-qAt','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1'], source)
}
const bindTarget = (source: string) => {
  assert.equal(source.split("current_database()<>'postgres'").length, 2)
  return source.replace("current_database()<>'postgres'", `current_database()<>'${database}'`)
}
const literal = (value: unknown) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`
const actor = (index: number, body: string) => `set local role authenticated;select set_config('request.jwt.claim.sub','${profiles[index-1].id}',true) is not null;${body};reset role;`
let created = false
try {
  const metadata = JSON.parse(execFileSync('docker',['inspect','--format','{"running":{{json .State.Running}},"project":{{json (index .Config.Labels "com.supabase.cli.project")}}}',seedContainer],{encoding:'utf8',stdio:['ignore','pipe','pipe']}))
  assert.deepEqual(metadata,{running:true,project:'meet-people'})
  execute(['exec',seedContainer,'createdb','-U','postgres','-T','template0',database])
  created = true
  const snapshot = execFileSync('docker',['exec',seedContainer,'pg_dump','-U','postgres','-d','postgres','--schema-only','--format=custom',...schemas.map(schema=>`--schema=${schema}`)],{maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']})
  sql('drop schema public;')
  execute(['exec','-i',seedContainer,'pg_restore','-U','supabase_admin','-d',database,'--exit-on-error'],snapshot)
  // A schema-filtered pg_dump omits extension installation metadata.
  execute(['exec',seedContainer,'psql','-X','-qAt','-U','supabase_admin','-d',database,'-v','ON_ERROR_STOP=1','-c','create extension if not exists postgis with schema extensions;create extension if not exists pgcrypto with schema extensions;'])
  sql(`begin;do $$ begin if exists(select 1 from auth.users) or exists(select 1 from public.profiles) then raise exception 'Empty fixture required';end if;end $$;
  create or replace function public.get_gemini_embedding(interest_text text) returns double precision[] language plpgsql as $$ begin raise exception 'Offline fixture';end $$;
  insert into location_private.places(id,label,region,aliases,latitude,longitude,provenance,verified_until,enabled) values('${campusId}','${campusLabel}','Synthetic test fixture',array['${campusLabel}'],0,0,'Synthetic disposable test coordinates',statement_timestamp()+interval '2 days',true);
  ${profiles.map(profile=>`insert into auth.users(id,email,aud,role,is_anonymous,raw_app_meta_data) values('${profile.id}','${profile.email}','authenticated','authenticated',false,${literal({pebble_demo_seed:seedMarker})});`).join('\n')}
  commit;`)
  // Upgrade only the disposable UUID schema to alt-frontend's matching policy.
  // Provider I/O remains the raising stub; no running application data is copied.
  execFileSync('python',['scripts/prepare-local-demo-activation.py','--uuid-messaging','--matching-upgrade'],{stdio:['ignore','pipe','pipe']})
  sql(bindTarget(readFileSync(new URL('../../../worktree/safety-owner-review/local-uuid-matching-upgrade.sql',import.meta.url),'utf8')))
  sql(bindTarget(seedSql(profiles,new Map())))
  sql(bindTarget(scenarioSql(6)))
  const counts = () => JSON.parse(sql(`select json_build_object('connections',(select count(*) from public.connections),'messages',(select count(*) from public.messages),'events',(select count(*) from public.listings where source='${scenarioMarker}'),'eventQueues',(select count(*) from event_group_private.queue where active),'friendsQueues',(select count(*) from public.queue_entries));`))
  assert.deepEqual(counts(),{connections:2,messages:3,events:3,eventQueues:10,friendsQueues:2})
  sql(`begin;${actor(1,`do $$ declare state jsonb;history jsonb;begin state:=public.social_connection('${profiles[1].id}','get');assert state->>'status'='connected';history:=public.social_history((state->>'conversationId')::uuid);assert jsonb_array_length(history->'messages')=3;assert jsonb_array_length(public.social_connection_list()->'incoming')=1;end $$`)}
  ${actor(2,`do $$ begin assert public.social_activity()->>'unreadConversations'='1','Unread fixture missing';end $$`)}
  ${actor(5,`do $$ begin assert public.get_friends_runtime()->>'canJoin'='true';assert (select count(*) from public.get_queue_match())>=1;assert public.find_dating_candidate('[]')->'candidate'<>'null'::jsonb;end $$`)}commit;`)
  // Reruns retain exactly the same messages, events and memberships.
  sql(bindTarget(scenarioSql(6)))
  assert.deepEqual(counts(),{connections:2,messages:3,events:3,eventQueues:10,friendsQueues:2})
  sql(`begin;${actor(2,`do $$ begin assert public.social_activity()->>'unreadConversations'='1','Rerun changed read state';end $$`)}commit;`)
  // An unowned ID collision stops the whole scenario before any writes.
  sql(`update auth.users set raw_app_meta_data='{}' where id='${profiles[0].id}';`)
  const collision = spawnSync('docker',['exec','-i',seedContainer,'psql','-X','-qAt','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1'],{input:bindTarget(scenarioSql(6)),encoding:'utf8'})
  assert.notEqual(collision.status,0)
  assert.deepEqual(counts(),{connections:2,messages:3,events:3,eventQueues:10,friendsQueues:2})
  sql(`update auth.users set raw_app_meta_data=${literal({pebble_demo_seed:seedMarker})} where id='${profiles[0].id}';`)
  // Date renewal is explicit and restricted to this script's owned demo events.
  sql(`update public.listings set ends_at=statement_timestamp()-interval '1 hour',starts_at=statement_timestamp()-interval '3 hours' where source='${scenarioMarker}';`)
  const stale = spawnSync('docker',['exec','-i',seedContainer,'psql','-X','-qAt','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1'],{input:bindTarget(scenarioSql(6)),encoding:'utf8'})
  assert.notEqual(stale.status,0)
  sql(bindTarget(scenarioSql(6,true)))
  assert.equal(sql(`select count(*) from public.listings where source='${scenarioMarker}' and starts_at>statement_timestamp();`),'3')
  assert.deepEqual(counts(),{connections:2,messages:3,events:3,eventQueues:10,friendsQueues:2})
  assert.equal(sql("select tgenabled from pg_trigger where tgrelid='public.user_interests'::regclass and tgname='trg_user_interests_embed';"),'O')
  // The dedicated account is the hub; its own profile edits survive population.
  const pool=developmentDemoPlan(60)
  const primary={id:'d7300000-0000-4000-8000-000000000001',email:'development@example.test',username:'development_user'}
  const account=structuredClone(pool[0].account)
  account.profile={...account.profile!,username:primary.username,display_name:'Development User',birthdate:'2000-01-01',bio:'Owner edited development profile'}
  account.settings.discoverable=false
  sql(`begin;${pool.slice(6).map(profile=>`insert into auth.users(id,email,aud,role,is_anonymous,raw_app_meta_data) values('${profile.id}','${profile.email}','authenticated','authenticated',false,${literal({pebble_demo_seed:seedMarker})});`).join('\n')}
  insert into auth.users(id,email,aud,role,is_anonymous,raw_app_meta_data) values('${primary.id}','${primary.email}','authenticated','authenticated',false,'{"pebble_development":true}');
  set local role authenticated;select set_config('request.jwt.claim.sub','${primary.id}',true) is not null;
  ${onboardingChapters(account).map(chapter=>`select public.save_account(${literal(chapter)}) is not null;`).join('\n')}commit;`)
  const primaryProfile=()=>sql(`begin;set local role authenticated;select set_config('request.jwt.claim.sub','${primary.id}',true) is not null;select public.get_account()->'profile';commit;`).split('\n').find(line=>line.startsWith('{'))
  const before=primaryProfile()
  sql(bindTarget(seedSql(pool,new Map(),false,primary)))
  assert.equal(primaryProfile(),before)
  sql(bindTarget(scenarioSql(60,false,primary)))
  const expanded={connections:11,messages:21,events:3,eventQueues:64,friendsQueues:2}
  assert.deepEqual(counts(),expanded)
  sql(`begin;set local role authenticated;select set_config('request.jwt.claim.sub','${primary.id}',true) is not null;
  do $$ declare inbox jsonb;connections jsonb;candidate jsonb;begin
   inbox:=public.social_inbox();connections:=public.social_connection_list();candidate:=public.find_dating_candidate('[]')->'candidate';
   assert jsonb_array_length(inbox->'conversations')=6;
   assert public.social_activity()->>'unreadConversations'='6';
   assert jsonb_array_length(connections->'incoming')=2 and jsonb_array_length(connections->'sent')=1 and jsonb_array_length(connections->'connected')=6;
   assert candidate<>'null'::jsonb and candidate->>'bio' like 'Fictional local demo profile%';
   assert jsonb_array_length(public.project_friends_candidates('["${pool[9].id}"]')->'candidates')>=1;
  end $$;reset role;set local role service_role;select set_config('request.jwt.claim.role','service_role',true) is not null;
  do $$ begin assert jsonb_array_length(public.get_friends_scoring_pool('${primary.id}','[]')->'candidates')>=1;end $$;rollback;`)
  sql(bindTarget(scenarioSql(60,false,primary)))
  assert.deepEqual(counts(),expanded)
  assert.equal(primaryProfile(),before)
  sql(`begin;set local role authenticated;select set_config('request.jwt.claim.sub','${primary.id}',true) is not null;
  do $$ begin assert public.friends_discovery_connection('${pool[9].id}','request')->>'status'='sent';end $$;
  select set_config('request.jwt.claim.sub','${pool[9].id}',true) is not null;
  do $$ begin assert public.friends_discovery_connection('${primary.id}','accept')->>'status'='connected';end $$;
  select set_config('request.jwt.claim.sub','${primary.id}',true) is not null;
  do $$ begin assert exists(select 1 from jsonb_array_elements(public.social_inbox()->'conversations') chat where chat->>'mode'='friends');end $$;rollback;`)
  // The actual local worker protocol creates groups with a provider that raises
  // on every call. Ranking must therefore use persisted local data exclusively.
  sql(readFileSync(new URL('../../../supabase/schema-sources/local-event-group-matching.sql',import.meta.url),'utf8'))
  const worker='d7400000-0000-4000-8000-000000000001'
  sql(`begin;insert into auth.users(id,email,aud,role,is_anonymous) values('${worker}','local-worker@example.test','authenticated','authenticated',false);
  insert into event_group_private.workers(actor_id,worker_id,enabled) values('${worker}','synthetic-local-worker',true);
  insert into event_group_private.settings(singleton,scoring_enabled) values(true,true) on conflict(singleton) do update set scoring_enabled=true;commit;`)
  sql(`begin;set local role authenticated;select set_config('request.jwt.claim.sub','${worker}',true) is not null;
  do $$ declare job jsonb;ranked jsonb;members uuid[];result jsonb;begin
   for cycle in 1..3 loop
    job:=public.claim_local_event_group_job('synthetic-local-worker',120,'${primary.id}');assert job is not null,'Development job missing';
    ranked:=public.worker_rank_event_group((job->>'jobId')::uuid,(job->>'leaseToken')::uuid);
    assert jsonb_array_length(ranked) between 1 and 3,'Local ranking returned no valid peers';
    select array_prepend((job->>'anchorId')::uuid,array_agg((value->>'profile_id')::uuid order by ord)) into members from jsonb_array_elements(ranked) with ordinality ranked_row(value,ord);
    result:=public.complete_event_group_job((job->>'jobId')::uuid,(job->>'leaseToken')::uuid,members);assert result->>'state'='completed','Local completion failed';
   end loop;
  end $$;commit;`)
  sql(`begin;set local role authenticated;select set_config('request.jwt.claim.sub','${primary.id}',true) is not null;
  do $$ declare id uuid;snapshot jsonb;begin
   for id in select unnest(array['7052febe-1b9f-4bc9-9673-64c320e17e4d'::uuid,'d2c21ade-e316-421a-a5e2-34664da2d03a'::uuid,'8c607355-8093-4698-81ac-97d5609c4b24'::uuid]) loop
    snapshot:=public.get_event_group_queue(id);assert snapshot->>'state'='proposal';assert jsonb_array_length(snapshot->'proposal'->'members') between 2 and 4;
   end loop;
   begin perform public.claim_local_event_group_job('synthetic-local-worker',120,'${primary.id}');raise exception 'Unregistered actor claimed work';exception when insufficient_privilege then null;end;
  end $$;rollback;`)
  sql(`begin;set local role authenticated;select set_config('request.jwt.claim.sub','${worker}',true) is not null;
  do $$ begin assert public.claim_local_event_group_job('synthetic-local-worker',120,null) is null,'Fixtures must wait for a real user';end $$;rollback;`)
  // Regular imported events need their own peers; demo-event enrollments do not
  // carry across. Require the owner's join and retain imported listing fields.
  const regularEvent='d7500000-0000-4000-8000-000000000001'
  sql(`insert into public.listings(id,listing_type,title,starts_at,ends_at,source,external_id,status) values('${regularEvent}','event','Synthetic SBU event',statement_timestamp()+interval '1 day',statement_timestamp()+interval '2 days','synthetic-sbu','regular-event','active');`)
  const missingJoin=spawnSync('docker',['exec','-i',seedContainer,'psql','-X','-qAt','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1'],{input:bindTarget(eventQueueSql(regularEvent,primary)),encoding:'utf8'})
  assert.notEqual(missingJoin.status,0)
  assert.equal(sql(`select count(*) from event_group_private.queue where listing_id='${regularEvent}';`),'0')
  sql(bindTarget(eventQueueSql(regularEvent,primary,17,false)))
  assert.equal(sql(`select count(*) from event_group_private.queue where listing_id='${regularEvent}' and active and event_group_private.permit_available(attempt_permit);`),'17')
  assert.equal(sql(`select count(*) from event_group_private.queue where listing_id='${regularEvent}' and actor_id='${primary.id}';`),'0')
  sql(`begin;set local role authenticated;select set_config('request.jwt.claim.sub','${worker}',true) is not null;do $$ begin assert public.claim_local_event_group_job('synthetic-local-worker',120,null) is null,'Prepopulated peers consumed before user joined';end $$;rollback;`)
  sql(`begin;set local role authenticated;select set_config('request.jwt.claim.sub','${primary.id}',true) is not null;select public.join_event_group_queue('${regularEvent}') is not null;commit;`)
  const originalListing=sql(`select to_jsonb(l) from public.listings l where id='${regularEvent}';`)
  sql(bindTarget(eventQueueSql(regularEvent,primary)))
  sql(bindTarget(eventQueueSql(regularEvent,primary)))
  assert.equal(sql(`select to_jsonb(l) from public.listings l where id='${regularEvent}';`),originalListing)
  assert.equal(sql(`select count(*) from event_group_private.queue where listing_id='${regularEvent}' and active;`),'18')
  assert.equal(sql(`select count(*) from event_group_private.jobs where listing_id='${regularEvent}';`),'18')
  sql(`begin;set local role authenticated;select set_config('request.jwt.claim.sub','${worker}',true) is not null;
  do $$ declare job jsonb;ranked jsonb;members uuid[];result jsonb;begin
   job:=public.claim_local_event_group_job('synthetic-local-worker',120,'${primary.id}');assert job->>'eventId'='${regularEvent}';
   ranked:=public.worker_rank_event_group((job->>'jobId')::uuid,(job->>'leaseToken')::uuid);
   select array_prepend((job->>'anchorId')::uuid,array_agg((value->>'profile_id')::uuid order by ord)) into members from jsonb_array_elements(ranked) with ordinality ranked_row(value,ord);
   result:=public.complete_event_group_job((job->>'jobId')::uuid,(job->>'leaseToken')::uuid,members);assert result->>'state'='completed';
  end $$;select set_config('request.jwt.claim.sub','${primary.id}',true) is not null;
  do $$ declare snapshot jsonb;begin snapshot:=public.get_event_group_queue('${regularEvent}');assert snapshot->>'state'='proposal';assert jsonb_array_length(snapshot->'proposal'->'members')=4;end $$;commit;`)
  console.log('PASS regular event: 17 prepopulated peers remain available until owner joins, idempotent enrollments, unchanged imported listing and actual four-person group.')
  console.log('PASS local group worker: three actual groups for the development account, persisted members/notices, worker authorization and zero provider calls.')
  console.log('PASS development hub: 60 rich profiles, 6 conversations/18 messages, incoming/outgoing requests, 60 Friends peers, shared event queues, real Friends/Dating candidates, preserved profile and idempotent rerun.')
  console.log('PASS disposable population: 6 onboarded users, real Dating/Friends candidates, connected chat/3 messages, pending request, 3 demo events/10 enrollments, idempotent rerun, ownership collision rollback and explicit date renewal. No app data or credentials accessed.')
} finally {
  if (created) execute(['exec',seedContainer,'dropdb','-U','postgres',database])
}
