import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { useCurrent } from '../../ui/current'
import { COMMUNITY_STORAGE_KEY, loadCommunity, parseCommunity, type Community } from './economy'
import { gardenReducer, type GardenAction } from './reducer'
import { recordGardenDay } from './history'
import { authorizedRequest } from '../../auth/authorizedRequest'
import { GardenResponseSchema, type GardenResponse, type GardenCommand, type GardenRewardAction } from '../../../shared/garden'

type State = { community: Community; remote?: GardenResponse; pending: boolean; error: string; preview: boolean; generation: object }
const cache=new Map<string,State>(),listeners=new Set<()=>void>()
const subscribe=(notify:()=>void)=>{listeners.add(notify);return()=>{listeners.delete(notify)}}
const publish=(owner:string,state:State)=>{cache.set(owner,state);for(const notify of listeners)notify()}
// Never turn the original device-only save into trusted account currency.
export const gardenStorageKey=(owner:string)=>`${COMMUNITY_STORAGE_KEY}:${owner}`
export const accountGardenKey=(owner:string)=>`pebble:account-garden:v1:${owner}`
export function gardenFor(owner:string){
 let state=cache.get(owner)
 if(!state){state={community:loadCommunity(gardenStorageKey(owner)),pending:false,error:'',preview:false,generation:{}};cache.set(owner,state)}
 return state
}
export function retainGardenFor(owner:string|null){for(const key of cache.keys())if(key!==owner)cache.delete(key)}
async function requestGarden(owner:string,command?:GardenCommand){
 const initial=gardenFor(owner)
 if(initial.pending)return null
 publish(owner,{...initial,pending:true,error:''})
 const controller=new AbortController(),timeout=window.setTimeout(()=>controller.abort(),15000)
 try{
  const remote=await authorizedRequest('/api/garden',GardenResponseSchema,{body:command,signal:controller.signal})
  if(cache.get(owner)?.generation!==initial.generation)return null
  const community=parseCommunity(JSON.stringify(remote.community))
  publish(owner,{...initial,community,remote,pending:false,error:'',preview:false})
  try{localStorage.setItem(accountGardenKey(owner),JSON.stringify(community));recordGardenDay(owner,community)}catch{/* Server save remains valid without a device cache. */}
  return community
 }catch{
  if(cache.get(owner)?.generation===initial.generation)publish(owner,{...initial,pending:false,error:'Your Garden could not be confirmed. Refresh before making another change.'})
  return null
 }finally{window.clearTimeout(timeout)}
}
export const refreshGarden=(owner:string)=>requestGarden(owner)
export async function earnPebbles(owner:string,action:GardenRewardAction){
 const current=gardenFor(owner)
 if(!current.remote||current.pending||current.error||current.preview)return null
 return requestGarden(owner,{action,revision:current.remote.revision,requestId:crypto.randomUUID()})
}
export async function updateGarden(owner:string,action:GardenAction){
 const current=gardenFor(owner)
 // Existing dev currency is an isolated preview, never an account credit.
 if(current.pending)return null
 if((import.meta.env.DEV||import.meta.env.VITE_DEV_TOOLS==='true')&&(action.type==='demo-funds'||current.preview)){
  const next=gardenReducer(current,action)
  publish(owner,{...current,...next,preview:true,error:''})
  return next.community
 }
 if(!current.remote||current.pending||current.error||action.type==='demo-funds')return null
 const base={requestId:crypto.randomUUID(),revision:current.remote.revision}
 const command:GardenCommand=action.type==='build'?{...base,action:'build',id:action.id}
  :action.type==='remove-garden-item'?{...base,action:'remove',id:action.id}
  :action.type==='open-geode'?{...base,action:'geode'}
  :action.type==='reset-purchases'?{...base,action:'reset'}
  :action.type==='restore-garden'?{...base,action:'undo'}
  :{...base,action:'move',id:action.id,position:action.position}
 return requestGarden(owner,command)
}
export function useGarden(){
 const owner=useCurrent().session.user.id
 const state=useSyncExternalStore(subscribe,useCallback(()=>gardenFor(owner),[owner]))
 useEffect(()=>{
  void refreshGarden(owner)
  const focus=()=>{const current=gardenFor(owner);if(!current.pending&&!current.preview)void refreshGarden(owner)}
  const visible=()=>{if(document.visibilityState==='visible')focus()}
  // Refresh eligibility while the Garden is visible, including the UTC reset boundary.
  const timer=window.setInterval(visible,60000)
  window.addEventListener('focus',focus);document.addEventListener('visibilitychange',visible)
  return()=>{window.clearInterval(timer);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',visible)}
 },[owner])
 return {owner,state,dispatch:(action:GardenAction)=>updateGarden(owner,action),refresh:()=>refreshGarden(owner),earn:(action:GardenRewardAction)=>earnPebbles(owner,action),available:(!!state.remote||state.preview)&&!state.pending&&!state.error}
}
