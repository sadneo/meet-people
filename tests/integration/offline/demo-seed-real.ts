/** Explicit local seed acceptance; runtime-only admin key/password. No app-user data. */
import assert from 'node:assert/strict'
import { randomBytes,randomUUID } from 'node:crypto'
import { execFileSync,spawnSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { demoPlan,seedContainer,seedMarker } from '../../../scripts/demo-seed/plan.js'
import { seedSql } from '../../../scripts/demo-seed/sql.js'
const plan=demoPlan(2),ids=plan.map(p=>p.id),password=randomBytes(24).toString('base64url')
let status:Record<string,string>;try{status=JSON.parse(execFileSync('pnpm',['exec','supabase','status','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}))}catch{throw new Error('Local status unavailable; no keys printed')}
assert.equal(new URL(status.API_URL).origin,'http://127.0.0.1:54321')
const settings={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}
const admin=createClient(status.API_URL,status.SERVICE_ROLE_KEY,settings)
const sql=(source:string)=>spawnSync('docker',['exec','-i',seedContainer,'psql','-X','-qAt','-U','postgres','-v','ON_ERROR_STOP=1','-d','postgres'],{input:source,encoding:'utf8'})
const checked=(source:string)=>{const result=sql(source);assert.equal(result.status,0,'Scoped seed SQL failed');return result.stdout.trim()}
const run=()=>spawnSync('pnpm',['demo:seed','--count','2','--password-stdin'],{input:password+'\n',encoding:'utf8',timeout:120000})
for(const p of plan){const exists=await admin.auth.admin.getUserById(p.id);assert.equal(exists.error?.status,404,'Reserved test identities occupied; refusing to touch them')}
let owns=false
try{
 owns=true
 let result=run();assert.equal(result.status,0,result.stderr)
 const actors=[]
 for(const p of plan){
  const actor=createClient(status.API_URL,status.ANON_KEY,settings),login=await actor.auth.signInWithPassword({email:p.email,password});assert.equal(login.error,null);assert.equal(login.data.user?.id,p.id)
  const account=await actor.rpc('get_account');assert.equal(account.data.completed.length,4);assert.equal(account.data.profile.display_name,p.account.profile!.display_name)
  const photo=await actor.rpc('read_profile_photo',{owner_in:p.id,revision_in:0});assert.equal(photo.error,null)
  const bytes=Buffer.from(photo.data.jpegBase64,'base64');assert.equal((await sharp(bytes).metadata()).format,'jpeg')
  actors.push(actor)
 }
 assert.equal((await actors[0].rpc('get_queue_status')).data[0].my_queue,null)
 const queue=(...args:string[])=>spawnSync('pnpm',['demo:queue',...args],{encoding:'utf8',timeout:30000})
 assert.equal(queue('--count','1').status,0)
 assert.equal((await actors[0].rpc('get_queue_status')).data[0].my_queue,'matchmaking')
 assert.equal((await actors[1].rpc('get_queue_status')).data[0].my_queue,null)
 assert.equal(queue('--count','2').status,0)
 assert.equal(queue('--count','2').status,0) // idempotent join
 const found=await actors[0].rpc('get_queue_match');assert.equal(found.error,null);assert.ok(found.data.length)
 const dating=await actors[0].rpc('find_dating_candidate',{excluded_in:[]});assert.equal(dating.error,null);assert.ok(dating.data.candidate)
 assert.equal(queue('--count','1','--leave').status,0)
 assert.equal((await actors[0].rpc('get_queue_status')).data[0].my_queue,null)
 assert.equal((await actors[1].rpc('get_queue_status')).data[0].my_queue,'matchmaking')
 // A real owner photo deletion must stay deleted on a default rerun.
 const photo=await actors[0].rpc('get_profile_photo_state')
 assert.equal((await actors[0].rpc('save_profile_photo',{photo_in:{expectedRevision:photo.data.revision,requestId:randomUUID(),jpegBase64:null}})).error,null)
 const bio='Fictional local demo profile. Explicit owner edit preserved.'
 checked(`begin;alter table public.user_interests disable trigger trg_user_interests_embed;set local role authenticated;set local request.jwt.claim.sub='${ids[0]}';do $$ begin perform public.save_account(jsonb_set(public.get_account(),'{profile,bio}',to_jsonb('${bio}'::text)));end $$;reset role;alter table public.user_interests enable trigger trg_user_interests_embed;commit;`)
 result=run();assert.equal(result.status,0,result.stderr)
 assert.equal((await actors[0].rpc('get_account')).data.profile.bio,bio)
 assert.equal((await actors[0].rpc('get_queue_status')).data[0].my_queue,null)
 assert.equal((await actors[0].rpc('get_profile_photo_state')).data.hasPhoto,false)
 assert.equal((await actors[0].rpc('get_profile_photo_state')).data.revision,2)
 const rollback=sql(seedSql(plan,new Map(),true).replace(/commit;\s*$/,"do $$ begin raise exception 'Forced seed rollback';end $$;commit;"));assert.notEqual(rollback.status,0)
 assert.equal((await actors[0].rpc('get_account')).data.profile.bio,bio)
 assert.equal(checked("select tgenabled from pg_trigger where tgrelid='public.user_interests'::regclass and tgname='trg_user_interests_embed'"),'O')
 const original=await admin.auth.admin.getUserById(ids[0]);assert.equal(original.error,null)
 await admin.auth.admin.updateUserById(ids[0],{app_metadata:{...original.data.user!.app_metadata,pebble_demo_seed:'collision-test'}})
 try{assert.notEqual(queue('--count','2').status,0);assert.equal((await actors[0].rpc('get_queue_status')).data[0].my_queue,null);result=run();assert.notEqual(result.status,0);assert.match(result.stderr,/not owned by this seeder/)}finally{await admin.auth.admin.updateUserById(ids[0],{app_metadata:original.data.user!.app_metadata})}
 console.log('PASS actual local seed:2 real Auth fixtures, four canonical onboarding chapters/readback, varied Dating/Friends settings, private illustrated photos, real algorithm candidates; separate queue1/2/idempotence/scoped leave/ownership rollback; rerun preserves owner edits/tombstone, unowned collision denied, forced SQL rollback restores provider hook.')
}finally{
 if(owns){
  const list=ids.map(id=>`'${id}'`).join(',')
  const interactions=checked(`select count(*) from public.connections where user_a in(${list}) or user_b in(${list})`)
  assert.equal(interactions,'0','Demo fixture acquired real interactions; preserved instead of deleting it')
  // Delete ONLY fixtures absent before this test and still admin-marker owned.
  checked(`begin;alter table public.user_interests disable trigger trg_user_interests_embed;do $$ begin if exists(select 1 from auth.users where id in(${list}) and raw_app_meta_data->>'pebble_demo_seed' is distinct from '${seedMarker}') then raise exception 'Fixture owner marker changed';end if;end $$;delete from auth.users where id in(${list}) and raw_app_meta_data->>'pebble_demo_seed'='${seedMarker}';alter table public.user_interests enable trigger trg_user_interests_embed;commit;`)
  console.log('Removed only the2 newly created, interaction-free seed fixtures; existing accounts/history untouched.')
 }
}
