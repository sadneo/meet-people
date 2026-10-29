// Real local Supabase Auth/PostgREST + Express, using only marked demo users.
import {execFileSync,spawn} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {createServer} from 'node:net'
import assert from 'node:assert/strict'
import process from 'node:process'
import console from 'node:console'
import {URL} from 'node:url'
import {setTimeout as delay} from 'node:timers/promises'
import {createClient} from '@supabase/supabase-js'
const status=JSON.parse(execFileSync('pnpm',['exec','supabase','status','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}))
assert.equal(new URL(status.API_URL).origin,'http://127.0.0.1:54321','Local Supabase only')
const admin=createClient(status.API_URL,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
for(const email of ['pebble-demo-001@example.test','pebble-demo-002@example.test']) {
 const {data,error}=await admin.auth.admin.listUsers({page:1,perPage:1000});assert.ifError(error)
 assert(!data.users.some(user=>user.email===email),'Demo IDs already occupied; preserve their data and use a fresh fixture selection')
}
const secret=randomUUID()+'Aa1!',clients=[]
let server,seeded=false
const env={...process.env,SUPABASE_URL:status.API_URL,SUPABASE_PUBLISHABLE_KEY:status.ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:status.SERVICE_ROLE_KEY,DATING_RULES_ENABLED:'true',FRIENDS_RULES_ENABLED:'true',ACTIVE_FRIENDS_ENABLED:'true'}
const run=(args,input)=>execFileSync('pnpm',args,{input,env,encoding:'utf8',stdio:[input===undefined?'ignore':'pipe','pipe','pipe'],timeout:120000})
try {
 run(['demo:seed','--count','2','--password-stdin','--refresh-location'],secret+'\n');seeded=true
 for(let i=1;i<=2;i++){
  const client=createClient(status.API_URL,status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
  const signed=await client.auth.signInWithPassword({email:`pebble-demo-00${i}@example.test`,password:secret});assert.ifError(signed.error)
  clients.push({id:signed.data.user.id,token:signed.data.session.access_token})
 }
 const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve))
 server=spawn('pnpm',['exec','tsx','api/server.ts'],{env:{...env,PORT:String(port)},stdio:'ignore'})
 const call=async(index,path,body,method)=>{
  const response=await globalThis.fetch(`http://127.0.0.1:${port}/api/matchmaking${path}`,{method:method??(body===undefined?'GET':'POST'),headers:{Authorization:`Bearer ${clients[index].token}`,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:globalThis.AbortSignal.timeout(20000)})
  const result=await response.json();assert(response.ok,`${path}: HTTP ${response.status}: ${JSON.stringify(result)}`);return result
 }
 for(let i=0;i<100;i++){try{await call(0,'/active-friends/status');break}catch(error){if(i===99)throw error;await delay(100)}}
 for(const mode of ['friends','dating']){
  const batch=await call(0,`/${mode}/recommendations`,{excludedIds:[],limit:10})
  assert(batch.candidates.some(person=>person.id===clients[1].id),`${mode}: reciprocal demo pair must be discoverable`)
 }
 const sent=await call(0,`/friends/requests/${clients[1].id}`,{});assert.equal(sent.status,'sent')
 const connected=await call(1,`/friends/requests/${clients[0].id}/accept`,{});assert.equal(connected.status,'connected')
 run(['demo:active','--count','2','--new-friends','1','--enable-active'])
 run(['matchmaking:active:once'])
 const states=await Promise.all([0,1].map(i=>call(i,'/active-friends/status')))
 assert.equal(states[0].state,'reserved');assert.equal(states[0].proposal.id,states[1].proposal.id)
 const proposal=states[0].proposal.id
 const first=await call(0,`/active-friends/proposals/${proposal}/accept`,{requestId:randomUUID()});assert.equal(first.state,'accepted')
 const formed=await call(1,`/active-friends/proposals/${proposal}/accept`,{requestId:randomUUID()});assert.equal(formed.state,'formed')
 const message={body:'Local integration test hello',clientRequestId:randomUUID()},path=`/active-friends/groups/${formed.groupId}`
 const a=await call(0,path+'/messages',message),b=await call(0,path+'/messages',message);assert.equal(a.id,b.id)
 const history=await call(1,path+'/messages');assert.equal(history.messages.filter(item=>item.id===a.id).length,1)
 console.log('PASS: real local Auth, passive Friends/Dating batches, explicit Friends acceptance, active enrollment/reservation/all-member acceptance, group history and idempotent messaging.')
} finally {
 server?.kill('SIGTERM')
 if(seeded)run(['demo:remove','--count','2'])
}
