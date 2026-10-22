// @vitest-environment node
import { expect, it, vi } from 'vitest'
import type { Request, Response } from 'express'
import { createMatchmakingRouter, createUserContextTransport, type UserContextTransport } from '../../api/matchmaking'
import { BrowserSearchLocationSchema, ResolveSearchAreaSchema, SearchLocationReceiptSchema } from '../../shared/search-locations'
const actorId='ab000000-0000-4000-8000-000000000001', id='ac000000-0000-4000-8000-000000000001', requestId='ad000000-0000-4000-8000-000000000001'
const receipt={id,mode:'friends' as const,source:'temporary' as const,areaLabel:'Synthetic campus',method:'geocoded-area' as const,expiresAt:'2030-01-01T00:00:00Z',usable:true}
function request(method: string,path: string,body: unknown,actor: object={},token='synthetic',configured?: UserContextTransport) {
 const transport=configured ?? {verify:async(value: string)=>value==='synthetic'?{id:actorId}:null,actor:()=>actor} as unknown as UserContextTransport
 return new Promise<{status:number;data:any;cache:string}>((resolve,reject)=>{
  let status=200,cache=''
  const req={method,url:'/search-locations'+path,query:Object.fromEntries(new URL(path,'http://test').searchParams),body,headers:token?{authorization:`Bearer ${token}`}:{}} as unknown as Request
  const res={locals:{},set(name:string,value:string){if(name==='Cache-Control')cache=value;return this},status(value:number){status=value;return this},json(data:unknown){resolve({status,data,cache});return this}} as unknown as Response
  createMatchmakingRouter(transport)(req,res,error=>reject(error??new Error('Route miss')))
 })
}
it('requires identity and capability; missing resolver never invents a place',async()=>{
 expect((await request('GET','/places?q=Campus',undefined,{},'')).status).toBe(401)
 expect((await request('GET','/places?q=Campus',undefined)).status).toBe(503)
 const result=await request('GET','/places?q=Campus',undefined,{searchPlaces:async()=>({data:{places:[]},error:null})})
 expect(result).toEqual({status:200,cache:'no-store',data:{places:[]}})
})
it('rejects actor selectors, client-supplied place coordinates, missing consent and imprecise readings before RPC',async()=>{
 const call=vi.fn(), actor={searchPlaces:call,resolveSearchArea:call,browserSearchLocation:call}
 for(const [method,path,body] of [
  ['GET',`/places?q=Campus&actorId=${actorId}`,undefined],['GET','/places?q=Campus',null],
  ['POST','/resolve',{requestId,mode:'friends',source:'home',placeId:id,latitude:0}],
  ['POST','/browser',{requestId,mode:'friends',latitude:0,longitude:0,accuracyMeters:20,observedAt:'2026-10-19T00:00:00Z'}],
  ['POST','/browser',{requestId,mode:'friends',latitude:0,longitude:0,accuracyMeters:1001,observedAt:'2026-10-19T00:00:00Z',consent:true}],
 ] as const)expect((await request(method,path,body,actor)).status).toBe(400)
 expect(call).not.toHaveBeenCalled()
})
it('pins strict Unicode/coordinate/receipt contracts and preserves zero coordinates',()=>{
 const body={requestId,mode:'dating',latitude:0,longitude:0,accuracyMeters:20,observedAt:'2026-10-19T00:00:00Z',consent:true}
 expect(BrowserSearchLocationSchema.parse(body).latitude).toBe(0)
 expect(BrowserSearchLocationSchema.safeParse({...body,latitude:NaN}).success).toBe(false)
 expect(ResolveSearchAreaSchema.safeParse({requestId,mode:'friends',source:'home',placeId:id,actorId}).success).toBe(false)
 expect(SearchLocationReceiptSchema.safeParse({...receipt,latitude:0}).success).toBe(false)
})
it('rejects wrong mode, wrong receipt identity, stale receipts and unexpected raw coordinates',async()=>{
 const body={requestId,mode:'friends',source:'temporary',placeId:id}
 expect((await request('POST','/resolve',body,{resolveSearchArea:async()=>({data:{...receipt,mode:'dating'},error:null})})).status).toBe(502)
 expect((await request('POST','/resolve',body,{resolveSearchArea:async()=>({data:{...receipt,usable:false},error:null})})).status).toBe(409)
 expect((await request('GET',`/friends/${id}`,undefined,{searchLocationReceipt:async()=>({data:{...receipt,id:requestId},error:null})})).status).toBe(502)
 expect((await request('POST','/resolve',body,{resolveSearchArea:async()=>({data:{...receipt,latitude:0},error:null})})).status).toBe(502)
})
it('maps opt-in, expiry, quota and uncertain failures without claiming filters or home were saved',async()=>{
 const body={requestId,mode:'friends',source:'temporary',placeId:id}
 for(const [code,status] of [['LC403',403],['LC409',409],['LC429',429],['40P01',503],['PGRST202',503]] as const){
  const result=await request('POST','/resolve',body,{resolveSearchArea:async()=>({data:null,error:{code}})})
  expect(result.status).toBe(status)
 }
})
it('uses only fixed actor-JWT SDK RPCs and carries no actor or untrusted geocoder coordinates',async()=>{
 const calls:{name:string;body:unknown}[]=[]
 const fetch:typeof globalThis.fetch=vi.fn(async(input,init)=>{
  const name=new URL(String(input)).pathname.split('/').pop()!;calls.push({name,body:init?.body?JSON.parse(String(init.body)):null})
  expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer synthetic')
  expect(new Headers(init?.headers).get('apikey')).toBe('sb_publishable_test')
  return Response.json(name==='user'?{id:actorId}:receipt)
 })
 const transport=createUserContextTransport({url:'https://database.test',publicKey:'sb_publishable_test',fetch})
 const body={requestId,mode:'friends',source:'temporary',placeId:id}
 expect((await request('POST','/resolve',body,{},'synthetic',transport)).status).toBe(200)
 expect(calls).toEqual([{name:'user',body:null},{name:'resolve_search_area',body:{resolution_in:body}}])
})
