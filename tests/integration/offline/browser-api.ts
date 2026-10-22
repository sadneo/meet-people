/** Local browser acceptance fixture. Actual Express and PostgreSQL; synthetic
 * Auth only. No env loading, app DB, provider, public listener or fake RPC result. */
import assert from 'node:assert/strict'
import express from 'express'
import { createMatchmakingRouter,type UserContextTransport } from '../../../api/matchmaking.js'
import { createSocialRouter } from '../../../api/social.js'
import { disposable } from './disposable.js'
import { emptyAccount,type Account } from '../../../shared/account.js'
import { emptyDatingProfile } from '../../../shared/dating.js'
export const demoOwners={first:'a0000000-0000-4000-8000-000000000001',second:'a0000000-0000-4000-8000-000000000002'}
export const demoTokens={first:'browser-user-jwt',second:'browser-peer-jwt'}
const place='a1000000-0000-4000-8000-000000000001'
export async function startOfflineBrowserApi(){
 const db=disposable('pebble-demo-final-20261019'),{checked,rpc,sql,literal}=db
 const rows=(owner:string,name:string)=>Promise.resolve(sql(`begin;set local role authenticated;set local request.jwt.claim.sub=${literal(owner)};select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.${name}() r;commit;`))
 const principals=new Map([[demoTokens.first,demoOwners.first],[demoTokens.second,demoOwners.second]])
 const transport={
  verify:async(token:string)=>{const owner=principals.get(token);return owner&&checked(`select coalesce((select to_jsonb(is_anonymous is false) from auth.users where id=${literal(owner)}),'false')`)?{id:owner}:null},
  actor:(token:string)=>{const owner=principals.get(token)!;return{
   account:()=>rpc(owner,'get_account'),saveAccount:(value:unknown)=>rpc(owner,'save_account',[JSON.stringify(value)]),profile:()=>rpc(owner,'get_matchmaking_profile'),save:(value:unknown)=>rpc(owner,'save_matchmaking_profile',[JSON.stringify(value)]),
   profileDetails:()=>rpc(owner,'get_profile_details'),saveProfileDetails:(value:unknown)=>rpc(owner,'save_profile_details',[JSON.stringify(value)]),detailedSettings:()=>rpc(owner,'get_detailed_settings'),saveDetailedSettings:(value:unknown)=>rpc(owner,'save_detailed_settings',[JSON.stringify(value)]),
   friendsRuntime:()=>rpc(owner,'get_friends_runtime'),friendsSearchPreferences:()=>rpc(owner,'get_friends_search_preferences'),saveFriendsSearchPreferences:(value:unknown)=>rpc(owner,'save_friends_search_preferences',[JSON.stringify(value)]),
   status:()=>rows(owner,'get_queue_status'),result:()=>rows(owner,'get_queue_match'),join:(kind:string)=>rpc(owner,'join_queue',[kind]),leave:()=>rpc(owner,'leave_queue'),
   datingAggregate:()=>rpc(owner,'get_dating_preferences'),saveDatingAggregate:(value:unknown)=>rpc(owner,'save_dating_preferences',[JSON.stringify(value)]),datingRuntime:()=>rpc(owner,'get_dating_runtime'),setDatingEnabled:(value:unknown)=>rpc(owner,'set_dating_enabled',[JSON.stringify(value)]),datingCandidate:(excluded:string[])=>rpc(owner,'find_dating_candidate',[JSON.stringify(excluded)]),requestDatingConnection:(target:string)=>rpc(owner,'request_dating_connection',[target]),
   searchPlaces:(value:string)=>rpc(owner,'search_location_places',[value]),resolveSearchArea:(value:unknown)=>rpc(owner,'resolve_search_area',[JSON.stringify(value)]),browserSearchLocation:(value:unknown)=>rpc(owner,'issue_browser_search_location',[JSON.stringify(value)]),searchLocationReceipt:(mode:string,reference:string)=>rpc(owner,'get_search_location_receipt',[mode,reference]),
   profilePhotoReference:(target:string)=>rpc(owner,'get_profile_photo_reference',[target]),profilePhotoState:()=>rpc(owner,'get_profile_photo_state'),saveProfilePhoto:(value:unknown)=>rpc(owner,'save_profile_photo',[JSON.stringify(value)]),readProfilePhoto:(target:string,revision:number)=>rpc(owner,'read_profile_photo',[target,revision]),
   socialConnection:(target:string,action:string)=>rpc(owner,'social_connection',[target,action]),socialConnectionList:()=>rpc(owner,'social_connection_list'),socialInbox:(page:number)=>rpc(owner,'social_inbox',[page]),socialHistory:(conversation:string,before:number|null,after:number|null)=>rpc(owner,'social_history',[conversation,before,after]),socialSend:(conversation:string,body:string,key:string)=>rpc(owner,'social_send',[conversation,body,key]),socialRead:(conversation:string,seq:number)=>rpc(owner,'social_read',[conversation,seq]),socialActivity:()=>rpc(owner,'social_activity'),
   notifications:()=>rpc(owner,'get_matching_notifications'),notificationRead:(id:string)=>rpc(owner,'mark_matching_notification_read',[id]),ownerBlockState:(target:string)=>rpc(owner,'get_owner_block_state',[target]),blockOwnerTarget:(target:string)=>rpc(owner,'block_owner_target',[target]),unblockOwnerTarget:(target:string)=>rpc(owner,'unblock_owner_target',[target]),
  }}
 } as unknown as UserContextTransport
 const app=express();app.use(express.json());app.use('/api/matchmaking',createMatchmakingRouter(transport));app.use('/api/connections',createSocialRouter(transport,'connections'));app.use('/api/conversations',createSocialRouter(transport,'conversations'))
 const server=await new Promise<import('node:http').Server>((resolve,reject)=>{const listener=app.listen(3195,'127.0.0.1',()=>resolve(listener));listener.once('error',reject)})
 // Docker/psql fixture calls are synchronous. Keep pooled loopback sockets alive
 // while another request performs its real SQL work; never retry a mutation.
 server.keepAliveTimeout=120000;server.headersTimeout=125000
 let created=false
 async function api(which:'first'|'second',method:string,path:string,body?:unknown){
  const result=await fetch('http://127.0.0.1:3195/api/matchmaking'+path,{method,headers:{Authorization:`Bearer ${demoTokens[which]}`,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)})
  const data=await result.json();assert.equal(result.status,200,JSON.stringify(data));return data
 }
 async function setup(){
  const {first:a,second:b}=demoOwners
  checked(`begin;do $$ begin if exists(select 1 from auth.users where id in('${a}','${b}')) or exists(select 1 from location_private.places where id='${place}') then raise exception 'Browser fixture occupied';end if;end $$;insert into auth.users(id) values('${a}'),('${b}');commit;`);created=true
  for(const [index,which] of (['first','second'] as const).entries()){
   let value:Account={...structuredClone(emptyAccount),settings:{notifications:false,availability:false,discoverable:true,location:false},profile:{username:`browser-integrated-${index}`,display_name:index?'Morgan':'Alex',bio:'Shared real SQL fixture biography.',birthdate:null,location_city:null,avatar_url:null,interests:[],availability:[]},completed:[0]}
   for(let chapter=0;chapter<4;chapter++){
    if(chapter===1)value={...value,profile:{...value.profile!,interests:['Coffee','Custom pottery','Hiking']},completed:[0,1]}
    if(chapter===2)value={...value,preferences:{...value.preferences,intents:['Activity partners']},completed:[0,1,2]}
    if(chapter===3)value={...value,profile:{...value.profile!,birthdate:'2000-01-01',location_city:'Synthetic browser campus',availability:[{dow:1,start_time:'12:00:00',end_time:'17:00:00'}]},preferences:{...value.preferences,distance:'Nearby',group:'Either'},completed:[0,1,2,3]}
    value=await api(which,'PUT','/account',value)
   }
   await api(which,'PUT','/detailed-settings',{expectedRevision:0,settings:{messages:false,plans:false,matches:false,friendsDiscovery:true,datingDiscovery:true}})
  }
  checked(`begin;set local role pebble_location_catalog_publisher;select public.publish_search_location_place(jsonb_build_object('id','${place}','label','Synthetic browser campus','region','Synthetic only','aliases',jsonb_build_array('Synthetic browser campus'),'latitude',0,'longitude',0,'provenance','Offline real browser acceptance fixture','verifiedUntil',to_char(statement_timestamp()+interval '2 days','YYYY-MM-DD"T"HH24:MI:SS.USOF'),'enabled',true));commit;`)
  for(const [index,which] of (['first','second'] as const).entries()){
   for(const mode of ['friends','dating']){
    const receipt=await api(which,'POST','/search-locations/resolve',{requestId:`a2000000-0000-4000-8000-${String(1+index*2+(mode==='dating'?1:0)).padStart(12,'0')}`,mode,source:'home',placeId:place})
    const search={ageMin:18,ageMax:99,radiusMiles:15,searchArea:{source:'home',resolvedLocationRef:receipt.id}}
    if(mode==='friends')await api(which,'PUT','/friends-search-preferences',{expectedRevision:0,preferences:{...search,goals:[]}})
    else await api(which,'PUT','/dating-preferences',{expectedProfileRevision:0,expectedSearchRevision:0,profile:{...emptyDatingProfile(),gender:index?'Woman':'Man',sexuality:'Straight',intent:'Long-term relationship',style:'Monogamy',heightInches:67,visibility:{gender:false,sexuality:false,height:true}},search})
   }
  }
 }
 async function dispose(){
  server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()))
  if(!created)return
  const {first:a,second:b}=demoOwners
  checked(`begin;do $$ begin if exists(select 1 from public.profiles where id in('${a}','${b}') and username not in('browser-integrated-0','browser-integrated-1')) then raise exception 'Unknown browser fixture';end if;end $$;delete from safety_private.revoked_connections where connection_id in(select id from public.connections where user_a='${a}' and user_b='${b}');delete from auth.users where id in('${a}','${b}');delete from location_private.places where id='${place}' and provenance='Offline real browser acceptance fixture';commit;`)
 }
 return{setup,dispose,api,db}
}
