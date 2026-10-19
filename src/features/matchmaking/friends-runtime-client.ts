import { FriendsRuntimeSchema } from '../../../shared/friends-runtime'
import { apiUrl } from '../../platform/native'
export async function friendsRuntime(token:string,signal:AbortSignal){
 const controller=new AbortController(),abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();const timer=setTimeout(abort,15000)
 try{
  const response=await fetch(apiUrl('/api/matchmaking/friends-search-preferences/runtime'),{headers:{Authorization:`Bearer ${token}`},signal:controller.signal,cache:'no-store'})
  if(!response.ok||controller.signal.aborted)throw new Error('Friends runtime unavailable')
  return FriendsRuntimeSchema.parse(await response.json())
 }finally{clearTimeout(timer);signal.removeEventListener('abort',abort)}
}
