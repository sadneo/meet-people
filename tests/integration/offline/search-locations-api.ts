/** Actual API -> actual SQL user flow, synthetic Auth only. No live geocoder,
 * PostgREST or deployed claim. Run explicitly against the network-none fixture. */
import assert from 'node:assert/strict'
import type { Request,Response } from 'express'
import { createMatchmakingRouter,type UserContextTransport } from '../../../api/matchmaking.js'
import { disposable } from './disposable.js'
const {checked,literal,rpc}=disposable(process.argv[2]??'pebble-safety-review-20261019-fresh')
const a='ba000000-0000-4000-8000-000000000001',b='ba000000-0000-4000-8000-000000000002',place='bc000000-0000-4000-8000-000000000001'
const transport={verify:async(token:string)=>[a,b].includes(token)?{id:token}:null,actor:(actor:string)=>({
 searchPlaces:(query:string)=>rpc(actor,'search_location_places',[query]),resolveSearchArea:(value:unknown)=>rpc(actor,'resolve_search_area',[JSON.stringify(value)]),
 browserSearchLocation:(value:unknown)=>rpc(actor,'issue_browser_search_location',[JSON.stringify(value)]),searchLocationReceipt:(mode:string,reference:string)=>rpc(actor,'get_search_location_receipt',[mode,reference]),
 friendsSearchPreferences:()=>rpc(actor,'get_friends_search_preferences'),saveFriendsSearchPreferences:(value:unknown)=>rpc(actor,'save_friends_search_preferences',[JSON.stringify(value)]),
})} as unknown as UserContextTransport
function request(actor:string,method:string,path:string,body?:unknown){return new Promise<{status:number;data:any}>((resolve,reject)=>{
 let status=200;const req={method,url:path,query:Object.fromEntries(new URL(path,'http://offline').searchParams),body,headers:{authorization:`Bearer ${actor}`}} as unknown as Request
 const res={locals:{},set(){return this},status(value:number){status=value;return this},json(data:unknown){resolve({status,data});return this}} as unknown as Response
 createMatchmakingRouter(transport)(req,res,error=>reject(error??new Error('Route miss')))
})}
checked(`begin;do $$ begin if exists(select 1 from auth.users where id in('${a}','${b}')) or exists(select 1 from location_private.places where id='${place}') then raise exception 'Fixture occupied';end if;end $$;
 insert into auth.users values('${a}'),('${b}');insert into public.profiles(id,username,display_name,birthdate,location_city) values('${a}','offline-location-a','Synthetic A','2000-01-01','API synthetic campus'),('${b}','offline-location-b','Synthetic B','2000-01-01','Other home');
 insert into public.account_settings(user_id,preferences,settings,completed) select id,'{"distance":"Nearby","group":"One-on-one","intents":[],"usual":[]}','{"notifications":false,"availability":false,"discoverable":false,"location":false}','[]' from public.profiles where username in('offline-location-a','offline-location-b');commit;`)
const payload={id:place,label:'API synthetic campus',region:'Synthetic region',aliases:['API synthetic campus'],latitude:0,longitude:0,provenance:'Offline synthetic fixture, not a real place',verifiedUntil:new Date(Date.now()+172800000).toISOString(),enabled:true}
try{
checked(`begin;set local role pebble_location_catalog_publisher;select public.publish_search_location_place(${literal(JSON.stringify(payload))}::jsonb);commit;`)
const before=checked(`select to_jsonb(md5(to_jsonb(p)::text)) from public.profiles p where id='${a}'`)
 const found=await request(a,'GET','/search-locations/places?q=synthetic');assert.equal(found.status,200);assert.equal(found.data.places[0].id,place)
 const selection={requestId:'bd000000-0000-4000-8000-000000000001',mode:'friends',source:'home',placeId:place}
 const issued=await request(a,'POST','/search-locations/resolve',selection);assert.equal(issued.status,200);assert.equal(issued.data.usable,true)
 assert.deepEqual(await request(a,'POST','/search-locations/resolve',selection),issued)
 assert.equal((await request(b,'GET',`/search-locations/friends/${issued.data.id}`)).status,404)
 assert.equal((await request(a,'GET','/friends-search-preferences')).data.revision,0)
 const preferences={ageMin:18,ageMax:99,radiusMiles:15,goals:[],searchArea:{source:'home',resolvedLocationRef:issued.data.id}}
 const saved=await request(a,'PUT','/friends-search-preferences',{expectedRevision:0,preferences});assert.equal(saved.status,200);assert.equal(saved.data.revision,1)
 assert.deepEqual((await request(a,'GET','/friends-search-preferences')).data,saved.data)
 const gps={requestId:'bd000000-0000-4000-8000-000000000002',mode:'friends',latitude:0,longitude:0,accuracyMeters:20,observedAt:new Date().toISOString(),consent:true}
 assert.equal((await request(a,'POST','/search-locations/browser',gps)).status,403)
 checked(`update public.account_settings set settings=settings||'{"location":true}' where user_id='${a}';`)
 const device=await request(a,'POST','/search-locations/browser',gps);assert.equal(device.status,200);assert.equal(device.data.method,'device-reported')
 assert.deepEqual((await request(a,'GET','/friends-search-preferences')).data,saved.data,'Issuance mutated saved filters')
 checked(`update public.account_settings set settings=settings||'{"location":false}' where user_id='${a}';`)
 assert.equal((await request(a,'GET',`/search-locations/friends/${device.data.id}`)).data.usable,false)
 assert.equal((await request(a,'GET',`/search-locations/friends/${issued.data.id}`)).data.usable,true)
 checked(`update location_private.places set enabled=false where id='${place}';`)
 assert.equal((await request(a,'GET',`/search-locations/friends/${issued.data.id}`)).data.usable,false)
 assert.equal((await request(a,'PUT','/friends-search-preferences',{expectedRevision:1,preferences})).status,400)
 assert.deepEqual((await request(a,'GET','/friends-search-preferences')).data,saved.data)
 assert.equal(checked(`select to_jsonb(md5(to_jsonb(p)::text)) from public.profiles p where id='${a}'`),before)
 console.log('PASS: actual API -> SQL location lookup/issuance/replay/filter CAS/readback/owner denial/device consent/current opt-out/catalogue revocation; shared profile unchanged. Synthetic Auth/catalogue only.')
}finally{
 checked(`begin;do $$ begin if exists(select 1 from public.profiles where id in('${a}','${b}') and username not in('offline-location-a','offline-location-b')) then raise exception 'Unknown fixture';end if;end $$;delete from auth.users where id in('${a}','${b}');delete from location_private.places where id='${place}' and provenance='Offline synthetic fixture, not a real place';commit;`)
}
