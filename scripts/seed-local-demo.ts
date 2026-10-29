import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { execFileSync,spawnSync } from 'node:child_process'
import { createClient,type SupabaseClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { demoPlan,seedContainer,seedMarker } from './demo-seed/plan.js'
import { seedSql } from './demo-seed/sql.js'
const url='http://127.0.0.1:54321'
const options=parseArgs({options:{count:{type:'string',default:'50'},'dry-run':{type:'boolean'},'reset-profiles':{type:'boolean'},'password-stdin':{type:'boolean'},'no-photos':{type:'boolean'},'reset-passwords':{type:'boolean'},'refresh-location':{type:'boolean'}},args:process.argv.slice(2).filter(value=>value!=='--')}).values
const plan=demoPlan(Number(options.count))
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
const pg=(sql:string)=>{
 const result=spawnSync('docker',['exec','-i',seedContainer,'psql','-X','-qAt','-U','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-d','postgres'],{input:sql,encoding:'utf8',maxBuffer:2*1024*1024})
 if(result.status!==0){const code=result.stderr?.match(/ERROR:\s+([A-Z0-9]{5}):/)?.[1];throw new Error(`Local demo SQL rejected${code?` (${code})`:''}; transaction rolled back. Review schema, location expiry or existing demo edits.`)}
 return result.stdout
}
async function main(){
 if(options['dry-run']){
  console.log(`Preview only: ${plan.length} fictional profiles; no Auth, database, keys or network accessed.`)
  console.table(plan.slice(0,8).map(p=>({email:p.email,name:p.account.profile!.display_name,age:p.age,interests:p.account.profile!.interests.join(', '),gender:p.dating.gender,sexuality:p.dating.sexuality})))
  console.log(`Ages${Math.min(...plan.map(p=>p.age))}–${Math.max(...plan.map(p=>p.age))}; shared schedules/interests vary; ${plan.length/2} compatible planned pairs (for even counts).`);return
 }
 const metadata=JSON.parse(execFileSync('docker',['inspect','--format','{"running":{{json .State.Running}},"project":{{json (index .Config.Labels "com.supabase.cli.project")}}}',seedContainer],{encoding:'utf8',stdio:['ignore','pipe','pipe']}))
 if(!metadata.running||metadata.project!=='meet-people')throw new Error('Expected running local meet-people Supabase container; no remote target is supported')
 let status:Record<string,string>
 try{status=JSON.parse(execFileSync('pnpm',['exec','supabase','status','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:131072}))}catch{throw new Error('Local Supabase runtime configuration unavailable; no keys printed')}
 const target=new URL(status.API_URL)
 if(target.protocol!=='http:'||!['127.0.0.1','localhost'].includes(target.hostname)||target.port!=='54321'||target.username||target.password||!status.SERVICE_ROLE_KEY||!status.ANON_KEY)throw new Error('Refusing nonlocal or incomplete Supabase configuration')
 if(options['refresh-location'])pg(readFileSync(new URL('../docs/stony-brook-demo-location.sql',import.meta.url),'utf8'))
 // Check safety prerequisites BEFORE creating any Auth fixtures.
 pg(`begin read only;do $$ begin if to_regprocedure('public.get_matching_scoring_settings()') is null or to_regprocedure('public.get_dating_runtime()') is null or to_regprocedure('public.get_friends_runtime()') is null or not exists(select 1 from location_private.places where id='b641ad29-9f92-4e66-9490-0b616f8fd85c' and enabled and verified_until>statement_timestamp()+interval '1 hour') then raise exception 'Local demo prerequisites missing/expired';end if;end $$;rollback;`)
 const password=await passwordInput();if(password.length<8||password.length>128)throw new Error('Use a password with8–128 characters')
 const boundedFetch:typeof fetch=(input,init)=>{
  const target=new URL(String(input));if(target.origin!==url||!['/auth/v1/','/rest/v1/rpc/'].some(prefix=>target.pathname.startsWith(prefix)))throw new Error('Nonlocal seed request refused')
  return fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(15000)})
 }
 const clientOptions={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:boundedFetch}}
 const admin=createClient(url,status.SERVICE_ROLE_KEY,clientOptions),actors:SupabaseClient[]=[]
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
  const actor=createClient(url,status.ANON_KEY,clientOptions),signed=await actor.auth.signInWithPassword({email:p.email,password})
  if(signed.error||signed.data.user?.id!==p.id||signed.data.user.is_anonymous!==false)throw new Error(`Cannot sign in demo account ${p.index}; use its existing seed password. No password was overwritten.`)
  actors.push(actor)
  if(!options['no-photos']){
   const initials=p.account.profile!.display_name.split(' ')[1].slice(0,2).toUpperCase(),color=['#dceacc','#dfcbbd','#d8e7e5','#efd9d7','#e5dfed'][p.index%5]
   const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="${color}"/><circle cx="128" cy="112" r="74" fill="#fafbf7"/><text x="128" y="130" text-anchor="middle" font-family="sans-serif" font-size="48" fill="#34583e">${initials}</text><text x="128" y="225" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#34583e">DEMO ${p.index}</text></svg>`
   photos.set(p.id,(await sharp(Buffer.from(svg)).jpeg({quality:80,progressive:false}).toBuffer()).toString('base64'))
  }
 }
 pg(seedSql(plan,photos,!!options['reset-profiles']))
 for(let i=0;i<actors.length;i++){
  const account=await actors[i].rpc('get_account'),friends=await actors[i].rpc('get_friends_runtime'),dating=await actors[i].rpc('get_dating_runtime')
  if(account.error||account.data?.completed?.length!==4||friends.error||friends.data?.canJoin!==true||dating.error||dating.data?.canStart!==true||dating.data?.aggregate?.profile?.enabled!==true)throw new Error(`Demo ${i+1} persisted readback failed; state may already be saved. Rerun to reconcile.`)
 }
 const dating=await actors[0].rpc('find_dating_candidate',{excluded_in:[]})
 if(dating.error)throw new Error('Seed saved, but actual matcher verification failed; inspect local services')
 console.log(`Ready: ${plan.length} onboarded demo accounts. New accounts are not queued; existing queue memberships are preserved. Dating opted in. Real Dating matcher readback: ${dating.data?.candidate?'candidate found':'no candidate'}.`)
 console.log('Passive Friends and Dating need no queue. For Messages groups: pnpm demo:active --count 3 --enable-active, then pnpm matchmaking:active:once. Each member must accept their proposal.')
 console.log(`Logins: ${plan[0].email} through ${plan.at(-1)!.email}; use the password you entered. Fictional labelled avatars ${options['no-photos']?'omitted':'included'}. No messages/requests/rewards created; no credentials saved.`)
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Local demo seeding failed; no secrets printed');process.exitCode=1})
