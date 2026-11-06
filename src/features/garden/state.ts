import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { useCurrent } from '../../ui/current'
import { COMMUNITY_STORAGE_KEY, parseCommunity, type Community } from './economy'
import { gardenReducer, type GardenAction } from './reducer'
import { recordGardenDay } from './history'

type GardenState={community:Community;storageAvailable:boolean}
export type GardenTransaction={before:GardenState;after:GardenState;cancelled:boolean;saved:boolean}
const cache=new Map<string,GardenState>(),listeners=new Set<()=>void>()
const persisted=new Map<string,string|null>()
const memoryOnly=new Set<string>()
const scopes=new Map<string,object>()
let retainedOwner:string|null|undefined
let accountGeneration=0
const subscribe=(notify:()=>void)=>{listeners.add(notify);return()=>{listeners.delete(notify)}}
export const gardenStorageKey=(owner:string)=>`${COMMUNITY_STORAGE_KEY}:${owner}`
function refreshGarden(owner:string){
 if(memoryOnly.has(owner))return
 try{
  const raw=localStorage.getItem(gardenStorageKey(owner))
  if(!cache.has(owner)||persisted.get(owner)!==raw){cache.set(owner,{community:parseCommunity(raw),storageAvailable:true});persisted.set(owner,raw)}
 }catch{memoryOnly.add(owner)}
}
export function gardenFor(owner:string){
 if(!scopes.has(owner))scopes.set(owner,{})
 let state=cache.get(owner)
 if(!state){refreshGarden(owner);state=cache.get(owner)??{community:parseCommunity(null),storageAvailable:false};cache.set(owner,state)}
 return state
}
export function retainGardenFor(owner:string|null){if(retainedOwner!==owner)accountGeneration++;retainedOwner=owner;for(const key of cache.keys())if(key!==owner){cache.delete(key);persisted.delete(key);memoryOnly.delete(key);scopes.delete(key)}}
if(typeof window!=='undefined')window.addEventListener('storage',event=>{
 try{if(event.storageArea&&event.storageArea!==localStorage)return}catch{return}
 for(const owner of cache.keys())if(event.key===null||event.key===gardenStorageKey(owner))refreshGarden(owner)
 for(const notify of listeners)notify()
})
export async function updateGarden(owner:string,action:GardenAction,expected?:Community):Promise<GardenTransaction>{
 const generation=accountGeneration,initial=cache.get(owner)??{community:parseCommunity(null),storageAvailable:false}
 const active=()=>generation===accountGeneration&&(retainedOwner===undefined||retainedOwner===owner)
 const cancelled=():GardenTransaction=>({before:initial,after:initial,cancelled:true,saved:false})
 if(!active())return cancelled()
 let completed:GardenTransaction|undefined
 const transact=(locked:boolean):GardenTransaction=>{
  // Recheck after waiting: an old account must never repopulate caches or write.
  if(!active())return cancelled()
  if(!locked){gardenFor(owner);memoryOnly.add(owner)}
  refreshGarden(owner)
  const before=gardenFor(owner)
  // Undo restores a whole snapshot, so it requires the exact state it replaced.
  const reduced=action.type==='restore-garden'&&(!expected||JSON.stringify(expected)!==JSON.stringify(before.community))?before:gardenReducer(before,action)
  let saved=false
  if(!memoryOnly.has(owner)){
   try{const raw=JSON.stringify(reduced.community);localStorage.setItem(gardenStorageKey(owner),raw);persisted.set(owner,raw);saved=true}
   catch{memoryOnly.add(owner)}
  }
  const after={community:reduced.community,storageAvailable:saved}
  cache.set(owner,after)
  completed={before,after,cancelled:false,saved}
  if(saved)recordGardenDay(owner,after.community)
  else window.dispatchEvent(new Event('pebble:garden-storage-unavailable'))
  for(const notify of listeners)notify()
  return completed
 }
 try{
  if(memoryOnly.has(owner)||!navigator.locks?.request)return transact(false)
  // All same-origin Garden writers use this account-keyed exclusive lock.
  const result=await navigator.locks.request(gardenStorageKey(owner),{mode:'exclusive'},()=>transact(true))
  return active()?result:cancelled()
 }catch{
  // Never write without a lock, retry a mutation, or reject ignored dev-tool calls.
  return active()?(completed??transact(false)):cancelled()
 }
}
export function useGarden(){
 const owner=useCurrent().session.user.id
 const state=useSyncExternalStore(subscribe,useCallback(()=>gardenFor(owner),[owner]))
 useEffect(()=>{if(state.storageAvailable)recordGardenDay(owner,state.community)},[owner,state.community,state.storageAvailable])
 const scope=scopes.get(owner)
 return {owner,state,dispatch:(action:GardenAction)=>scopes.get(owner)!==scope||retainedOwner!==undefined&&retainedOwner!==owner?Promise.resolve({before:state,after:state,cancelled:true,saved:false}):updateGarden(owner,action,state.community)}
}
