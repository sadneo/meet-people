/** Persisted actual API -> SQL flow. Synthetic Auth only; no live PostgREST. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { Request, Response } from 'express'
import { createMatchmakingRouter, type UserContextTransport } from '../../api/matchmaking.js'
import { disposable } from './disposable.js'
const {checked,sql,literal,rpc}=disposable(process.argv[2]??'pebble-safety-review-20261019-final')
const a='af000000-0000-4000-8000-000000000001',c='af000000-0000-4000-8000-000000000003'
const rows=(owner:string,name:string)=>Promise.resolve(sql(`begin;set local role authenticated;set local request.jwt.claim.sub=${literal(owner)};select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.${name}() r;commit;`))
const transport={verify:async(token:string)=>token===a?{id:a}:null,actor:(owner:string)=>({status:()=>rows(owner,'get_queue_status'),result:()=>rows(owner,'get_queue_match'),leave:()=>rpc(owner,'leave_queue'),join:(qtype:string)=>rpc(owner,'join_queue',[qtype])})} as unknown as UserContextTransport
function request(method:string,path:string,body?:unknown){return new Promise<{status:number;data:any}>((resolve,reject)=>{
 let status=200;const req={method,url:path,query:{},body,headers:{authorization:`Bearer ${a}`}} as unknown as Request
 const res={locals:{},set(){return this},status(value:number){status=value;return this},json(data:unknown){resolve({status,data});return this}} as unknown as Response
 createMatchmakingRouter(transport)(req,res,error=>reject(error??new Error('Route miss')))
})}
const acceptance=readFileSync('tests/active-nearby.sql','utf8').replace('\\set ON_ERROR_STOP on','').replace(/rollback;\s*$/,'commit;')
checked("set pebble.safety_owner_test_target='network-none-safety-owner-v1';"+acceptance)
try{
 assert.deepEqual(await request('GET','/status'),{status:200,data:{mode:'active'}})
 const result=await request('GET','/result');assert.equal(result.status,200);assert.equal(result.data.candidate.id,c);assert.equal(result.data.candidate.mode,'active');assert.equal(result.data.candidate.meetup,null)
 assert.deepEqual(Object.keys(result.data.candidate).sort(),['id','name','avatar','interests','overlap','mode','meetup'].sort())
 assert.equal(checked(`select to_jsonb(count(*)) from public.connections where user_a='${a}' or user_b='${a}'`),0)
 // Canonical filter CAS immediately affects the next manual result.
 const before=await rpc(c,'get_friends_search_preferences');assert.equal(before.error,null)
 const saved=before.data as any
 const changed=await rpc(c,'save_friends_search_preferences',[JSON.stringify({expectedRevision:saved.revision,preferences:{...saved.preferences,radiusMiles:1}})]);assert.equal(changed.error,null)
 assert.deepEqual(await request('GET','/result'),{status:200,data:{candidate:null}})
 assert.deepEqual(await request('DELETE','/queue'),{status:200,data:{mode:null}})
 assert.equal((await request('GET','/result')).status,409)
 assert.deepEqual(await request('POST','/queue',{mode:'downtime'}),{status:200,data:{mode:'downtime'}})
 assert.equal((await request('GET','/result')).status,503)
 assert.deepEqual(await request('POST','/queue',{mode:'active'}),{status:200,data:{mode:'active'}})
 checked(`update location_private.places set enabled=false where id='af100000-0000-4000-8000-000000000001'`)
 assert.equal((await request('POST','/queue',{mode:'active'})).status,409)
 assert.equal((await request('GET','/result')).status,409)
 console.log('PASS: real API -> SQL queued active single candidate, canonical filter CAS/readback consumed on manual check, no connection, cancellation, active priority, unavailable downtime and revoked-location rejection. Synthetic Auth only.')
}finally{
 checked("begin;do $$ begin if exists(select 1 from public.profiles where id::text like 'af000000-%' and username not like 'active-fixture-%') then raise exception 'Unknown fixture';end if;end $$;delete from auth.users where id::text like 'af000000-%';delete from location_private.places where id::text like 'af100000-%' and provenance='Rollback active fixture';commit;")
}
