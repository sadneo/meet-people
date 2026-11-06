// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { emptyCommunity } from '../../src/features/garden/economy'
import { gardenFor, gardenStorageKey, hydrateGarden, retainGardenFor, updateGarden, useGarden } from '../../src/features/garden/state'
import * as persistence from '../../src/features/garden/persistence'
import type { GardenRecord } from '../../src/features/garden/persistence'

const current=vi.hoisted(()=>({owner:'garden-storage-test'}))
const records=vi.hoisted(()=>new Map<string,GardenRecord>())
vi.mock('../../src/features/garden/persistence',async()=>{
 const {parseCommunity}=await import('../../src/features/garden/economy')
 return {
  readGardenRecord:async(owner:string)=>structuredClone(records.get(owner)??null),
  transactGarden:async(owner:string,key:string,reduce:(community:GardenRecord['community'])=>GardenRecord['community'],active:()=>boolean)=>{
   if(!active())return null
   const before=structuredClone(records.get(owner)??{owner,community:parseCommunity(localStorage.getItem(key)),revision:0})
   const community=reduce(before.community),after=JSON.stringify(community)===JSON.stringify(before.community)?before:{owner,community,revision:before.revision+1}
   records.set(owner,structuredClone(after));return {before,after,cancelled:false}
  },
 }
})
vi.mock('../../src/ui/current',()=>({useCurrent:()=>({session:{user:{id:current.owner}}})}))

const owner='garden-storage-test'
const save=(balance:number,extra={})=>{const community={...emptyCommunity,balance,...extra};localStorage.setItem(gardenStorageKey(owner),JSON.stringify(community));records.set(owner,{owner,community,revision:(records.get(owner)?.revision??-1)+1})}
beforeEach(()=>{
 vi.restoreAllMocks();records.clear();localStorage.clear();retainGardenFor(null);retainGardenFor(owner)
 Object.defineProperty(navigator,'locks',{configurable:true,value:{request:vi.fn((_name:string,_options:LockOptions,callback:()=>unknown)=>Promise.resolve().then(callback))}})
})

