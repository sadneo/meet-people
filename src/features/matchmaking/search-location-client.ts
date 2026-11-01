import { z, type ZodType } from 'zod'
import { BrowserSearchLocationSchema, ResolveSearchAreaSchema, SearchLocationReceiptSchema, SearchPlacesSchema, type BrowserSearchLocation, type ResolveSearchArea } from '../../../shared/search-locations'
import { apiUrl } from '../../platform/native'
import { MapConfigSchema, MapSuggestionsSchema, MapPreviewSchema, MapSelectionSchema, type MapSuggestionsRequest, type MapPreviewRequest, type MapTicket } from '../../../shared/location-picker'
export class SearchLocationError extends Error { constructor(readonly status: number,message: string){super(message)} }
export function searchLocationClient(token: string) {
 async function request<T>(path: string,schema: ZodType<T>,body?: unknown,signal?: AbortSignal):Promise<T>{
  const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort()
  const timer=setTimeout(abort,15000)
  try{
   const response=await fetch(apiUrl('/api/matchmaking/search-locations'+path),{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${token}`,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal,cache:'no-store'})
   const data:unknown=await response.json().catch(()=>null)
   if(controller.signal.aborted)throw new Error('Aborted')
   if(!response.ok){const parsed=z.object({error:z.string().max(200),code:z.string().max(30).optional()}).strict().safeParse(data);throw new SearchLocationError(response.status,parsed.success?parsed.data.error:'Location could not be confirmed. Try the selection again.')}
   const parsed=schema.safeParse(data);if(!parsed.success)throw new SearchLocationError(502,'Location response could not be confirmed.')
   return parsed.data
  }catch(error){if(error instanceof SearchLocationError&&!controller.signal.aborted)throw error;throw new SearchLocationError(503,'Location could not be confirmed. Retry this selection before saving it.')}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort)}
 }
 const receipt=async(mode:'friends'|'dating',reference:string,signal?:AbortSignal)=>{
  const value=await request(`/${mode}/${encodeURIComponent(reference)}`,SearchLocationReceiptSchema,undefined,signal)
  if(value.id!==reference.toLowerCase()||value.mode!==mode)throw new SearchLocationError(502,'Location receipt could not be confirmed.')
  return value
 }
 async function confirm(value:ResolveSearchArea|BrowserSearchLocation,path:'/resolve'|'/browser',signal?:AbortSignal){
  const issued=await request(path,SearchLocationReceiptSchema,value,signal)
  if(issued.mode!==value.mode||('source'in value&&issued.source!==value.source)||(!('source'in value)&&(issued.source!=='temporary'||issued.method!=='device-reported')))throw new SearchLocationError(502,'The selected location could not be confirmed.')
  const saved=await receipt(value.mode,issued.id,signal)
  if(!saved.usable)throw new SearchLocationError(409,'That search location expired or changed. Choose it again.')
  if(saved.source!==issued.source||saved.areaLabel!==issued.areaLabel||saved.method!==issued.method||saved.expiresAt!==issued.expiresAt)throw new SearchLocationError(503,'Location readback changed. Choose the area again before saving.')
  return saved
 }
  return{lookup:(query:string,signal?:AbortSignal)=>request(`/places?${new URLSearchParams({q:query})}`,SearchPlacesSchema,undefined,signal),receipt,
  mapConfig: (signal?: AbortSignal) => request('/map/config', MapConfigSchema, undefined, signal),
  suggestions: (value: MapSuggestionsRequest, signal?: AbortSignal) => request('/map/suggestions', MapSuggestionsSchema, value, signal),
  preview: (value: MapPreviewRequest, signal?: AbortSignal) => request('/map/preview', MapPreviewSchema, value, signal),
  mapSelection: (mode: 'friends' | 'dating', reference: string, signal?: AbortSignal) => request(`/map/${mode}/${encodeURIComponent(reference)}`, MapSelectionSchema, undefined, signal),
  confirmMap: async (mode: 'friends' | 'dating', ticket: MapTicket, signal?: AbortSignal) => {
    const issued = await request('/map/confirm', SearchLocationReceiptSchema, { mode, ticket }, signal)
    if (issued.mode !== mode || issued.method !== 'selected-area' || issued.source !== 'temporary' || !issued.usable) throw new SearchLocationError(502, 'Map selection could not be confirmed.')
    const saved = await receipt(mode, issued.id, signal)
    if (saved.mode !== issued.mode || saved.areaLabel !== issued.areaLabel || saved.method !== issued.method || saved.source !== issued.source || !saved.usable || saved.expiresAt !== issued.expiresAt) throw new SearchLocationError(503, 'Map selection readback changed. Reload before saving.')
    return saved
  },
 resolve:(value:ResolveSearchArea,signal?:AbortSignal)=>confirm(ResolveSearchAreaSchema.parse(value),'/resolve',signal),
 browser:(value:BrowserSearchLocation,signal?:AbortSignal)=>confirm(BrowserSearchLocationSchema.parse(value),'/browser',signal)}
}
