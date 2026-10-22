/** Real signed-in Dating API/SQL + uploaded-photo + contact flow, synthetic Auth. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import sharp from 'sharp'
import type { Request,Response } from 'express'
import { createMatchmakingRouter,type UserContextTransport } from '../../../api/matchmaking.js'
import { createSocialRouter } from '../../../api/social.js'
import { disposable } from './disposable.js'
const {checked,rpc}=disposable(process.argv.includes('--fresh-demo')?'pebble-demo-final-20261019':'pebble-sprint-review-20261019')
const a='af000000-0000-4000-8000-000000000001',b='af000000-0000-4000-8000-000000000002'
const transport={verify:async(token:string)=>[a,b].includes(token)?{id:token}:null,actor:(owner:string)=>({
 datingRuntime:()=>rpc(owner,'get_dating_runtime'),setDatingEnabled:(value:unknown)=>rpc(owner,'set_dating_enabled',[JSON.stringify(value)]),datingCandidate:(excluded:string[])=>rpc(owner,'find_dating_candidate',[JSON.stringify(excluded)]),requestDatingConnection:(target:string)=>rpc(owner,'request_dating_connection',[target]),
 socialConnection:(target:string,action:string)=>rpc(owner,'social_connection',[target,action]),socialSend:(conversation:string,body:string,key:string)=>rpc(owner,'social_send',[conversation,body,key]),socialHistory:(conversation:string,before:number|null,after:number|null)=>rpc(owner,'social_history',[conversation,before,after]),
 profilePhotoState:()=>rpc(owner,'get_profile_photo_state'),saveProfilePhoto:(value:unknown)=>rpc(owner,'save_profile_photo',[JSON.stringify(value)]),readProfilePhoto:(target:string,revision:number)=>rpc(owner,'read_profile_photo',[target,revision]),
})} as unknown as UserContextTransport
function request(owner:string,method:string,path:string,body?:unknown,kind:'matching'|'conversations'='matching'){return new Promise<{status:number;data:any}>((resolve,reject)=>{
 let status=200;const req={method,url:path,query:Object.fromEntries(new URL(path,'http://offline').searchParams),body,headers:{authorization:`Bearer ${owner}`}} as unknown as Request
 const res={locals:{},set(){return this},type(){return this},status(value:number){status=value;return this},json(data:unknown){resolve({status,data});return this},send(data:unknown){resolve({status,data});return this}} as unknown as Response
 const router=kind==='matching'?createMatchmakingRouter(transport):createSocialRouter(transport,'conversations');router(req,res,error=>reject(error??new Error('Route miss')))
})}
async function ok(owner:string,method:string,path:string,body?:unknown,kind:'matching'|'conversations'='matching'){const result=await request(owner,method,path,body,kind);assert.equal(result.status,200,JSON.stringify(result));return result.data}
const setup=readFileSync('tests/integration/sql/dating-live.sql','utf8').split(' -- A heart')[0].replace('\\set ON_ERROR_STOP on','')+'end $$;reset role;commit;'
checked("set pebble.safety_owner_test_target='network-none-safety-owner-v1';"+setup)
try{
 // Authorize images through Dating alone, not an incidental Friends audience.
 checked(`update public.detailed_settings set settings=settings||'{"friendsDiscovery":false}' where user_id in('${a}','${b}')`)
 const runtime=await ok(a,'GET','/dating/status');assert.equal(runtime.available,true);assert.equal(runtime.aggregate.profile.enabled,true)
 const source=await sharp({create:{width:300,height:400,channels:3,background:'#dfcbbd'}}).withExif({IFD0:{Artist:'private-camera'}}).jpeg().toBuffer()
 const photo=await ok(b,'PUT','/profile-photo?expectedRevision=0&requestId=af500000-0000-4000-8000-000000000001',source);assert.equal(photo.revision,1)
 const found=await ok(a,'POST','/dating/candidate',{excludedIds:[]});assert.equal(found.candidate.id,b);assert.equal(found.candidate.photoRevision,1);assert.equal(found.candidate.avatar,null);assert.equal(found.candidate.gender,null);assert.equal(found.candidate.sexuality,null);assert.equal(found.candidate.heightInches,null)
 const image=await ok(a,'GET',`/profile-photo/${b}/1`);assert.equal((await sharp(image).metadata()).exif,undefined)
 const paused=await ok(b,'PUT','/dating/enabled',{expectedProfileRevision:2,expectedSearchRevision:2,enabled:false});assert.equal(paused.aggregate.profile.enabled,false)
 assert.equal((await request(a,'GET',`/profile-photo/${b}/1`)).status,404,'Paused Dating retained otherwise unauthorized photo access')
 assert.notEqual((await ok(a,'POST','/dating/candidate',{excludedIds:[]})).candidate?.id,b)
 assert.equal((await request(a,'POST',`/dating/requests/${b}`,{})).status,409)
 await ok(b,'PUT','/dating/enabled',{expectedProfileRevision:3,expectedSearchRevision:3,enabled:true})
 const sent=await ok(a,'POST',`/dating/requests/${b}`,{});assert.equal(sent.status,'sent');assert.equal(sent.conversationId,null)
 assert.deepEqual(await ok(a,'POST',`/dating/requests/${b}`,{}),sent)
 const accepted=await ok(b,'POST',`/dating/requests/${a}`,{});assert.equal(accepted.status,'connected');assert.match(accepted.conversationId,/^[0-9a-f-]{36}$/)
 const message=await ok(a,'POST',`/${accepted.conversationId}/messages`,{body:'Real persisted Dating request flow',clientRequestId:'af500000-0000-4000-8000-000000000002'},'conversations')
 assert.equal(message.sender_id,a);assert.equal(message.body,'Real persisted Dating request flow')
 const history=await ok(b,'GET',`/${accepted.conversationId}/messages`,undefined,'conversations');assert.deepEqual(history.messages,[message])
 const blocked=await rpc(b,'block_owner_target',[a]);assert.equal(blocked.error,null)
 assert.equal((await request(a,'GET',`/profile-photo/${b}/1`)).status,404)
 assert.notEqual((await ok(a,'POST','/dating/candidate',{excludedIds:[]})).candidate?.id,b)
 assert.equal((await request(a,'POST',`/dating/requests/${b}`,{})).status,409)
 console.log('PASS: actual Dating API -> SQL opted-in reciprocal adult candidate -> private uploaded photo -> pause/authorization withdrawal -> explicit request/recipient acceptance -> persisted direct message -> reverse block exclusion/photo denial. Synthetic Auth/catalogue only.')
}finally{checked("begin;do $$ begin if exists(select 1 from public.profiles where id::text like 'af000000-%' and username not like 'active-fixture-%') then raise exception 'Unknown fixture';end if;end $$;delete from safety_private.revoked_connections where connection_id in(select id from public.connections where user_a='af000000-0000-4000-8000-000000000001' and user_b='af000000-0000-4000-8000-000000000002');delete from auth.users where id::text like 'af000000-%';delete from location_private.places where id::text like 'af100000-%' and provenance='Rollback active fixture';commit;")}
