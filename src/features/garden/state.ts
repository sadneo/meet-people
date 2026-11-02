import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { useCurrent } from '../../ui/current'
import { COMMUNITY_STORAGE_KEY, loadCommunity, type Community } from './economy'
import { gardenReducer, type GardenAction } from './reducer'
import { recordGardenDay } from './history'

const cache=new Map<string,{community:Community}>(),listeners=new Set<()=>void>()
const subscribe=(notify:()=>void)=>{listeners.add(notify);return()=>{listeners.delete(notify)}}
export const gardenStorageKey=(owner:string)=>`${COMMUNITY_STORAGE_KEY}:${owner}`
export function gardenFor(owner:string){
 let state=cache.get(owner)
 if(!state){state={community:loadCommunity(gardenStorageKey(owner))};cache.set(owner,state)}
 return state
}
export function retainGardenFor(owner:string|null){for(const key of cache.keys())if(key!==owner)cache.delete(key)}
export function updateGarden(owner:string,action:GardenAction){
 const next=gardenReducer(gardenFor(owner),action);cache.set(owner,next)
 try{localStorage.setItem(gardenStorageKey(owner),JSON.stringify(next.community));recordGardenDay(owner,next.community)}
 catch{window.dispatchEvent(new Event('pebble:garden-storage-unavailable'))}
 for(const notify of listeners)notify()
}
export function useGarden(){
 const owner=useCurrent().session.user.id
 const state=useSyncExternalStore(subscribe,useCallback(()=>gardenFor(owner),[owner]))
 useEffect(()=>{recordGardenDay(owner,state.community)},[owner,state.community])
 return {owner,state,dispatch:(action:GardenAction)=>updateGarden(owner,action)}
}
