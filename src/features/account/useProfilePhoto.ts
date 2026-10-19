import { useCallback,useEffect,useMemo,useState } from 'react'
import { useAccount } from '../../auth/account-context'
import type { ProfilePhotoState } from '../../../shared/profile-photo'
import { profilePhotoClient } from './profile-photo-client'
export const photoChangedEvent='pebble:profile-photo-changed'
/** Object URLs are session scoped, aborted and revoked; no localStorage or public URL. */
export function useProfilePhoto(peer?:{owner:string;revision?:number}){
 const account=useAccount(),owner=account?.loaded?account.session?.user.id??null:null,token=owner?account?.session?.access_token??null:null
 const client=useMemo(()=>token?profilePhotoClient(token):null,[token]),target=peer?.owner??owner,revision=peer?.revision,peerMode=peer!==undefined
 const scope=`${owner}:${token}:${target}:${peerMode?revision??'current':'own'}`
 const [epoch,setEpoch]=useState(0),[state,setState]=useState<{scope:string;snapshot:ProfilePhotoState|null;url:string|null;error:string;loading:boolean}>({scope:'',snapshot:null,url:null,error:'',loading:true})
 const reload=useCallback(()=>setEpoch(value=>value+1),[])
 useEffect(()=>{const changed=(event:Event)=>{if(event instanceof CustomEvent&&event.detail===target)reload()};window.addEventListener(photoChangedEvent,changed);return()=>window.removeEventListener(photoChangedEvent,changed)},[target,reload])
 useEffect(()=>{
  if(!client||!target)return
  const controller=new AbortController();let live=true,url:string|null=null
  setState(previous=>({scope,snapshot:previous.scope===scope?previous.snapshot:null,url:null,error:'',loading:true}))
  void(async()=>{
   try{
    const snapshot=revision===undefined?(peerMode?await client.reference(target,controller.signal):await client.state(controller.signal)):null
    if(!live||controller.signal.aborted)return
    if(snapshot?.hasPhoto||revision!==undefined&&revision>0){const blob=await client.image(target,revision??snapshot!.revision,controller.signal);if(!live||controller.signal.aborted)return;url=URL.createObjectURL(blob)}
    if(live)setState({scope,snapshot,url,error:'',loading:false})
   }catch(failure){if(live&&!controller.signal.aborted)setState(previous=>({scope,snapshot:previous.scope===scope?previous.snapshot:null,url:null,error:failure instanceof Error?failure.message:'Photo unavailable.',loading:false}))}
  })()
  return()=>{live=false;controller.abort();if(url)URL.revokeObjectURL(url)}
 },[client,target,revision,peerMode,scope,epoch])
 return{...(state.scope===scope?state:{snapshot:null,url:null,error:'',loading:!!client}),reload,client,owner}
}
