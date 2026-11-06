// @vitest-environment jsdom
// State/transport contract tests. The server below is a fixture, not a database proof.
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { emptyCommunity, type Community } from '../../src/features/garden/economy'
import { gardenReducer, type GardenAction } from '../../src/features/garden/reducer'
import { gardenFor, gardenStorageKey, accountGardenKey, retainGardenFor, refreshGarden, updateGarden, useGarden } from '../../src/features/garden/state'
import type { GardenCommand, GardenResponse } from '../../shared/garden'
const current=vi.hoisted(()=>({owner:'garden-storage-test'}))
const transport=vi.hoisted(()=>({request:vi.fn()}))
vi.mock('../../src/ui/current',()=>({useCurrent:()=>({session:{user:{id:current.owner}}})}))
vi.mock('../../src/auth/authorizedRequest',()=>({authorizedRequest:transport.request}))
const owner='garden-storage-test'
let server:GardenResponse
const setServer=(community:Community)=>{server={...server,revision:server.revision+1,community:{...community,geodeUnlocks:community.geodeUnlocks??[],positions:community.positions??{},purchaseCosts:community.purchaseCosts??{},freshStart:true}}}
const posts=()=>transport.request.mock.calls.filter(call=>call[2]?.body)
beforeEach(()=>{
 vi.restoreAllMocks();transport.request.mockReset();localStorage.clear();retainGardenFor(null);retainGardenFor(owner);current.owner=owner
 server={revision:0,canUndo:false,community:{...emptyCommunity,balance:300,positions:{},purchaseCosts:{},geodeUnlocks:[],freshStart:true},rewards:{day:'2026-11-05',nextCheckIn:'2026-11-06T00:00:00Z',checkedIn:false,weekDays:0,weeklyBonus:false,profileEligible:true,profileClaimed:false}}
 transport.request.mockImplementation(async(_url,_schema,options:{body?:GardenCommand;signal:AbortSignal;expectedUserId:string})=>{
  if(options.signal.aborted)throw new DOMException('Cancelled','AbortError')
  if(options.expectedUserId!==current.owner)throw new Error('Wrong session')
  const c=options.body
  if(c){
   if(c.revision!==server.revision)throw new Error('Stale revision')
   const action:GardenAction=c.action==='build'?{type:'build',id:c.id as 'bench'}:c.action==='geode'?{type:'open-geode',random:0}:c.action==='move'?{type:'move-community-item',id:c.id as 'pebble',position:c.position!}:{type:'reset-purchases'}
   const next=gardenReducer(server,action).community
   if(next===server.community)throw new Error('Rejected purchase')
   setServer(next);server.canUndo=c.action!=='geode'
  }
  return structuredClone(server)
 })
 Object.defineProperty(navigator,'locks',{configurable:true,value:{request:vi.fn((_name:string,_options:LockOptions,callback:()=>unknown)=>Promise.resolve().then(callback))}})
})
afterEach(()=>{cleanup();retainGardenFor(null)})
it('rebases purchases on the latest server balance before an external notification arrives',async()=>{
 await refreshGarden(owner);setServer({...emptyCommunity,balance:985,owned:['bench'],purchaseCosts:{bench:15}})
 const result=await updateGarden(owner,{type:'build',id:'river'})
 expect(result.before.community.owned).toEqual(['bench']);expect(result.after.community).toMatchObject({balance:905,owned:['bench','river']});expect(result.saved).toBe(true)
})
it('does not overspend or charge for duplicate purchases from a stale render',async()=>{
 await refreshGarden(owner);setServer({...emptyCommunity,balance:5,owned:['bench'],purchaseCosts:{bench:15}})
 expect((await updateGarden(owner,{type:'build',id:'bench'})).cancelled).toBe(true)
 await refreshGarden(owner);expect((await updateGarden(owner,{type:'build',id:'river'})).cancelled).toBe(true)
 expect(server.community).toMatchObject({balance:5,owned:['bench']})
})
it('reports actual before/after unlocks, rather than a stale rendered choice',async()=>{
 await refreshGarden(owner);setServer({...emptyCommunity,balance:700,geodeUnlocks:['amethyst']})
 const result=await updateGarden(owner,{type:'open-geode',random:.99})
 expect(result.before.community.geodeUnlocks).toEqual(['amethyst']);expect(result.after.community).toMatchObject({balance:400,geodeUnlocks:['amethyst','rose-quartz']})
 expect(posts()[0][2].body).not.toHaveProperty('random')
})
it('storage notifications fetch the server, never trust edited cache, and ignore other owners',async()=>{
 await refreshGarden(owner);const before=gardenFor(owner)
 expect(gardenFor(owner)).toBe(before)
 localStorage.setItem(accountGardenKey(owner),JSON.stringify({...emptyCommunity,balance:999999}))
 window.dispatchEvent(new StorageEvent('storage',{key:accountGardenKey(owner),storageArea:localStorage}))
 await vi.waitFor(()=>expect(gardenFor(owner).pending).toBe(false))
 await refreshGarden(owner);expect(gardenFor(owner).community.balance).toBe(300)
 const count=transport.request.mock.calls.length
 window.dispatchEvent(new StorageEvent('storage',{key:accountGardenKey('other'),storageArea:localStorage}))
 await Promise.resolve();expect(transport.request).toHaveBeenCalledTimes(count)
})
it('denied local storage does not turn an account-backed purchase into an unsaved local fallback',async()=>{
 await refreshGarden(owner)
 vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('Denied')})
 vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('Denied')})
 const result=await updateGarden(owner,{type:'build',id:'bench'})
 expect(result.saved).toBe(true);expect(result.after.storageAvailable).toBe(false);expect(server.community.balance).toBe(285)
})
it('corrupt legacy data cannot credit the account; preview funds never write to the server',async()=>{
 localStorage.setItem(gardenStorageKey(owner),'{broken');expect(gardenFor(owner).community).toEqual(emptyCommunity)
 await refreshGarden(owner);await updateGarden(owner,{type:'demo-funds'})
 expect(gardenFor(owner).community.balance).toBe(1300);expect(posts()).toHaveLength(0)
 expect(localStorage.getItem(gardenStorageKey(owner))).toBe('{broken');await refreshGarden(owner);expect(gardenFor(owner).community.balance).toBe(300)
})
it('stale hook dispatches cannot write after account switch, sign-out, or switching away and back',async()=>{
 const hook=renderHook(()=>useGarden());await act(async()=>{await refreshGarden(owner)})
 const stale=hook.result.current.dispatch
 current.owner='other';retainGardenFor('other');hook.rerender();await act(async()=>{await refreshGarden('other')})
 await act(async()=>{expect((await stale({type:'build',id:'bench'})).cancelled).toBe(true)})
 const signedOut=hook.result.current.dispatch;retainGardenFor(null)
 await act(async()=>{expect((await signedOut({type:'demo-funds'})).cancelled).toBe(true)})
 current.owner=owner;retainGardenFor(owner);hook.rerender()
 await act(async()=>{expect((await stale({type:'build',id:'bench'})).cancelled).toBe(true)})
 expect(posts()).toHaveLength(0)
})
it('refuses stale whole-snapshot Undo without sending it to the server',async()=>{
 await refreshGarden(owner);const old=gardenFor(owner).community;await updateGarden(owner,{type:'build',id:'bench'});const expected=gardenFor(owner).community
 setServer({...emptyCommunity,balance:205,owned:['bench','river'],purchaseCosts:{bench:15,river:80}})
 const count=posts().length,result=await updateGarden(owner,{type:'restore-garden',community:old},expected)
 expect(result.after.community).toMatchObject({balance:205,owned:['bench','river']});expect(posts()).toHaveLength(count);expect(gardenFor(owner).undoRevision).toBeUndefined()
})
it('checks account scope after waiting for a lock, even after switching away and back',async()=>{
 await refreshGarden(owner);let enter!:()=>void
 vi.spyOn(navigator.locks,'request').mockImplementation((_name,_options,callback)=>new Promise(resolve=>{enter=()=>resolve(callback!({} as Lock))}))
 const pending=updateGarden(owner,{type:'build',id:'bench'});await vi.waitFor(()=>expect(enter).toBeDefined())
 retainGardenFor('other');retainGardenFor(owner);enter()
 expect((await pending).cancelled).toBe(true);expect(posts()).toHaveLength(0)
})
it('does not confuse initial account retention with an obsolete hook scope',async()=>{
 retainGardenFor('other');const hook=renderHook(()=>useGarden()),dispatch=hook.result.current.dispatch
 retainGardenFor(owner);await act(async()=>{await refreshGarden(owner);expect((await dispatch({type:'build',id:'bench'})).cancelled).toBe(false)})
 retainGardenFor('other');retainGardenFor(owner)
 await act(async()=>{expect((await dispatch({type:'build',id:'river'})).cancelled).toBe(true)})
 expect(posts()).toHaveLength(1)
})
for(const failure of ['unsupported','reject','throw'] as const)it(`uses server revision protection when Web Locks are ${failure}`,async()=>{
 await refreshGarden(owner)
 if(failure==='unsupported')Object.defineProperty(navigator,'locks',{configurable:true,value:undefined})
 else vi.spyOn(navigator.locks,'request').mockImplementation(()=>{if(failure==='throw')throw new Error('Denied');return Promise.reject(new Error('Denied'))})
 await updateGarden(owner,{type:'build',id:'bench'});const result=await updateGarden(owner,{type:'build',id:'river'})
 expect(result.saved).toBe(true);expect(result.after.community).toMatchObject({balance:205,owned:['bench','river']});expect(posts()).toHaveLength(2)
})
it('reads the mutation base after the exclusive lock is granted',async()=>{
 await refreshGarden(owner);let enter!:()=>void
 vi.spyOn(navigator.locks,'request').mockImplementation((_name,_options,callback)=>new Promise(resolve=>{enter=()=>resolve(callback!({} as Lock))}))
 const pending=updateGarden(owner,{type:'build',id:'river'});await vi.waitFor(()=>expect(enter).toBeDefined())
 setServer({...emptyCommunity,balance:285,owned:['bench'],purchaseCosts:{bench:15}});enter()
 expect((await pending).after.community).toMatchObject({balance:205,owned:['bench','river']})
 expect(navigator.locks.request).toHaveBeenCalledWith(accountGardenKey(owner),{mode:'exclusive'},expect.any(Function))
})
it('aborts in-flight old-account work and rejects late responses without repopulating its cache',async()=>{
 let finish!:(response:GardenResponse)=>void,signal:AbortSignal|undefined
 transport.request.mockImplementationOnce((_url,_schema,options)=>{signal=options.signal;return new Promise(resolve=>{finish=resolve})})
 const pending=refreshGarden(owner);await vi.waitFor(()=>expect(finish).toBeDefined())
 retainGardenFor('other');expect(signal?.aborted).toBe(true);finish(structuredClone(server))
 expect(await pending).toBeNull();expect(localStorage.getItem(accountGardenKey(owner))).toBeNull()
})
it('queued keyboard deltas use each completed predecessor position',async()=>{
 await refreshGarden(owner)
 await Promise.all(Array.from({length:5},()=>updateGarden(owner,{type:'nudge-community-item',id:'pebble',delta:{x:12,y:0}})))
 expect(gardenFor(owner).community.positions?.pebble?.x).toBe(780)
 expect(posts()).toHaveLength(5)
})
it('an uncertain write is never automatically retried',async()=>{
 await refreshGarden(owner)
 transport.request.mockImplementation(async(_url,_schema,options)=>{if(options.body)throw new Error('Lost response');return structuredClone(server)})
 expect((await updateGarden(owner,{type:'build',id:'bench'})).cancelled).toBe(true)
 expect(posts()).toHaveLength(1);expect(gardenFor(owner).error).toContain('could not be confirmed')
})
