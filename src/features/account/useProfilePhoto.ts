import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAccount } from '../../auth/account-context'
import { profilePhotoClient } from './profile-photo-client'
export const photoChangedEvent='pebble:profile-photo-changed'
/** Private decoded URLs are shared only inside the signed-in account's query
 * cache. Query removal, replacement and sign-out revoke them. */
export function useProfilePhoto(peer?:{owner:string;revision?:number}){
 const account=useAccount(),owner=account?.loaded?account.session?.user.id??null:null,token=owner?account?.session?.access_token??null:null
 const client=useMemo(()=>token?profilePhotoClient(token):null,[token]),target=peer?.owner??owner,revision=peer?.revision,peerMode=peer!==undefined
 const query=useQuery({
  queryKey:['profile-photo',target,peerMode?'peer':'own',revision??'current'],
  enabled:!!client&&!!target,
  staleTime:30_000,
  queryFn:async({signal})=>{
   let url:string|null=null
   try{
    const snapshot=revision===undefined?(peerMode?await client!.reference(target!,signal):await client!.state(signal)):null
    if(snapshot?.hasPhoto||revision!==undefined&&revision>0){
     const blob=await client!.image(target!,revision??snapshot!.revision,signal)
     if(signal.aborted)throw new Error('Photo read cancelled')
     url=URL.createObjectURL(blob)
     const image=new Image();image.src=url
     if(typeof image.decode==='function')await image.decode()
    }
    if(signal.aborted)throw new Error('Photo read cancelled')
    return{snapshot,url}
   }catch(error){if(url)URL.revokeObjectURL(url);throw error}
  },
 })
 const {refetch}=query
 const reload=useCallback(async()=>{const result=await refetch();return result.isError?null:result.data?.snapshot??null},[refetch])
 return{snapshot:query.data?.snapshot??null,url:query.isError?null:query.data?.url??null,error:query.error instanceof Error?query.error.message:'',loading:!!client&&(query.isPending||query.isFetching),reload,client,owner}
}
