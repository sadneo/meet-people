import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useAccount } from '../../auth/account-context'
import { BrowserSearchLocationSchema, type BrowserSearchLocation, type ResolveSearchArea, type SearchLocationReceipt } from '../../../shared/search-locations'
import { SearchLocationError, searchLocationClient } from './search-location-client'

type Props={mode:'friends'|'dating';source:'home'|'temporary';area:string;reference:string|null;disabled:boolean;resolved:(value:SearchLocationReceipt)=>void;clear:()=>void;pending:(value:boolean)=>void}
export function SearchLocationPicker(props:Props){
 const account=useAccount(),session=account?.loaded?account.session:null
 if(!session?.user.id||!session.access_token)return <p className="mfs-explanation">Sign in to choose a search location.</p>
 // Scope every callback, result and captured GPS reading to the canonical owner,
 // token and exact area. None survive changing identity/home/source or dismissal.
 return <LocationResource key={`${session.user.id}:${session.access_token}:${props.mode}:${props.source}:${props.area}:${account!.account.settings.location}`} {...props} token={session.access_token} deviceAllowed={account!.account.settings.location} />
}
function LocationResource({token,deviceAllowed,...props}:Props&{token:string;deviceAllowed:boolean}){
 const client=useMemo(()=>searchLocationClient(token),[token])
 const [places,setPlaces]=useState<{id:string;label:string;region:string}[]|null>(null),[receipt,setReceipt]=useState<SearchLocationReceipt|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const [retry,setRetry]=useState<ResolveSearchArea|BrowserSearchLocation|null>(null)
 const live=useRef(false),lock=useRef(false),operation=useRef<AbortController|null>(null),callbacks=useRef(props),currentReceipt=useRef(receipt)
 callbacks.current=props;currentReceipt.current=receipt
 useEffect(()=>{live.current=true;return()=>{live.current=false;operation.current?.abort();callbacks.current.pending(false)}},[])
 useEffect(()=>{
  if(!props.reference){setReceipt(null);return}
  if(currentReceipt.current?.id===props.reference)return
  const controller=new AbortController();operation.current?.abort();operation.current=controller
  setError('');setBusy(true);lock.current=true;callbacks.current.pending(true)
  void client.receipt(props.mode,props.reference,controller.signal).then(value=>{
   if(!live.current||controller.signal.aborted)return
   if(value.mode!==props.mode||value.source!==props.source||value.areaLabel!==props.area)throw new Error('Changed binding')
   setReceipt(value)
   if(!value.usable)setError('This search location expired or changed. Choose it again.')
  }).catch(()=>{if(live.current&&!controller.signal.aborted)setError('The selected location could not be checked. Choose it again before relying on distance.')})
   .finally(()=>{if(live.current&&operation.current===controller){lock.current=false;setBusy(false);callbacks.current.pending(false)}})
  return()=>controller.abort()
 },[client,props.reference,props.mode,props.source,props.area])
 function start(){if(!live.current||lock.current||props.disabled)return null;const controller=new AbortController();operation.current?.abort();operation.current=controller;lock.current=true;setBusy(true);setError('');callbacks.current.pending(true);return controller}
 function finish(controller:AbortController){if(live.current&&operation.current===controller){lock.current=false;setBusy(false);callbacks.current.pending(false)}}
 async function lookup(){const controller=start();if(!controller)return;setRetry(null)
  try{const result=await client.lookup(props.area,controller.signal);if(live.current&&!controller.signal.aborted)setPlaces(result.places)}
  catch(failure){if(live.current&&!controller.signal.aborted)setError(failure instanceof Error?failure.message:'Search areas could not be loaded.')}
  finally{finish(controller)}
 }
 async function confirm(value:ResolveSearchArea|BrowserSearchLocation,controller:AbortController){
  try{
   const saved='placeId'in value?await client.resolve(value,controller.signal):await client.browser(value,controller.signal)
   if(!live.current||controller.signal.aborted)return
   if(saved.mode!==props.mode||('placeId'in value&&saved.source!==props.source)||saved.source==='home'&&saved.areaLabel!==props.area)throw new SearchLocationError(409,'Your home changed. Look up the area again.')
   setReceipt(saved);setPlaces(null);setRetry(null);callbacks.current.resolved(saved)
  }catch(failure){if(live.current&&!controller.signal.aborted){setError(failure instanceof Error?failure.message:'Location could not be confirmed.');setRetry(failure instanceof SearchLocationError&&failure.status>=500?value:null)}}
  finally{finish(controller)}
 }
 function choose(placeId:string){const controller=start();if(controller)void confirm({requestId:crypto.randomUUID(),mode:props.mode,source:props.source,placeId},controller)}
 async function device(){
  if(!deviceAllowed)return
  const controller=start();if(!controller)return
  if(!navigator.geolocation){setError('Device location is unavailable in this browser. Choose an area instead.');finish(controller);return}
  try{
   const position=await new Promise<GeolocationPosition>((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:10000,maximumAge:0}))
   if(!live.current||controller.signal.aborted)return
   const parsed=BrowserSearchLocationSchema.safeParse({requestId:crypto.randomUUID(),mode:props.mode,latitude:position.coords.latitude,longitude:position.coords.longitude,accuracyMeters:position.coords.accuracy,observedAt:new Date(position.timestamp).toISOString(),consent:true})
   if(!parsed.success){setError('The device reading is too imprecise. Choose a city or campus instead.');finish(controller);return}
   await confirm(parsed.data,controller)
  }catch(failure){if(live.current&&!controller.signal.aborted){setError(typeof failure==='object'&&failure!==null&&'code'in failure&&failure.code===1?'Location access was denied. Choose an area instead.':'Device location could not be read. Choose an area instead.');finish(controller)}}
 }
 return <div className="mfs-location-resolution">
  <div className="mfs-location-actions"><button type="button" className="mfs-reset" disabled={props.disabled||busy||!props.area.trim()} onClick={()=>void lookup()}>Find areas</button><button type="button" className="mfs-reset" disabled={props.disabled||busy||!deviceAllowed} onClick={()=>void device()}>Use device location</button></div>
  {!deviceAllowed&&<p className="mfs-explanation"><Link to="/settings">Enable nearby suggestions in Settings</Link> to use device location.</p>}
  {busy&&<p role="status">Checking search location…</p>}
  {error&&<p className="mfs-error" role="alert">{error}</p>}
  {places!==null&&(places.length?<ul className="mfs-location-results" aria-label="Search areas">{places.map(place=><li key={place.id}><button type="button" disabled={props.disabled||busy} onClick={()=>choose(place.id)}><strong>{place.label}</strong>{place.region&&<small>{place.region}</small>}<span>Use this area</span></button></li>)}</ul>:<p role="status">No search areas found. Try a different city or campus.</p>)}
  {receipt&&<p className="mfs-explanation" role="status">{receipt.method==='device-reported'?'Approximate device location':'Selected area'}: {receipt.areaLabel}. {receipt.usable?<>Valid until <time dateTime={receipt.expiresAt}>{new Date(receipt.expiresAt).toLocaleString()}</time>.</>:'Choose this area again before using distance.'}</p>}
  {(props.reference||receipt)&&<button type="button" className="mfs-reset" disabled={props.disabled||busy} onClick={()=>{setReceipt(null);setRetry(null);setError('');callbacks.current.clear()}}>Clear chosen location</button>}
  {retry&&<button type="button" className="mfs-reset" disabled={props.disabled||busy} onClick={()=>{const controller=start();if(controller)void confirm(retry,controller)}}>Retry location confirmation</button>}
  <p className="mfs-explanation">Distance compares selected search areas, not where someone is now. Save your filters to use this choice.</p>
 </div>
}
