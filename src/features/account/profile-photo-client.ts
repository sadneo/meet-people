import { z } from 'zod'
import { ProfilePhotoStateSchema } from '../../../shared/profile-photo'
import { apiUrl } from '../../platform/native'
export class ProfilePhotoError extends Error{constructor(readonly status:number,message:string){super(message)}}
export function profilePhotoClient(token:string){
 async function request(path:string,init:RequestInit={},signal?:AbortSignal,binary=false){
  const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();const timer=setTimeout(abort,20000)
  try{
   if(controller.signal.aborted)throw new Error('Aborted')
   const response=await fetch(apiUrl('/api/matchmaking/profile-photo'+path),{...init,headers:{Authorization:`Bearer ${token}`,...init.headers},cache:'no-store',signal:controller.signal})
   if(controller.signal.aborted)throw new Error('Aborted')
   if(!response.ok){const data:unknown=await response.json().catch(()=>null),parsed=z.object({error:z.string().max(200)}).strict().safeParse(data);throw new ProfilePhotoError(response.status,parsed.success?parsed.data.error:'Photo could not be confirmed. Reload before retrying.')}
   if(binary){
    if(response.headers.get('content-type')?.split(';')[0]!=='image/jpeg')throw new ProfilePhotoError(502,'Photo response could not be confirmed.')
    const blob=await response.blob();if(blob.size>262144)throw new ProfilePhotoError(502,'Photo response is too large.');return blob
   }
   return ProfilePhotoStateSchema.parse(await response.json())
  }catch(error){if(error instanceof ProfilePhotoError&&!controller.signal.aborted)throw error;throw new ProfilePhotoError(503,'Photo storage could not be confirmed. Reload before retrying.')}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort)}
 }
 return{
  reference:async(owner:string,signal?:AbortSignal)=>ProfilePhotoStateSchema.parse(await request(`/reference/${encodeURIComponent(owner)}`,{},signal)),
  state:async(signal?:AbortSignal)=>ProfilePhotoStateSchema.parse(await request('',{},signal)),
  image:async(owner:string,revision:number,signal?:AbortSignal)=>await request(`/${encodeURIComponent(owner)}/${revision}`,{},signal,true) as Blob,
  save:async(file:File|null,revision:number,requestId:string,signal?:AbortSignal)=>{
   const saved=ProfilePhotoStateSchema.parse(await request(`?${new URLSearchParams({expectedRevision:String(revision),requestId})}`,{method:file?'PUT':'DELETE',...(file?{body:file,headers:{'Content-Type':file.type}}:{})},signal))
   if(saved.revision!==revision+1||saved.hasPhoto!==!!file)throw new ProfilePhotoError(502,'Photo save could not be confirmed. Reload before retrying.')
   try{const confirmed=ProfilePhotoStateSchema.parse(await request('',{},signal));if(confirmed.revision!==saved.revision||confirmed.hasPhoto!==saved.hasPhoto||confirmed.updatedAt!==saved.updatedAt)throw new Error('Changed readback');return confirmed}
   catch{throw new ProfilePhotoError(503,'The photo may already be saved. Reload its current state before retrying.')}
  },
 }
}
