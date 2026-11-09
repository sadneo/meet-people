import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { useCurrent } from '../../ui/current'
import { COMMUNITY_STORAGE_KEY, loadCommunity, parseCommunity, type Community } from './economy'
import { gardenReducer, type GardenAction } from './reducer'
import { recordGardenDay } from './history'
import { authorizedRequest } from '../../auth/authorizedRequest'
import { GardenResponseSchema, type GardenResponse, type GardenCommand, type GardenRewardAction } from '../../../shared/garden'

type GardenState = { community:Community; remote?:GardenResponse; pending:boolean; error:string; preview:boolean; generation:object; storageAvailable:boolean; undoRevision?:number }
export type GardenTransaction={before:GardenState;after:GardenState;cancelled:boolean;saved:boolean}
const cache=new Map<string,GardenState>(),listeners=new Set<()=>void>()
const queues=new Map<string,Promise<unknown>>(),controllers=new Map<string,Set<AbortController>>()
const refreshes=new Map<string,{scope:object;promise:Promise<Community|null>}>(),confirmedAt=new Map<string,number>()
const DISPLAY_FRESH_MS=30_000
let retainedOwner:string|null|undefined
const subscribe=(notify:()=>void)=>{listeners.add(notify);return()=>{listeners.delete(notify)}}
const publish=(owner:string,state:GardenState)=>{cache.set(owner,state);for(const notify of listeners)notify()}
export const gardenStorageKey=(owner:string)=>`${COMMUNITY_STORAGE_KEY}:${owner}`
export const accountGardenKey=(owner:string)=>`pebble:account-garden:v1:${owner}`
export function gardenFor(owner:string){
 let state=cache.get(owner)
 if(!state){state={community:loadCommunity(gardenStorageKey(owner)),pending:false,error:'',preview:false,generation:{},storageAvailable:true};cache.set(owner,state)}
 return state
}
const active=(owner:string,scope:object)=>cache.get(owner)?.generation===scope&&(retainedOwner===undefined||retainedOwner===owner)
export function retainGardenFor(owner:string|null){
 retainedOwner=owner
 for(const key of cache.keys())if(key!==owner){
  for(const controller of controllers.get(key)??[])controller.abort()
  cache.delete(key);queues.delete(key);refreshes.delete(key);confirmedAt.delete(key)
 }
}
function enqueue<T>(owner:string,work:()=>Promise<T>):Promise<T>{
 const next=(queues.get(owner)??Promise.resolve()).catch(()=>undefined).then(work)
 queues.set(owner,next)
 void next.finally(()=>{if(queues.get(owner)===next)queues.delete(owner)}).catch(()=>undefined)
 return next
}
async function requestGarden(owner:string,scope:object,command?:GardenCommand){
 if(!active(owner,scope))return null
 const initial=gardenFor(owner)
 publish(owner,{...initial,pending:true,error:''})
 const controller=new AbortController(),timeout=window.setTimeout(()=>controller.abort(),15000)
 if(!controllers.has(owner))controllers.set(owner,new Set())
 controllers.get(owner)!.add(controller)
 try{
  const remote=await authorizedRequest('/api/garden',GardenResponseSchema,{body:command,signal:controller.signal,expectedUserId:owner})
  if(!active(owner,scope))return null
  if(controller.signal.aborted)throw new DOMException('Request cancelled','AbortError')
  const community=parseCommunity(JSON.stringify(remote.community))
  let storageAvailable=true
  try{
   const raw=JSON.stringify(community)
   if(localStorage.getItem(accountGardenKey(owner))!==raw)localStorage.setItem(accountGardenKey(owner),raw)
   storageAvailable=recordGardenDay(owner,community)
  }catch{storageAvailable=false}
  // Local storage is a display cache only. No browser write can credit the wallet.
  const ownUndo=command&&!['check-in','profile-reward','connection-reward','keep-in-touch'].includes(command.action)
  const preserveUndo=!initial.remote||initial.undoRevision===initial.remote.revision
  const undoRevision=remote.canUndo&&(ownUndo||(preserveUndo&&(!!command||!initial.remote||initial.remote.revision===remote.revision)))?remote.revision:undefined
  const after={...initial,community,remote,pending:false,error:'',preview:false,storageAvailable,undoRevision}
  confirmedAt.set(owner,Date.now())
  publish(owner,after)
  return after
 }catch{
  if(active(owner,scope))publish(owner,{...initial,pending:false,error:'Your Garden could not be confirmed. Refresh before making another change.'})
  return null
 }finally{window.clearTimeout(timeout);controllers.get(owner)?.delete(controller)}
}
export function refreshGarden(owner:string){
 const scope=gardenFor(owner).generation
 const shared=refreshes.get(owner)
 if(shared?.scope===scope)return shared.promise
 const promise=enqueue(owner,async()=> (await requestGarden(owner,scope))?.community??null)
 const entry={scope,promise};refreshes.set(owner,entry)
 void promise.finally(()=>{if(refreshes.get(owner)===entry)refreshes.delete(owner)}).catch(()=>undefined)
 return promise
}
export function ensureGarden(owner:string){
 const current=gardenFor(owner),age=Date.now()-(confirmedAt.get(owner)??-Infinity)
 if(current.remote&&!current.error&&!current.preview&&!current.pending&&age>=0&&age<DISPLAY_FRESH_MS)return Promise.resolve(current.community)
 return refreshGarden(owner)
}
// Storage events signal another tab; always fetch authority from the account service.
if(typeof window!=='undefined')window.addEventListener('storage',event=>{
 try{if(event.storageArea&&event.storageArea!==localStorage)return}catch{return}
 for(const [owner,state] of cache)if(!state.preview&&active(owner,state.generation)&&(event.key===null||event.key===accountGardenKey(owner)))void refreshGarden(owner)
})
async function serialized<T>(owner:string,work:()=>Promise<T>):Promise<T>{
 let entered=false,result:Promise<T>|undefined
 const run=()=>{entered=true;result=work();return result}
 try{
  if(navigator.locks?.request)return await navigator.locks.request(accountGardenKey(owner),{mode:'exclusive'},run)
 }catch{if(entered)return result!}
 // Web Locks improve same-browser ordering, but PostgreSQL locks/revisions remain authoritative.
 return run()
}
export function earnPebbles(owner:string,action:GardenRewardAction){
 refreshes.delete(owner)
 const scope=gardenFor(owner).generation
 return enqueue(owner,()=>serialized(owner,async()=>{
  if(!active(owner,scope))return null
  const current=gardenFor(owner)
  if(!current.remote||current.error||current.preview)return null
  const before=await requestGarden(owner,scope)
  if(!before?.remote)return null
  return (await requestGarden(owner,scope,{action,revision:before.remote.revision,requestId:crypto.randomUUID()}))?.community??null
 }))
}
export function updateGarden(owner:string,action:GardenAction,expected?:Community):Promise<GardenTransaction>{
 // A later read must not reuse a refresh queued before this mutation.
 refreshes.delete(owner)
 const initial=gardenFor(owner),scope=initial.generation,expectedRevision=initial.remote?.revision
 const cancelled=():GardenTransaction=>({before:initial,after:initial,cancelled:true,saved:false})
 return enqueue(owner,()=>serialized(owner,async()=>{
  if(!active(owner,scope))return cancelled()
  let before=gardenFor(owner)
  if((import.meta.env.DEV||import.meta.env.VITE_DEV_TOOLS==='true')&&(action.type==='demo-funds'||before.preview)){
   const reduced=action.type==='restore-garden'&&(!expected||JSON.stringify(expected)!==JSON.stringify(before.community))?before:gardenReducer(before,action)
   const after={...before,...reduced,preview:true,error:''}
   publish(owner,after)
   return {before,after,cancelled:false,saved:false}
  }
  if(!before.remote||before.error||action.type==='demo-funds')return cancelled()
  const latest=await requestGarden(owner,scope)
  if(!latest?.remote)return cancelled()
  before=latest
  if(action.type==='restore-garden'&&(latest.remote.revision!==expectedRevision||latest.undoRevision!==latest.remote.revision))return {before,after:before,cancelled:false,saved:false}
  // Resolve relative keyboard movement only after queued predecessors and the latest account read.
  const base={requestId:crypto.randomUUID(),revision:latest.remote.revision}
  const command:GardenCommand=action.type==='build'?{...base,action:'build',id:action.id}
   :action.type==='remove-garden-item'?{...base,action:'remove',id:action.id}
   :action.type==='open-geode'?{...base,action:'geode'}
   :action.type==='reset-purchases'?{...base,action:'reset'}
   :action.type==='restore-garden'?{...base,action:'undo'}
   :{...base,action:'move',id:action.id,position:gardenReducer(before,action).community.positions![action.id]!}
  const after=await requestGarden(owner,scope,command)
  return after?{before,after,cancelled:false,saved:true}:cancelled()
 }))
}
export function useGarden(){
 const owner=useCurrent().session.user.id
 const state=useSyncExternalStore(subscribe,useCallback(()=>gardenFor(owner),[owner]))
 const scope=state.generation
 useEffect(()=>{
  void ensureGarden(owner)
  const focus=()=>{const current=cache.get(owner);if(current&&active(owner,scope)&&!current.pending&&!current.preview)void refreshGarden(owner)}
  const visible=()=>{if(document.visibilityState==='visible')focus()}
  const timer=window.setInterval(visible,60000)
  window.addEventListener('focus',focus);document.addEventListener('visibilitychange',visible)
  return()=>{window.clearInterval(timer);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',visible)}
 },[owner,scope])
 return {owner,state,dispatch:(action:GardenAction)=>active(owner,scope)?updateGarden(owner,action,state.community):Promise.resolve({before:state,after:state,cancelled:true,saved:false}),refresh:()=>active(owner,scope)?refreshGarden(owner):Promise.resolve(null),earn:(action:GardenRewardAction)=>active(owner,scope)?earnPebbles(owner,action):Promise.resolve(null),available:(!!state.remote||state.preview)&&!state.pending&&!state.error}
}
