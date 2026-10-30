import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { execFileSync,spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createClient,type SupabaseClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { demoPlan,developmentDemoPlan,seedContainer,seedMarker } from './demo-seed/plan.js'
import { seedSql } from './demo-seed/sql.js'
import { scenarioPlan,scenarioSql } from './demo-seed/scenarios.js'
import { eventQueueSql } from './demo-seed/event.js'
import { DevelopmentAnchorSchema,type DevelopmentAnchor } from './demo-seed/development.js'
import { readDevelopmentCredentials } from '../dev/development-login.js'
import { AccountSchema } from '../shared/account.js'
const url='http://127.0.0.1:54321'
const options=parseArgs({options:{count:{type:'string'},scenarios:{type:'boolean'},'for-development-account':{type:'boolean'},'refresh-events':{type:'boolean'},'dry-run':{type:'boolean'},'reset-profiles':{type:'boolean'},'password-stdin':{type:'boolean'},'no-photos':{type:'boolean'},'reset-passwords':{type:'boolean'},'refresh-location':{type:'boolean'}},args:process.argv.slice(2).filter(value=>value!=='--')}).values
const forDevelopment=!!options['for-development-account']
if(forDevelopment&&(!options.scenarios||options['reset-passwords']||options['password-stdin']))throw new Error('Development-account mode requires --scenarios and preserves fixture passwords; use demo:seed separately to choose fixture passwords')
const plan=(forDevelopment?developmentDemoPlan:demoPlan)(Number(options.count??(forDevelopment?'60':options.scenarios?'12':'50')))
let scenarios=options.scenarios?scenarioPlan(plan.length,forDevelopment?{id:'d0000000-0000-4000-8000-000000000000',email:'development@example.test',username:'development'}:undefined):null
if(options['refresh-events']&&!scenarios)throw new Error('--refresh-events requires --scenarios')
async function passwordInput(){
 if(options['password-stdin']){
  let value='';for await(const chunk of process.stdin){value+=chunk;if(value.length>256)throw new Error('Password input too long')}
  return value.replace(/\r?\n$/,'')
 }
 if(!process.stdin.isTTY)throw new Error('Use a terminal for the hidden password prompt, or --password-stdin')
 process.stdout.write('Choose the shared demo password (8–128 characters; hidden): ')
 process.stdin.setRawMode(true);process.stdin.resume()
 return new Promise<string>((resolve,reject)=>{
  let value=''
  function finish(error?:Error){process.stdin.setRawMode(false);process.stdin.pause();process.stdin.off('data',read);process.stdout.write('\n');if(error)reject(error);else resolve(value)}
  function read(chunk:Buffer){for(const character of chunk.toString()){
   if(character==='\u0003'){finish(new Error('Cancelled'));return}
   if(character==='\r'||character==='\n'){finish();return}
   if(character==='\u007f'||character==='\b')value=Array.from(value).slice(0,-1).join('')
   else if(character>=' ')value+=character
   if(value.length>128){finish(new Error('Password too long'));return}
  }}
  process.stdin.on('data',read)
 })
}
const pg=(sql:string,user='postgres')=>{
 const result=spawnSync('docker',['exec','-i',seedContainer,'psql','-X','-qAt','-U',user,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-d','postgres'],{input:sql,encoding:'utf8',maxBuffer:2*1024*1024})
 if(result.status!==0){const code=result.stderr?.match(/ERROR:\s+([A-Z0-9]{5}):/)?.[1];throw new Error(`Local demo SQL rejected${code?` (${code})`:''}; transaction rolled back. Review schema, location expiry or existing demo edits.`)}
 return result.stdout
}
async function main(){
 if(options['dry-run']){
  console.log(`Preview only: ${plan.length} fictional profiles; no Auth, database, keys or network accessed.`)
  console.table(plan.slice(0,8).map(p=>({email:p.email,name:p.account.profile!.display_name,age:p.age,interests:p.account.profile!.interests.join(', '),gender:p.dating.gender,sexuality:p.dating.sexuality})))
  console.log(`Ages ${Math.min(...plan.map(p=>p.age))}–${Math.max(...plan.map(p=>p.age))}; shared schedules/interests vary; ${Math.floor(plan.length/2)} compatible planned pairs.`)
  if(scenarios){
   console.log(forDevelopment?`Development login: 6 message contacts, 18 sample messages, 2 incoming requests, 1 outgoing request, ${plan.length} queued Friends/discovery profiles and 3 shared event queues.`:'Scenarios: 001 ↔ 002 connected chat with 3 messages; 003 → 001 pending request; 005/006 Friends queue; all demo users opted into Dating.')
   console.table(scenarios.events.map(event=>({event:event.title,queuedUsers:event.members.length,includesDevelopment:event.members.includes(0),path:`/events/${event.id}`})))
   console.log('Existing seed-owned edits/history remain. Expired demo events require --refresh-events. Event worker/scoring stays unchanged.')
   if(forDevelopment)console.log('Uses the fixed private development-account file at runtime. An empty Dating persona gets fictional Man/Straight test defaults. Existing identity/profile choices and passwords are preserved.')
   if(forDevelopment)console.log('Also queues up to 17 labeled contacts for every future active event, including regular SBU events. Your own event participation stays unchanged.')
  }
  if(options['refresh-location'])console.log('A real run renews the existing reviewed Stony Brook campus-area catalogue entry for seven days.')
  return
 }
 const metadata=JSON.parse(execFileSync('docker',['inspect','--format','{"running":{{json .State.Running}},"project":{{json (index .Config.Labels "com.supabase.cli.project")}}}',seedContainer],{encoding:'utf8',stdio:['ignore','pipe','pipe']}))
 if(!metadata.running||metadata.project!=='meet-people')throw new Error('Expected running local meet-people Supabase container; no remote target is supported')
 let status:Record<string,string>
 try{status=JSON.parse(execFileSync('pnpm',['exec','supabase','status','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:131072}))}catch{throw new Error('Local Supabase runtime configuration unavailable; no keys printed')}
 const target=new URL(status.API_URL)
 if(target.protocol!=='http:'||!['127.0.0.1','localhost'].includes(target.hostname)||target.port!=='54321'||target.username||target.password||!status.SERVICE_ROLE_KEY||!status.ANON_KEY)throw new Error('Refusing nonlocal or incomplete Supabase configuration')
 if(options['refresh-location'])pg(readFileSync(new URL('../docs/stony-brook-demo-location.sql',import.meta.url),'utf8'),'supabase_admin')
 // Check safety prerequisites BEFORE creating any Auth fixtures.
 pg(`begin read only;do $$ begin if to_regprocedure('public.get_dating_runtime()') is null or to_regprocedure('public.get_friends_runtime()') is null or not exists(select 1 from location_private.places where id='b641ad29-9f92-4e66-9490-0b616f8fd85c' and enabled and verified_until>statement_timestamp()+interval '1 hour') then raise exception 'Local demo prerequisites missing/expired';end if;end $$;rollback;`)
 const password=forDevelopment?randomBytes(32).toString('base64url')+'-Aa1!':await passwordInput();if(password.length<8||password.length>128)throw new Error('Use a password with8–128 characters')
 const boundedFetch:typeof fetch=(input,init)=>{
  const target=new URL(String(input));if(target.origin!==url||!['/auth/v1/','/rest/v1/rpc/'].some(prefix=>target.pathname.startsWith(prefix)))throw new Error('Nonlocal seed request refused')
  return fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(15000)})
 }
 const clientOptions={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:boundedFetch}}
 const admin=createClient(url,status.SERVICE_ROLE_KEY,clientOptions),actors:SupabaseClient[]=[]
 let primary: {anchor:DevelopmentAnchor;client:SupabaseClient}|undefined
 if(forDevelopment){
  let credentials:Awaited<ReturnType<typeof readDevelopmentCredentials>>
  try{credentials=await readDevelopmentCredentials()}catch{throw new Error('Private development-account credential file is unavailable or invalid')}
  if(credentials.url!==url)throw new Error('Dedicated development account must target the verified local Supabase origin')
  const owner=await admin.auth.admin.getUserById(credentials.accountId)
  if(owner.error||owner.data.user?.email!==credentials.email||owner.data.user.app_metadata.pebble_development!==true||owner.data.user.is_anonymous!==false)throw new Error('Dedicated development identity is not operator-owned; no credentials changed')
  const client=createClient(url,status.ANON_KEY,clientOptions),signed=await client.auth.signInWithPassword({email:credentials.email,password:credentials.password})
  if(signed.error||signed.data.user?.id!==credentials.accountId)throw new Error('Dedicated development authentication failed')
  const existing=await client.rpc('get_account'),account=AccountSchema.safeParse(existing.data)
  if(existing.error||!account.success||!account.data.profile||account.data.completed.length!==4)throw new Error('Dedicated development account must finish onboarding first')
  primary={anchor:DevelopmentAnchorSchema.parse({id:credentials.accountId,email:credentials.email,username:account.data.profile.username}),client}
  scenarios=scenarioPlan(plan.length,primary.anchor)
 }
 const photos=new Map<string,string>()
 console.log(`Preparing ${plan.length} marked fictional accounts on LOCAL Supabase only. Existing onboarded demo edits ${options['reset-profiles']?'will be reset':'will be preserved'}.`)
 for(const p of plan){
  const existing=await admin.auth.admin.getUserById(p.id)
  if(existing.error&&existing.error.status!==404)throw new Error(`Cannot inspect reserved demo identity ${p.index}`)
  if(existing.data.user){
   if(existing.data.user.email!==p.email||existing.data.user.app_metadata.pebble_demo_seed!==seedMarker||existing.data.user.is_anonymous!==false)throw new Error(`Reserved demo identity ${p.index} is not owned by this seeder; nothing will overwrite it`)
   if(options['reset-passwords']){const changed=await admin.auth.admin.updateUserById(p.id,{password});if(changed.error)throw new Error(`Demo password reset failed at ${p.index}`)}
  }else{
   const created=await admin.auth.admin.createUser({id:p.id,email:p.email,password,email_confirm:true,app_metadata:{pebble_demo_seed:seedMarker},user_metadata:{demo:true}})
   if(created.error||created.data.user?.id!==p.id)throw new Error(`Demo Auth creation failed at ${p.index}; existing identities are preserved. Rerun with the same password to resume.`)
  }
  if(!forDevelopment){
   const actor=createClient(url,status.ANON_KEY,clientOptions),signed=await actor.auth.signInWithPassword({email:p.email,password})
   if(signed.error||signed.data.user?.id!==p.id||signed.data.user.is_anonymous!==false)throw new Error(`Cannot sign in demo account ${p.index}; use its existing seed password. No password was overwritten.`)
   actors.push(actor)
  }
  if(!options['no-photos']){
   const initials=p.account.profile!.display_name.split(' ')[1].slice(0,2).toUpperCase(),color=['#dceacc','#dfcbbd','#d8e7e5','#efd9d7','#e5dfed'][p.index%5]
   const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="${color}"/><circle cx="128" cy="112" r="74" fill="#fafbf7"/><text x="128" y="130" text-anchor="middle" font-family="sans-serif" font-size="48" fill="#34583e">${initials}</text><text x="128" y="225" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#34583e">DEMO ${p.index}</text></svg>`
   photos.set(p.id,(await sharp(Buffer.from(svg)).jpeg({quality:80,progressive:false}).toBuffer()).toString('base64'))
  }
 }
 pg(seedSql(plan,photos,!!options['reset-profiles'],primary?.anchor))
 if(scenarios)pg(scenarioSql(plan.length,!!options['refresh-events'],primary?.anchor))
 if(primary){
  const events=JSON.parse(pg("select coalesce(jsonb_agg(id order by starts_at,id),'[]'::jsonb) from public.listings where listing_type='event' and status in('active','rescheduled') and starts_at>clock_timestamp();")) as string[]
  for(const id of events)pg(eventQueueSql(id,primary.anchor,Math.min(17,plan.length-9),false))
  console.log(`${events.length} future active event queues populated with labeled test contacts, including regular SBU events.`)
 }
 for(let i=0;i<actors.length;i++){
  const account=await actors[i].rpc('get_account'),friends=await actors[i].rpc('get_friends_runtime'),dating=await actors[i].rpc('get_dating_runtime')
  if(account.error||account.data?.completed?.length!==4||friends.error||friends.data?.canJoin!==true||dating.error||dating.data?.canStart!==true||dating.data?.aggregate?.profile?.enabled!==true)throw new Error(`Demo ${i+1} persisted readback failed; state may already be saved. Rerun to reconcile.`)
 }
 const observer=primary?.client??actors[0]
 const dating=await observer.rpc('find_dating_candidate',{excluded_in:[]})
 if(dating.error)throw new Error('Seed saved, but actual matcher verification failed; inspect local services')
 if(scenarios){
  for(const conversation of scenarios.conversations){
   const reader=primary?.client??actors[conversation.first-1]
   const first=await reader.rpc('social_connection',{target_in:plan[conversation.second-1].id,action_in:'get'})
   if(first.error||first.data?.status!=='connected'||!first.data.conversationId)throw new Error('Scenario connection readback failed')
   const history=await reader.rpc('social_history',{conversation_in:first.data.conversationId})
   if(history.error||history.data?.kind!=='direct')throw new Error('Scenario history readback failed')
  }
  console.log(primary?`Development account ready: 6 connected chats, 18 sample messages, 2 incoming requests, 1 outgoing request, ${plan.length} Friends/discovery profiles. Dating candidate readback: ${dating.data?.candidate?'found':'none; review existing filters'}.`:'Scenarios ready: accounts 001/002 have a connected chat with 3 sample messages; 003 requests 001; 005/006 are queued for Friends. Dating is enabled for all demo accounts.')
  for(const event of scenarios.events){
   const reader=primary?.client??actors[event.members[0]-1]
   const queue=await reader.rpc('get_event_group_queue',{listing_id_in:event.id})
   if(queue.error||!['waiting','proposal'].includes(queue.data?.state))throw new Error('Scenario event readback failed')
   console.log(`${event.title}: ${event.members.length} fixture attendees queued; /events/${event.id}`)
  }
  console.log('Event proposals require the existing worker. No worker/scoring configuration or group chats were created.')
 }else{
  console.log(`Ready: ${plan.length} onboarded demo accounts. New accounts are not queued; existing queue memberships are preserved. Dating opted in. Real Dating matcher readback: ${dating.data?.candidate?'candidate found':'no candidate'}.`)
  console.log('Run pnpm demo:queue --count 2 when ready to demo Friends. Matching still respects reciprocal filters and safety rules. No messages/requests created.')
 }
 console.log(primary?'Sign in as development user. Contacts 001–006 are in Messages; 007/008 have incoming requests; 009 has an outgoing request. All contacts have labeled profile details and demo avatars. Existing passwords unchanged; no credentials saved.':`Logins: ${plan[0].email} through ${plan.at(-1)!.email}; use the password you entered. Fictional labelled avatars ${options['no-photos']?'omitted':'included'}. No credentials saved.`)
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Local demo seeding failed; no secrets printed');process.exitCode=1})