it('rebases purchases on persisted balance even before storage notification arrives',async()=>{
 save(1000);gardenFor(owner)
 save(985,{owned:['bench'],purchaseCosts:{bench:15}})
 await updateGarden(owner,{type:'build',id:'river'})
 expect(gardenFor(owner).community).toMatchObject({balance:905,owned:['bench','river']})
})
it('does not overspend or charge for duplicate purchases from a stale snapshot',async()=>{
 save(1000);gardenFor(owner)
 save(5,{owned:['bench'],purchaseCosts:{bench:15}})
 await updateGarden(owner,{type:'build',id:'bench'})
 await updateGarden(owner,{type:'build',id:'river'})
 expect(gardenFor(owner).community).toMatchObject({balance:5,owned:['bench']})
})
it('preserves unique geodes and charges the latest balance',async()=>{
 save(1000);gardenFor(owner)
 save(700,{geodeUnlocks:['amethyst']})
 await updateGarden(owner,{type:'open-geode',random:0})
 expect(gardenFor(owner).community).toMatchObject({balance:400,geodeUnlocks:['amethyst','rose-quartz']})
})
it('refreshes storage changes with stable snapshots and ignores other accounts',async()=>{
 save(1000);const original=gardenFor(owner)
 expect(gardenFor(owner)).toBe(original)
 save(985,{owned:['bench']})
 window.dispatchEvent(new StorageEvent('storage',{key:gardenStorageKey(owner),storageArea:localStorage}))
 await vi.waitFor(()=>expect(gardenFor(owner).community.balance).toBe(985))
 const next=gardenFor(owner)
 expect(next.community.balance).toBe(985);expect(gardenFor(owner)).toBe(next)
 retainGardenFor('other');const other=gardenFor('other')
 window.dispatchEvent(new StorageEvent('storage',{key:gardenStorageKey(owner),storageArea:localStorage}))
 expect(gardenFor('other')).toBe(other)
 await updateGarden('other',{type:'demo-funds'})
 expect(JSON.parse(localStorage.getItem(gardenStorageKey(owner))!).balance).toBe(985)
 expect(gardenFor(owner).community.owned).toEqual(['bench'])
})
it('keeps the in-memory fallback when storage is denied and safely parses corrupt saves',async()=>{
 save(1000);gardenFor(owner)
 vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('denied')})
 vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('denied')})
 vi.spyOn(persistence,'transactGarden').mockRejectedValue(new Error('denied'))
 vi.spyOn(persistence,'readGardenRecord').mockRejectedValue(new Error('denied'))
 await updateGarden(owner,{type:'build',id:'bench'})
 await updateGarden(owner,{type:'build',id:'river'})
 expect(gardenFor(owner).community.balance).toBe(905)
 vi.restoreAllMocks();records.clear();retainGardenFor(null);retainGardenFor(owner)
 localStorage.setItem(gardenStorageKey(owner),'{broken')
 expect(gardenFor(owner).community).toEqual(emptyCommunity)
 await updateGarden(owner,{type:'demo-funds'})
 expect(gardenFor(owner).community.balance).toBe(1000)
})
it('ignores old-account dispatches after switching or signing out',async()=>{
 save(1000);current.owner=owner;retainGardenFor(owner)
 const hook=renderHook(()=>useGarden()),stale=hook.result.current.dispatch
 current.owner='other';retainGardenFor('other');hook.rerender()
 await act(async()=>{await stale({type:'build',id:'bench'})})
 expect(hook.result.current.state.community.balance).toBe(0)
 expect(JSON.parse(localStorage.getItem(gardenStorageKey(owner))!).owned).toEqual([])
 await act(async()=>{await hook.result.current.dispatch({type:'demo-funds'})})
 expect(hook.result.current.state.community.balance).toBe(1000)
 const signedOut=hook.result.current.dispatch;retainGardenFor(null)
 await act(async()=>{await signedOut({type:'demo-funds'})})
 expect(JSON.parse(localStorage.getItem(gardenStorageKey('other'))!).balance).toBe(1000)
 hook.unmount()
})
it('refuses a stale whole-snapshot undo and keeps failed-write fallback across mutations',async()=>{
 save(1000);const before=gardenFor(owner).community
 await updateGarden(owner,{type:'build',id:'bench'});const expected=gardenFor(owner).community
 save(905,{owned:['bench','river'],purchaseCosts:{bench:15,river:80}})
 await updateGarden(owner,{type:'restore-garden',community:before},expected)
 expect(gardenFor(owner).community).toMatchObject({balance:905,owned:['bench','river']})
 vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('quota')})
 vi.spyOn(persistence,'transactGarden').mockRejectedValue(new Error('quota'))
 await updateGarden(owner,{type:'build',id:'flowers'})
 await updateGarden(owner,{type:'build',id:'lanterns'})
 expect(gardenFor(owner).community.balance).toBe(875)
})
it('returns the actual mutation base so rebased unlocks and undo do not use a stale render',async()=>{
 save(1000);current.owner=owner;retainGardenFor(owner)
 const hook=renderHook(()=>useGarden())
 await act(async()=>{await hydrateGarden(owner)})
 save(700,{geodeUnlocks:['amethyst']})
 await act(async()=>{
  const result=await hook.result.current.dispatch({type:'open-geode',random:0})
  expect(result.before.community.geodeUnlocks).toEqual(['amethyst'])
  expect(result.after.community.geodeUnlocks).toEqual(['amethyst','rose-quartz'])
 })
 hook.unmount()
})
it('checks account generation again after waiting, even after switching away and back',async()=>{
 save(1000);gardenFor(owner)
 let enter!:()=>void
 vi.spyOn(navigator.locks,'request').mockImplementation((_name,_options,callback)=>new Promise(resolve=>{enter=()=>resolve(callback!({} as Lock))}))
 const pending=updateGarden(owner,{type:'build',id:'bench'})
 retainGardenFor('other');retainGardenFor(owner)
 enter()
 expect((await pending).cancelled).toBe(true)
 expect(JSON.parse(localStorage.getItem(gardenStorageKey(owner))!).owned).toEqual([])
 expect(gardenFor(owner).community.balance).toBe(1000)
})
it('does not confuse initial account retention with an obsolete hook scope',async()=>{
 save(1000);current.owner=owner;retainGardenFor('other')
 const hook=renderHook(()=>useGarden()),dispatch=hook.result.current.dispatch
 retainGardenFor(owner)
 await act(async()=>{expect((await dispatch({type:'build',id:'bench'})).cancelled).toBe(false)})
 retainGardenFor('other');retainGardenFor(owner)
 await act(async()=>{expect((await dispatch({type:'build',id:'river'})).cancelled).toBe(true)})
 expect(JSON.parse(localStorage.getItem(gardenStorageKey(owner))!).owned).toEqual(['bench'])
 hook.unmount()
})
for(const failure of ['unsupported','reject','throw'] as const)it(`never persists without safe locking (${failure}) and resolves ignored callers`,async()=>{
 save(1000);gardenFor(owner)
 const saved=localStorage.getItem(gardenStorageKey(owner)),warning=vi.fn()
 window.addEventListener('pebble:garden-storage-unavailable',warning)
 if(failure==='unsupported')Object.defineProperty(navigator,'locks',{configurable:true,value:undefined})
 else vi.spyOn(navigator.locks,'request').mockImplementation(()=>{if(failure==='throw')throw new Error('denied');return Promise.reject(new Error('denied'))})
 const first=await updateGarden(owner,{type:'build',id:'bench'}),second=await updateGarden(owner,{type:'build',id:'river'})
 expect(first.saved).toBe(false);expect(second.after.storageAvailable).toBe(false)
 expect(second.after.community).toMatchObject({balance:905,owned:['bench','river']})
 expect(localStorage.getItem(gardenStorageKey(owner))).toBe(saved)
 expect(warning).toHaveBeenCalledTimes(2)
 window.removeEventListener('pebble:garden-storage-unavailable',warning)
})
it('does not read a mutation snapshot before the exclusive lock is granted',async()=>{
 save(1000);gardenFor(owner)
 let enter!:()=>void
 vi.spyOn(navigator.locks,'request').mockImplementation((_name,_options,callback)=>new Promise(resolve=>{enter=()=>resolve(callback!({} as Lock))}))
 const pending=updateGarden(owner,{type:'build',id:'river'})
 save(985,{owned:['bench'],purchaseCosts:{bench:15}})
 enter()
 expect((await pending).after.community).toMatchObject({balance:905,owned:['bench','river']})
 expect(navigator.locks.request).toHaveBeenCalledWith(gardenStorageKey(owner),{mode:'exclusive'},expect.any(Function))
})
