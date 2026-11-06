import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { useCurrent } from '../../ui/current'
import { COMMUNITY_STORAGE_KEY, parseCommunity, type Community } from './economy'
import { gardenReducer, type GardenAction } from './reducer'
import { recordGardenDay } from './history'
import { readGardenRecord, transactGarden, type GardenRecord } from './persistence'

type GardenState={community:Community;storageAvailable:boolean;ready:boolean;revision:number}
export type GardenTransaction={before:GardenState;after:GardenState;cancelled:boolean;saved:boolean}
const cache=new Map<string,GardenState>(),listeners=new Set<()=>void>()
const memoryOnly=new Set<string>(),scopes=new Map<string,object>(),loading=new Map<string,Promise<void>>()
const channel=(()=>{try{return typeof BroadcastChannel==='undefined'?null:new BroadcastChannel('pebble:garden:commits:v1')}catch{return null}})()
let retainedOwner:string|null|undefined
let accountGeneration=0
const subscribe=(notify:()=>void)=>{listeners.add(notify);return()=>{listeners.delete(notify)}}
export const gardenStorageKey=(owner:string)=>`${COMMUNITY_STORAGE_KEY}:${owner}`
export function gardenFor(owner:string){
 if(!scopes.has(owner))scopes.set(owner,{})
 let state=cache.get(owner)
 if(!state){let community=parseCommunity(null);try{community=parseCommunity(localStorage.getItem(gardenStorageKey(owner)))}catch{/* A readable IndexedDB record may still exist. */}state={community,storageAvailable:true,ready:false,revision:-1};cache.set(owner,state)}
 return state
}
export function retainGardenFor(owner:string|null){if(retainedOwner!==owner)accountGeneration++;retainedOwner=owner;for(const key of cache.keys())if(key!==owner){cache.delete(key);memoryOnly.delete(key);scopes.delete(key);loading.delete(key)}if(owner&&cache.has(owner)&&!cache.get(owner)!.ready){loading.delete(owner);void hydrateGarden(owner)}}
function publish(owner:string,record:GardenRecord){
 const current=gardenFor(owner)
 if(record.revision<current.revision)return current
 if(current.ready&&current.storageAvailable&&record.revision===current.revision)return current
 const next={community:record.community,storageAvailable:true,ready:true,revision:record.revision}
 cache.set(owner,next)
 for(const notify of listeners)notify()
 return next
}
async function refreshGarden(owner:string){
 const scope=scopes.get(owner)
 if(!scope||memoryOnly.has(owner))return
 try{const record=await readGardenRecord(owner);if(record&&scopes.get(owner)===scope&&!memoryOnly.has(owner))publish(owner,record)}catch{/* Mutations and hydration surface unavailable storage. */}
}
if(channel)channel.onmessage=event=>{const owner=event.data?.owner;if(typeof owner==='string')void refreshGarden(owner)}
if(typeof window!=='undefined')window.addEventListener('storage',event=>{
 try{if(event.storageArea&&event.storageArea!==localStorage)return}catch{return}
 for(const owner of cache.keys())if(event.key===null||event.key===gardenStorageKey(owner))void refreshGarden(owner)
})
async function changeGarden(owner:string,action?:GardenAction,expected?:Community):Promise<GardenTransaction>{
 const generation=accountGeneration,initial=cache.get(owner)??{community:parseCommunity(null),storageAvailable:false,ready:false,revision:-1}
 const active=()=>generation===accountGeneration&&(retainedOwner===undefined||retainedOwner===owner)
 const cancelled=():GardenTransaction=>({before:initial,after:initial,cancelled:true,saved:false})
 if(!active())return cancelled()
 gardenFor(owner)
 const reduce=(community:Community)=>!action||action.type==='restore-garden'&&(!expected||JSON.stringify(expected)!==JSON.stringify(community))?community:gardenReducer({community},action).community
 let committed:GardenTransaction|undefined
 try{
  if(memoryOnly.has(owner)||!navigator.locks?.request)throw new Error('Safe Garden persistence unavailable')
  return await navigator.locks.request(gardenStorageKey(owner),{mode:'exclusive'},async()=>{
   if(!active())return cancelled()
   const result=await transactGarden(owner,gardenStorageKey(owner),reduce,active)
   if(!result||!active())return cancelled()
   const before={community:result.before.community,storageAvailable:true,ready:true,revision:result.before.revision}
   const next={community:result.after.community,storageAvailable:true,ready:true,revision:result.after.revision}
   committed={before:result.before.revision===result.after.revision?next:before,after:next,cancelled:false,saved:true}
   // Only committed IndexedDB state may update this compatibility mirror. Never
   // use it as a transaction source after migration, even on storage events.
   if(action)try{localStorage.setItem(gardenStorageKey(owner),JSON.stringify(result.after.community))}catch{/* The IndexedDB commit must not be undone or replayed. */}
   const after=publish(owner,result.after)
   committed={...committed,before:result.before.revision===result.after.revision?after:before,after}
   if(action){recordGardenDay(owner,after.community);try{channel?.postMessage({owner,revision:result.after.revision})}catch{/* Storage events also refresh readers. */}}
   return committed
  })
 }catch{
  if(!active())return cancelled()
  if(committed)return committed
  if(!memoryOnly.has(owner))try{const record=await readGardenRecord(owner);if(record&&active())publish(owner,record)}catch{/* Keep the readable in-memory/legacy baseline. */}
  if(!active())return cancelled()
  memoryOnly.add(owner)
  const before=gardenFor(owner),after={...before,community:reduce(before.community),storageAvailable:false,ready:true}
  cache.set(owner,after);window.dispatchEvent(new Event('pebble:garden-storage-unavailable'))
  for(const notify of listeners)notify()
  return {before,after,cancelled:false,saved:false}
 }
}
export function updateGarden(owner:string,action:GardenAction,expected?:Community){return changeGarden(owner,action,expected)}
export function hydrateGarden(owner:string){
 let pending=loading.get(owner)
 if(!pending){pending=changeGarden(owner).then(()=>{});loading.set(owner,pending)}
 return pending
}
export function useGarden(){
 const owner=useCurrent().session.user.id
 const state=useSyncExternalStore(subscribe,useCallback(()=>gardenFor(owner),[owner]))
 useEffect(()=>{void hydrateGarden(owner)},[owner])
 useEffect(()=>{if(state.ready&&state.storageAvailable)recordGardenDay(owner,state.community)},[owner,state.community,state.storageAvailable,state.ready])
 const scope=scopes.get(owner)
 return {owner,state,dispatch:(action:GardenAction)=>scopes.get(owner)!==scope||retainedOwner!==undefined&&retainedOwner!==owner?Promise.resolve({before:state,after:state,cancelled:true,saved:false}):updateGarden(owner,action,state.community)}
}
