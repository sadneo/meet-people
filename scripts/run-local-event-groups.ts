import { constants } from 'node:fs'
import { mkdir,open,readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomBytes,randomUUID } from 'node:crypto'
import { execFileSync,spawnSync } from 'node:child_process'
import { parseArgs } from 'node:util'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { createEventGroupWorkerTransport,runEventGroupCycle } from '../api/event-group-worker.js'
import { readDevelopmentCredentials } from '../dev/development-login.js'
import { seedContainer } from './demo-seed/plan.js'

const flags=parseArgs({options:{setup:{type:'boolean'},watch:{type:'boolean'}}}).values
const origin='http://127.0.0.1:54321',workerId='local-interest-worker'
const Credentials=z.object({id:z.uuid(),email:z.email(),password:z.string().min(16).max(128)}).strict()
let running=true
process.on('SIGINT',()=>{running=false});process.on('SIGTERM',()=>{running=false})
function sql(source:string){
 const result=spawnSync('docker',['exec','-i',seedContainer,'psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:source,encoding:'utf8',maxBuffer:131072})
 if(result.status!==0)throw new Error('Local worker SQL rejected; no scoring retry attempted')
 return result.stdout.trim()
}
async function credentials(){
 const directory=join(homedir(),'.local/share/pebble'),path=join(directory,'event-group-worker.json')
 let file
 try{file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK)}catch(error){
  if(!flags.setup||(error as NodeJS.ErrnoException).code!=='ENOENT')throw new Error('Private local worker credentials unavailable; run with --setup',{cause:error})
  const value=Credentials.parse({id:randomUUID(),email:`pebble-group-worker-${randomUUID().slice(0,8)}@example.test`,password:randomBytes(32).toString('base64url')})
  await mkdir(directory,{recursive:true,mode:0o700})
  const created=await open(path,'wx',0o600);try{await created.writeFile(JSON.stringify(value)+'\n')}finally{await created.close()}
  return value
 }
 try{const stat=await file.stat();if(!stat.isFile()||stat.uid!==process.getuid?.()||(stat.mode&0o7777)!==0o600||stat.size>4096)throw new Error('Invalid local worker credential file');const buffer=Buffer.alloc(4097);const result=await file.read(buffer,0,buffer.length,0);return Credentials.parse(JSON.parse(buffer.subarray(0,result.bytesRead).toString()))}finally{await file.close()}
}
async function main(){
 const metadata=JSON.parse(execFileSync('docker',['inspect','--format','{"running":{{json .State.Running}},"project":{{json (index .Config.Labels "com.supabase.cli.project")}}}',seedContainer],{encoding:'utf8',stdio:['ignore','pipe','pipe']}))
 if(!metadata.running||metadata.project!=='meet-people')throw new Error('Local meet-people Supabase is required')
 const status=JSON.parse(execFileSync('pnpm',['exec','supabase','status','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:131072}))
 if(new URL(status.API_URL).origin!==origin||!status.ANON_KEY||!status.SERVICE_ROLE_KEY)throw new Error('Verified local runtime configuration required')
 const boundedFetch:typeof fetch=(input,init)=>{if(new URL(String(input)).origin!==origin)throw new Error('Worker refused a nonlocal request');return fetch(input,{...init,redirect:'error',signal:init?.signal??AbortSignal.timeout(15000)})}
 const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:boundedFetch}}
 const stored=await credentials(),admin=createClient(origin,status.SERVICE_ROLE_KEY,options)
 const existing=await admin.auth.admin.getUserById(stored.id)
 if(existing.data.user){if(existing.data.user.email!==stored.email||existing.data.user.app_metadata.pebble_local_group_worker!==true)throw new Error('Worker identity is not owned by this local tool')}
 else{if(!flags.setup||existing.error?.status!==404)throw new Error('Local worker identity unavailable');const created=await admin.auth.admin.createUser({id:stored.id,email:stored.email,password:stored.password,email_confirm:true,app_metadata:{pebble_local_group_worker:true}});if(created.error||created.data.user?.id!==stored.id)throw new Error('Local worker creation failed')}
 if(flags.setup){
  const migration=await readFile(new URL('../supabase/schema-sources/local-event-group-matching.sql',import.meta.url),'utf8')
  sql(migration)
  sql(`begin;do $$ begin if not exists(select 1 from auth.users where id='${stored.id}' and raw_app_meta_data->'pebble_local_group_worker'='true'::jsonb) then raise exception 'Worker ownership changed';end if;end $$;insert into event_group_private.workers(actor_id,worker_id,enabled) values('${stored.id}','${workerId}',true) on conflict(actor_id) do update set enabled=true where event_group_private.workers.worker_id='${workerId}';update event_group_private.settings set scoring_enabled=true where singleton;commit;`)
 }
 if(sql("select position('pebble-local-group-rank-v1' in prosrc)>0 from pg_proc where oid='event_group_private.isolated_rank(uuid)'::regprocedure;")!=='t')throw new Error('Local matching policy is not installed; run with --setup')
 const client=createClient(origin,status.ANON_KEY,options)
 let focus:string|undefined
 try{focus=(await readDevelopmentCredentials()).accountId}catch{/* General queued users can still be processed. */}
 console.log('Local event-group worker active: shared interests, weekly overlap, no external scoring.')
 let token='',expiresAt=0,firstCycle=true
 do{
  if(Date.now()>=expiresAt){
   const signed=await client.auth.signInWithPassword({email:stored.email,password:stored.password})
   if(signed.error||signed.data.user?.id!==stored.id||signed.data.user.is_anonymous!==false||!signed.data.session)throw new Error('Local worker authentication failed')
   token=signed.data.session.access_token;expiresAt=((signed.data.session.expires_at??Math.floor(Date.now()/1000)+signed.data.session.expires_in)-60)*1000
  }
  const base=await createEventGroupWorkerTransport({url:origin,publicKey:status.ANON_KEY,workerJwt:token,fetch:boundedFetch},{enabled:true,scoringEnabled:true})
  const scoped=(anchor?:string)=>({...base,claim:async(label:string,seconds:number)=>{const result=await client.rpc('claim_local_event_group_job',{worker_id:label,lease_seconds:seconds,anchor_id_in:anchor??null}).abortSignal(AbortSignal.timeout(15000)).retry(false);if(result.error)throw new Error('Local claim failed');return result.data}})
  const settings={enabled:true,scoringEnabled:true,workerId,maxJobs:5,timeoutMs:15000,leaseSeconds:120}
  // Process the development account's pending enrollments before the general
  // queue, preserving the original FIFO claim behavior inside each scope.
  const personal=focus?await runEventGroupCycle(settings,async()=>scoped(focus)):{state:'idle',processed:0}
  if(personal.state==='uncertain')throw new Error('Worker stopped after uncertain development matching; inspect jobs before rejoining')
  const general=await runEventGroupCycle(settings,async()=>scoped())
  if(firstCycle||personal.processed+general.processed>0||!flags.watch)console.log(`Groups completed: ${personal.processed+general.processed}; state=${general.state}`)
  firstCycle=false
  if(general.state==='uncertain')throw new Error('Worker stopped after uncertain matching; no automatic replay')
  if(!flags.watch)break
  for(let i=0;i<10&&running;i++)await new Promise(resolve=>setTimeout(resolve,200))
 }while(running)
}
main().catch(()=>{console.error('Local group worker stopped. Check local setup or job state; no credentials printed and no scoring retry attempted.');process.exitCode=1})
