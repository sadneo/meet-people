import { z } from 'zod'
import { DatingRuntimeSchema,DatingCandidateResultSchema,DatingEnableSchema,type DatingEnable } from '../../../shared/dating-live'
import { ConnectionStateSchema } from '../../../shared/connections'
import { apiUrl } from '../../platform/native'
import { DatingScoringSettingsResponseSchema, SaveDatingScoringSettingsSchema, type SaveDatingScoringSettings } from '../../../shared/dating-scoring'
export class DatingLiveError extends Error{constructor(readonly status:number,message:string){super(message)}}
export function datingLiveClient(token:string){
 async function request<T>(path:string,schema:z.ZodType<T>,body?:unknown,method='POST',signal?:AbortSignal):Promise<T>{
  const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();const timer=setTimeout(abort,15000)
  try{
   const response=await fetch(apiUrl('/api/matchmaking/dating'+path),{method:body===undefined?'GET':method,headers:{Authorization:`Bearer ${token}`,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal,cache:'no-store'})
   const data:unknown=await response.json().catch(()=>null)
   if(controller.signal.aborted)throw new Error('Aborted')
   if(!response.ok){const failure=z.object({error:z.string().max(200)}).strict().safeParse(data);throw new DatingLiveError(response.status,failure.success?failure.data.error:'Dating could not be confirmed. Reload before retrying.')}
   const parsed=schema.safeParse(data);if(!parsed.success)throw new DatingLiveError(502,'Dating response could not be confirmed.');return parsed.data
  }catch(error){if(error instanceof DatingLiveError&&!controller.signal.aborted)throw error;throw new DatingLiveError(503,'Dating could not be confirmed. Reload before retrying.')}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort)}
 }
 const status=(signal?:AbortSignal)=>request('/status',DatingRuntimeSchema,undefined,'GET',signal)
 return{status,
  scoringSettings:(signal?:AbortSignal)=>request('/scoring-settings',DatingScoringSettingsResponseSchema,undefined,'GET',signal),
  saveScoringSettings:(value:SaveDatingScoringSettings,signal?:AbortSignal)=>request('/scoring-settings',DatingScoringSettingsResponseSchema,SaveDatingScoringSettingsSchema.parse(value),'PUT',signal),
  candidate:(excludedIds:string[],signal?:AbortSignal)=>request('/candidate',DatingCandidateResultSchema,{excludedIds},'POST',signal),
  connect:(target:string,signal?:AbortSignal)=>request(`/requests/${encodeURIComponent(target)}`,ConnectionStateSchema,{},'POST',signal),
  async enable(value:DatingEnable,signal?:AbortSignal){
   const saved=await request('/enabled',DatingRuntimeSchema,DatingEnableSchema.parse(value),'PUT',signal)
   if(saved.aggregate.profileRevision!==value.expectedProfileRevision+1||saved.aggregate.searchRevision!==value.expectedSearchRevision+1||saved.aggregate.profile.enabled!==value.enabled)throw new DatingLiveError(502,'Dating participation could not be confirmed. Reload before retrying.')
   try{const current=await status(signal);if(current.aggregate.profileRevision!==saved.aggregate.profileRevision||current.aggregate.searchRevision!==saved.aggregate.searchRevision||current.aggregate.profile.enabled!==value.enabled)throw new Error('Changed readback');return current}
   catch{throw new DatingLiveError(503,'Dating participation may already be saved. Reload before retrying.')}
  },
 }
}
