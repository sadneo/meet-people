/** Actual image bytes -> Express -> persisted SQL -> authorized read -> removal.
 * Network-none synthetic Auth. No live JWT/PostgREST/deployment claim. */
import assert from 'node:assert/strict'
import sharp from 'sharp'
import type { Request,Response } from 'express'
import { createMatchmakingRouter,type UserContextTransport } from '../../../api/matchmaking.js'
import { disposable } from './disposable.js'
import { ProfilePhotoStateSchema } from '../../../shared/profile-photo.js'
const {checked,rpc,literal}=disposable(process.argv.includes('--fresh-demo')?'pebble-demo-final-20261019':'pebble-sprint-review-20261019')
const a='b2000000-0000-4000-8000-000000000001',b='b2000000-0000-4000-8000-000000000002'
const transport={verify:async(token:string)=>[a,b].includes(token)?{id:token}:null,actor:(owner:string)=>({profilePhotoState:()=>rpc(owner,'get_profile_photo_state'),saveProfilePhoto:(value:unknown)=>rpc(owner,'save_profile_photo',[JSON.stringify(value)]),readProfilePhoto:(target:string,revision:number)=>rpc(owner,'read_profile_photo',[target,revision])})} as unknown as UserContextTransport
function request(owner:string,method:string,path:string,body?:unknown){return new Promise<{status:number;data:unknown}>((resolve,reject)=>{
 let status=200;const req={method,url:path,query:Object.fromEntries(new URL(path,'http://offline').searchParams),body,headers:{authorization:`Bearer ${owner}`}} as unknown as Request
 const res={locals:{},set(){return this},type(){return this},status(value:number){status=value;return this},json(data:unknown){resolve({status,data});return this},send(data:unknown){resolve({status,data});return this}} as unknown as Response
 createMatchmakingRouter(transport)(req,res,error=>reject(error??new Error('Route miss')))
})}
checked(`begin;do $$ begin if exists(select 1 from auth.users where id in('${a}','${b}')) then raise exception 'Fixture occupied';end if;end $$;insert into auth.users values('${a}'),('${b}');insert into public.profiles(id,username,display_name,birthdate,location_city) values('${a}','photo-api-a','Synthetic photo A','2000-01-01','Synthetic campus'),('${b}','photo-api-b','Synthetic photo B','2000-01-01','Synthetic campus');commit;`)
try{
 const initial=await request(a,'GET','/profile-photo');assert.equal(initial.status,200);assert.deepEqual(initial.data,{revision:0,hasPhoto:false,updatedAt:null})
 const source=await sharp({create:{width:800,height:400,channels:3,background:'#dfcbbd'}}).withMetadata({orientation:6}).withExifMerge({IFD0:{Artist:'private-camera-owner'}}).jpeg().toBuffer()
 const path='/profile-photo?expectedRevision=0&requestId=b2100000-0000-4000-8000-000000000001'
 const saved=await request(a,'PUT',path,source);assert.equal(saved.status,200,JSON.stringify(saved));const savedState=ProfilePhotoStateSchema.parse(saved.data);assert.equal(savedState.revision,1);assert.equal(savedState.hasPhoto,true)
 assert.deepEqual(await request(a,'GET','/profile-photo'),saved)
 assert.deepEqual(await request(a,'PUT',path,source),saved,'Retry must replay same revision')
 const read=await request(a,'GET',`/profile-photo/${a}/1`);assert.equal(read.status,200);assert.ok(Buffer.isBuffer(read.data))
 const metadata=await sharp(read.data).metadata();assert.equal(metadata.width,256);assert.equal(metadata.height,512);assert.equal(metadata.exif,undefined);assert.equal(metadata.icc,undefined)
 assert.equal((await request(b,'GET',`/profile-photo/${a}/1`)).status,404,'Unauthorized peer read')
 assert.equal((await request(a,'PUT','/profile-photo?expectedRevision=0&requestId=b2100000-0000-4000-8000-000000000002',source)).status,409)
 // Direct RPC cannot smuggle the original EXIF-bearing JPEG around processing.
 const bypass=await rpc(a,'save_profile_photo',[JSON.stringify({expectedRevision:1,requestId:'b2100000-0000-4000-8000-000000000003',jpegBase64:source.toString('base64')})]);assert.equal(bypass.error?.code,'22023')
 assert.equal(checked(`select to_jsonb(photo_private.valid_jpeg(decode(${literal(read.data.toString('base64'))},'base64')))`),true)
 const spoof=await rpc(a,'save_profile_photo',[JSON.stringify({expectedRevision:1,requestId:'b2100000-0000-4000-8000-000000000003',jpegBase64:null,user_id:b})]);assert.equal(spoof.error?.code,'22023')
 const removed=await request(a,'DELETE','/profile-photo?expectedRevision=1&requestId=b2100000-0000-4000-8000-000000000004');assert.equal(removed.status,200);const removedState=ProfilePhotoStateSchema.parse(removed.data);assert.equal(removedState.revision,2);assert.equal(removedState.hasPhoto,false)
 assert.deepEqual(await request(a,'GET','/profile-photo'),removed)
 assert.equal((await request(a,'GET',`/profile-photo/${a}/1`)).status,404)
 assert.equal((await request(a,'PUT',path,source)).status,409,'Old upload replay resurrected removed image')
 assert.equal(checked(`select to_jsonb(jpeg is null) from photo_private.photos where user_id='${a}'`),true)
 assert.equal(checked(`select to_jsonb(avatar_url is null) from public.profiles where id='${a}'`),true,'Photo sidecar overwrote canonical identity')
 // Exercise the real hourly and daily admission limits, with idempotent replay
 // checked before both quotas. Only collision-checked synthetic owner's rows.
 const sanitized=await sharp(source).autoOrient().resize({width:512,height:512,fit:'inside'}).jpeg({progressive:false}).toBuffer()
 for(let index=0;index<4;index++){
  const upload={expectedRevision:2+index*2,requestId:`b2100000-0000-4000-8000-${String(10+index*2).padStart(12,'0')}`,jpegBase64:sanitized.toString('base64')}
  assert.equal((await rpc(a,'save_profile_photo',[JSON.stringify(upload)])).error,null)
  if(index<3)assert.equal((await rpc(a,'save_profile_photo',[JSON.stringify({...upload,expectedRevision:3+index*2,requestId:`b2100000-0000-4000-8000-${String(11+index*2).padStart(12,'0')}`,jpegBase64:null})])).error,null)
 }
 const over={expectedRevision:9,requestId:'b2100000-0000-4000-8000-000000000018',jpegBase64:sanitized.toString('base64')}
 assert.equal((await rpc(a,'save_profile_photo',[JSON.stringify(over)])).error?.code,'PH429')
 const replay={expectedRevision:9,requestId:'b2100000-0000-4000-8000-000000000017',jpegBase64:null}
 assert.equal((await rpc(a,'save_profile_photo',[JSON.stringify(replay)])).error,null,'Upload quota prevented removal')
 checked(`update photo_private.requests set created_at=statement_timestamp()-interval '2 hours' where user_id='${a}';insert into photo_private.requests(user_id,request_id,fingerprint,revision,has_photo,created_at) select r.user_id,('b2200000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,r.fingerprint,r.revision,r.has_photo,statement_timestamp()-interval '2 hours' from photo_private.requests r cross join generate_series(1,15) n where r.user_id='${a}' and r.request_id='b2100000-0000-4000-8000-000000000016'`)
 assert.equal((await rpc(a,'save_profile_photo',[JSON.stringify({...over,expectedRevision:10})])).error?.code,'PH429')
 assert.equal((await rpc(a,'save_profile_photo',[JSON.stringify(replay)])).error,null)
 console.log('PASS: actual image upload/orientation/metadata stripping -> real API/SQL CAS/readback/replay, private reads, direct EXIF bypass rejection, hourly/daily quotas, current-byte removal and non-restoring old replay; synthetic Auth only.')
}finally{checked(`begin;delete from auth.users where id in('${a}','${b}') and exists(select 1 from public.profiles p where p.id=auth.users.id and p.username in('photo-api-a','photo-api-b'));commit;`)}
