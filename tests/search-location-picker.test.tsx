// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import type { Session } from '@supabase/supabase-js'
import { AccountContext } from '../src/auth/account-context'
import { accountFixture, requiredPreferences } from './complete-profile-fixture'
import { SearchLocationPicker } from '../src/features/matchmaking/SearchLocationPicker'
const owner='ab000000-0000-4000-8000-000000000001',place='ac000000-0000-4000-8000-000000000001'
const receipt={id:place,mode:'friends' as const,source:'home' as const,areaLabel:'Home campus',method:'geocoded-area' as const,expiresAt:'2030-01-01T00:00:00Z',usable:true}
let resolved:ReturnType<typeof vi.fn>,pending:ReturnType<typeof vi.fn>,calls:{path:string;method:string;body:any;token:string|null}[],readFailure:boolean,holdResolve:((response:Response)=>void)|null,late:boolean
function tree(deviceAllowed=false,id=owner){
 const account=accountFixture({username:'synthetic',display_name:'Synthetic',bio:null,avatar_url:null,...requiredPreferences});account.settings.location=deviceAllowed
 const session={access_token:id+'-token',user:{id}} as Session
 return <MemoryRouter><AccountContext.Provider value={{session,account,loaded:true,busy:false,error:'',save:async()=>false,reload(){}}}><SearchLocationPicker mode="friends" source="home" area="Home campus" reference={null} disabled={false} resolved={resolved} clear={()=>{}} pending={pending}/></AccountContext.Provider></MemoryRouter>
}
beforeEach(()=>{
 resolved=vi.fn();pending=vi.fn();calls=[];readFailure=false;holdResolve=null;late=false
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(String(input),'http://test'),method=init?.method??'GET';calls.push({path:url.pathname,method,body:init?.body?JSON.parse(String(init.body)):null,token:new Headers(init?.headers).get('Authorization')})
  if(url.pathname.endsWith('/places'))return Response.json({places:[{id:place,label:'Home campus',region:'Synthetic region'}]})
  if(url.pathname.endsWith('/resolve'))return late?new Promise<Response>(resolve=>{holdResolve=resolve}):Response.json(receipt)
  if(url.pathname.endsWith('/browser'))return Response.json({...receipt,source:'temporary',areaLabel:'Current approximate location',method:'device-reported'})
  if(url.pathname.includes('/friends/')){
   if(readFailure){readFailure=false;return Response.json({error:'Readback unavailable.'},{status:503})}
   const device=calls.some(call=>call.path.endsWith('/browser'))
   return Response.json(device?{...receipt,source:'temporary',areaLabel:'Current approximate location',method:'device-reported'}:receipt)
  }
  throw new Error('Unexpected endpoint')
 }))
})
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks()})
it('does not request device coordinates or issue a location on mount; device use requires saved opt-in',()=>{
 const gps=vi.fn();vi.stubGlobal('navigator',{geolocation:{getCurrentPosition:gps}})
 render(tree())
 expect(gps).not.toHaveBeenCalled();expect(calls).toEqual([])
 expect(screen.getByRole('button',{name:'Use device location'})).toHaveProperty('disabled',true)
 expect(screen.getByRole('link',{name:'Enable nearby suggestions in Settings'})).toBeTruthy()
})
it('looks up and confirms an area through POST plus authoritative receipt GET, without profile/filter/queue writes',async()=>{
 render(tree());fireEvent.click(screen.getByRole('button',{name:'Find areas'}))
 fireEvent.click(await screen.findByRole('button',{name:/Home campus.*Use this area/}))
 await waitFor(()=>expect(resolved).toHaveBeenCalledWith(receipt))
 expect(calls.map(call=>call.method)).toEqual(['GET','POST','GET'])
 expect(calls[1].body).toEqual({requestId:expect.any(String),mode:'friends',source:'home',placeId:place})
 expect(calls.every(call=>call.token==='Bearer '+owner+'-token'&&call.path.startsWith('/api/matchmaking/search-locations/'))).toBe(true)
 expect(screen.getByText(/Save your filters to use this choice/)).toBeTruthy()
})
it('fences a late location response after an owner change',async()=>{
 late=true;const view=render(tree());fireEvent.click(screen.getByRole('button',{name:'Find areas'}));fireEvent.click(await screen.findByRole('button',{name:/Use this area/}))
 await waitFor(()=>expect(holdResolve).not.toBeNull())
 view.rerender(tree(false,'ab000000-0000-4000-8000-000000000002'))
 await act(async()=>{holdResolve?.(Response.json(receipt))})
 expect(resolved).not.toHaveBeenCalled();expect(calls.filter(call=>call.path.includes('/friends/'))).toHaveLength(0)
 expect(screen.queryByText(/Selected area:/)).toBeNull()
})
it('requests GPS only on explicit action and retains zero coordinates as device-reported evidence',async()=>{
 const gps=vi.fn((success:PositionCallback)=>success({coords:{latitude:0,longitude:0,accuracy:20},timestamp:Date.now()} as GeolocationPosition))
 vi.stubGlobal('navigator',{geolocation:{getCurrentPosition:gps}})
 render(tree(true));expect(gps).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Use device location'}))
 await waitFor(()=>expect(resolved).toHaveBeenCalled())
 expect(gps).toHaveBeenCalledTimes(1)
 expect(calls[0].body).toMatchObject({mode:'friends',latitude:0,longitude:0,accuracyMeters:20,consent:true})
 expect(resolved.mock.calls[0][0]).toMatchObject({source:'temporary',method:'device-reported'})
})
it('does not upload a late GPS reading after opt-out or dismissal',async()=>{
 let succeed:PositionCallback|undefined
 vi.stubGlobal('navigator',{geolocation:{getCurrentPosition:vi.fn((success:PositionCallback)=>{succeed=success})}})
 const view=render(tree(true));fireEvent.click(screen.getByRole('button',{name:'Use device location'}));view.rerender(tree(false))
 await act(async()=>{succeed?.({coords:{latitude:0,longitude:0,accuracy:20},timestamp:Date.now()} as GeolocationPosition)})
 expect(calls).toEqual([]);expect(resolved).not.toHaveBeenCalled();view.unmount()
})
it('retries uncertain confirmation with the same actor request ID and no extra GPS read',async()=>{
 readFailure=true;const gps=vi.fn((success:PositionCallback)=>success({coords:{latitude:0,longitude:0,accuracy:20},timestamp:Date.now()} as GeolocationPosition))
 vi.stubGlobal('navigator',{geolocation:{getCurrentPosition:gps}})
 render(tree(true));fireEvent.click(screen.getByRole('button',{name:'Use device location'}))
 fireEvent.click(await screen.findByRole('button',{name:'Retry location confirmation'}))
 await waitFor(()=>expect(resolved).toHaveBeenCalledTimes(1))
 const writes=calls.filter(call=>call.method==='POST');expect(writes).toHaveLength(2);expect(writes[1].body).toEqual(writes[0].body)
 expect(gps).toHaveBeenCalledTimes(1)
})
