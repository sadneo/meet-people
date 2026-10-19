/** Real canonical onboarding -> location -> active matcher; synthetic Auth only. */
import assert from 'node:assert/strict'
import type { Request,Response } from 'express'
import { createMatchmakingRouter,type UserContextTransport } from '../../api/matchmaking.js'
import { disposable } from './disposable.js'
import { emptyAccount, type Account } from '../../shared/account.js'
const {checked,sql,literal,rpc}=disposable('pebble-sprint-review-20261019')
const a='b1000000-0000-4000-8000-000000000001',b='b1000000-0000-4000-8000-000000000002',place='b1100000-0000-4000-8000-000000000001'
const rows=(owner:string,name:string)=>Promise.resolve(sql(`begin;set local role authenticated;set local request.jwt.claim.sub=${literal(owner)};select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.${name}() r;commit;`))
const transport={verify:async(token:string)=>[a,b].includes(token)?{id:token}:null,actor:(owner:string)=>({
 account:()=>rpc(owner,'get_account'),saveAccount:(value:unknown)=>rpc(owner,'save_account',[JSON.stringify(value)]),
 profile:()=>rpc(owner,'get_matchmaking_profile'),status:()=>rows(owner,'get_queue_status'),result:()=>rows(owner,'get_queue_match'),join:(kind:string)=>rpc(owner,'join_queue',[kind]),leave:()=>rpc(owner,'leave_queue'),
 friendsSearchPreferences:()=>rpc(owner,'get_friends_search_preferences'),saveFriendsSearchPreferences:(value:unknown)=>rpc(owner,'save_friends_search_preferences',[JSON.stringify(value)]),
 resolveSearchArea:(value:unknown)=>rpc(owner,'resolve_search_area',[JSON.stringify(value)]),
})} as unknown as UserContextTransport
function request(owner:string,method:string,path:string,body?:unknown){return new Promise<{status:number;data:any}>((resolve,reject)=>{
 let status=200;const req={method,url:path,query:{},body,headers:{authorization:`Bearer ${owner}`}} as unknown as Request
 const res={locals:{},set(){return this},status(value:number){status=value;return this},json(data:unknown){resolve({status,data});return this}} as unknown as Response
 createMatchmakingRouter(transport)(req,res,error=>reject(error??new Error('Route miss')))
})}
async function ok(owner:string,method:string,path:string,body?:unknown){const result=await request(owner,method,path,body);assert.equal(result.status,200,JSON.stringify(result));return result.data}
checked(`begin;do $$ begin if exists(select 1 from auth.users where id in('${a}','${b}')) or exists(select 1 from location_private.places where id='${place}') then raise exception 'Fixture occupied';end if;end $$;insert into auth.users values('${a}'),('${b}');commit;`)
try{
 for(const [index,owner] of [a,b].entries()){
  const first=await ok(owner,'GET','/account');assert.equal(first.profile,null);assert.deepEqual(first.completed,[])
  let draft:Account={...structuredClone(emptyAccount),profile:{username:`canonical-active-${index}`,display_name:`Synthetic ${index}`,bio:null,avatar_url:null,birthdate:null,location_city:null,interests:[],availability:[]},completed:[0]}
  for(let chapter=0;chapter<4;chapter++){
   if(chapter===1)draft={...draft,profile:{...draft.profile!,interests:['Custom pottery','Trail sketches','Sourdough']},completed:[0,1]}
   if(chapter===2)draft={...draft,preferences:{...draft.preferences,intents:['Activity partners']},completed:[0,1,2]}
   if(chapter===3)draft={...draft,profile:{...draft.profile!,birthdate:'2000-01-01',location_city:'Synthetic canonical campus',availability:[{dow:index,start_time:'12:00:00',end_time:'17:00:00'}]},preferences:{...draft.preferences,distance:'Nearby',group:'One-on-one'},completed:[0,1,2,3]}
   const saved=await ok(owner,'PUT','/account',draft);assert.deepEqual(saved.completed,draft.completed);assert.deepEqual(await ok(owner,'GET','/account'),saved);draft=saved
  }
  assert.equal((await request(owner,'PUT','/account',{...draft,profile:{...draft.profile!,interests:[]}})).status,400)
  assert.deepEqual(await ok(owner,'GET','/account'),draft)
  const settings=await rpc(owner,'save_detailed_settings',[JSON.stringify({expectedRevision:0,settings:{messages:false,plans:false,matches:false,friendsDiscovery:true,datingDiscovery:false}})]);assert.equal(settings.error,null)
 }
 checked(`begin;set local role pebble_location_catalog_publisher;select public.publish_search_location_place(jsonb_build_object('id','${place}','label','Synthetic canonical campus','region','Synthetic','aliases',jsonb_build_array('Synthetic canonical campus'),'latitude',0,'longitude',0,'provenance','Offline canonical integration fixture','verifiedUntil',to_char(statement_timestamp()+interval '2 days','YYYY-MM-DD"T"HH24:MI:SS.USOF'),'enabled',true));commit;`)
 for(const [index,owner] of [a,b].entries()){
  const location=await ok(owner,'POST','/search-locations/resolve',{requestId:`b1200000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,mode:'friends',source:'home',placeId:place})
  await ok(owner,'PUT','/friends-search-preferences',{expectedRevision:0,preferences:{ageMin:18,ageMax:99,radiusMiles:15,goals:[],searchArea:{source:'home',resolvedLocationRef:location.id}}})
  await ok(owner,'POST','/queue',{mode:'active'})
 }
 let result=await ok(a,'GET','/result');assert.equal(result.candidate.id,b);assert.equal(result.candidate.overlap,'none');assert.equal(result.candidate.interests.length,3)
 // This is the same compatibility endpoint Find Friends uses, delegating to the
 // canonical account writer. Shared edits must survive account readback.
 const account=await ok(b,'GET','/account')
 const changed={...account.profile,interests:['Bird calls','Chess','Custom pottery'],availability:[{dow:0,start_time:'12:00:00',end_time:'17:00:00'}]}
 assert.deepEqual((await ok(b,'PUT','/profile',changed)).profile,changed)
 assert.deepEqual((await ok(b,'GET','/account')).profile,changed)
 result=await ok(a,'GET','/result');assert.equal(result.candidate.overlap,'extended');assert.deepEqual(result.candidate.interests,['Custom pottery'])
 const filter=await ok(b,'GET','/friends-search-preferences');assert.equal(filter.revision,1)
 assert.equal(checked(`select to_jsonb(count(*)) from public.user_interests where profile_id in('${a}','${b}') and embedding is not null`),0)
 console.log('PASS: actual API -> canonical four-chapter onboarding/readback -> trusted location -> real active result -> shared interest/week edit through canonical writer -> changed result; invalid edit rollback and filter isolation. No provider calls; synthetic Auth only.')
}finally{
 checked(`begin;do $$ begin if exists(select 1 from public.profiles where id in('${a}','${b}') and username not in('canonical-active-0','canonical-active-1')) then raise exception 'Unknown fixture';end if;end $$;delete from auth.users where id in('${a}','${b}');delete from location_private.places where id='${place}' and provenance='Offline canonical integration fixture';commit;`)
}
