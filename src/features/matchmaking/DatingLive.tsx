import { CardIcon } from './MatchCardIcon'
import { useEffect,useMemo,useRef,useState,type ReactNode } from 'react'
import { Link } from 'react-router'
import type { DatingCandidate,DatingRuntime } from '../../../shared/dating-live'
import type { ConnectionState } from '../../../shared/connections'
import { datingLiveClient } from './dating-live-client'
import { DatingPreferences } from './DatingPreferences'
import { useProfilePhoto } from '../account/useProfilePhoto'
import { conversationPath } from '../messaging/client'
import { Icon } from '../prototype/ui'
export function DatingLive({initial,token,selector,accountBusy}:{initial:DatingRuntime;token:string;selector:ReactNode;accountBusy:boolean}){
 const client=useMemo(()=>datingLiveClient(token),[token]),[runtime,setRuntime]=useState(initial),[candidate,setCandidate]=useState<DatingCandidate|null>(null),[skipped,setSkipped]=useState<string[]>([])
 const [searched,setSearched]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false),[filter,setFilter]=useState(false),[connection,setConnection]=useState<ConnectionState|null>(null)
 const active=useRef(false),locked=useRef(false),controller=useRef<AbortController|null>(null)
 useEffect(()=>{active.current=true;return()=>{active.current=false;controller.current?.abort()}},[])
 async function run(operation:(signal:AbortSignal)=>Promise<void>){
  if(locked.current||accountBusy)return
  const abort=new AbortController();controller.current=abort;locked.current=true;setBusy(true);setError('')
  try{await operation(abort.signal)}catch(failure){if(active.current&&!abort.signal.aborted){setError(failure instanceof Error?failure.message:'Dating could not be confirmed.');setCandidate(null);setConnection(null);setSearched(false)}}
  finally{if(active.current){locked.current=false;setBusy(false)}}
 }
 function reload(){void run(async signal=>{const next=await client.status(signal);if(active.current&&!signal.aborted){setRuntime(next);setCandidate(null);setConnection(null);setUncertain(false);setSearched(false)}})}
 function toggle(){void run(async signal=>{
  setUncertain(true);setCandidate(null);setConnection(null)
  const next=await client.enable({expectedProfileRevision:runtime.aggregate.profileRevision,expectedSearchRevision:runtime.aggregate.searchRevision,enabled:!runtime.aggregate.profile.enabled},signal)
  if(active.current&&!signal.aborted){setRuntime(next);setUncertain(false);setSearched(false);setSkipped([])}
 })}
 function find(excluded=skipped){void run(async signal=>{
  setCandidate(null);setConnection(null);setSearched(false)
  const current=await client.status(signal)
  if(!active.current||signal.aborted)return
  setRuntime(current)
  if(!current.aggregate.effectiveEnabled||!current.canStart){setError('Complete your Dating setup and start discovery before searching.');setSearched(false);return}
  const result=await client.candidate(excluded,signal)
  if(active.current&&!signal.aborted){setCandidate(result.candidate);setSearched(true);setSkipped(excluded)}
 })}
 function connect(){if(!candidate)return;const id=candidate.id;void run(async signal=>{
  setUncertain(true)
  const saved=await client.connect(id,signal)
  if(active.current&&!signal.aborted){setConnection(saved);setUncertain(false)}
 })}
 const enabled=runtime.aggregate.profile.enabled,effective=enabled&&runtime.aggregate.effectiveEnabled&&runtime.canStart,blocked=busy||accountBusy
 return <section className="match-home match-calm dating-view dating-live-view" aria-labelledby="dating-live-title">
  <div className="dating-deck-focus">
   <header className="dating-overlay-header"><h1 id="dating-live-title" className="pt-sr-only">Dating</h1>{selector}<button type="button" className="dating-filter" aria-label="Dating preferences" aria-haspopup="dialog" disabled={blocked} onClick={()=>setFilter(true)}><CardIcon name="filter"/></button></header>
   {candidate?<LiveCard key={`${candidate.id}:${candidate.photoRevision}`} candidate={candidate}/>:<div className="dating-live-empty">
    <h2>{effective?searched?'No one found this time.':'Your next connection starts here.':'Your kind of connection.'}</h2>
    <p>{effective?'Look for real signed-in adults who have opted into Dating. Age, distance and who you want to meet must work both ways.':'Save your Dating details, choose a current search location, and opt in when you’re ready.'}</p>
    {!runtime.globalDiscovery||!runtime.datingDiscovery?<p><Link to="/settings">Enable global and Dating discovery in Settings</Link> before starting.</p>:null}
    {!runtime.aggregate.eligibility.adult&&<p>Dating is available for adults aged 18 and over with a saved birthdate.</p>}
    {!runtime.aggregate.eligibility.locationResolved&&<p>Choose a search area or explicitly permitted device location in Dating preferences.</p>}
    <button type="button" className="account-secondary" disabled={blocked} onClick={()=>setFilter(true)}>Edit Dating preferences</button>
    <Link to="/profile">Upload or change your profile photo</Link>
   </div>}
   <div className="dating-live-controls">
    <p className="dating-live-disclosure">Real signed-in profiles · Search-area distance, not live presence. A request needs acceptance in Connections.</p>
    {busy&&<p role="status">Checking and confirming Dating…</p>}{error&&<p role="alert">{error}</p>}
    {connection&&<p role="status">{connection.status==='connected'?'Connected.':'Connection request sent.'} {connection.status==='connected'&&connection.conversationId?<Link to={conversationPath(connection.conversationId)}>Open conversation</Link>:<Link to="/messages">Check Connections</Link>}</p>}
    {uncertain&&!busy&&<p role="status">Reload Dating and check Connections before trying another change. <Link to="/messages">Open Connections</Link></p>}
    <div className="dating-live-toolbar">
     <button type="button" className="account-secondary" disabled={blocked} onClick={reload}>Reload Dating</button>
     <button type="button" className="account-secondary" disabled={blocked||uncertain||!enabled&&!runtime.canStart} onClick={toggle}>{enabled?'Pause Dating discovery':'Start Dating discovery'}</button>
     {effective&&<button type="button" className="account-primary" disabled={blocked||uncertain} onClick={()=>find()}>Find someone</button>}
    </div>
    {candidate&&<div className="dating-live-toolbar" role="group" aria-label="Dating profile actions">
     <button type="button" className="account-secondary" disabled={blocked||uncertain||skipped.length>=50} onClick={()=>find([...skipped,candidate.id])}><CardIcon name="x"/> Skip for this visit</button>
     <button type="button" className="account-primary" data-dating-request disabled={blocked||uncertain||!!connection} onClick={connect}><CardIcon name="heart"/> Send connection request</button>
    </div>}
    {skipped.length>=50&&<button type="button" className="account-secondary" disabled={blocked} onClick={()=>{setSkipped([]);setCandidate(null);setSearched(false)}}>Review skipped profiles again</button>}
   </div>
  </div>
  <DatingPreferences key={`${runtime.aggregate.profileRevision}:${runtime.aggregate.searchRevision}`} live open={filter} close={()=>setFilter(false)} onSaved={()=>{setFilter(false);reload()}}/>
 </section>
}
function LiveCard({candidate}:{candidate:DatingCandidate}){
 const photo=useProfilePhoto({owner:candidate.id,revision:candidate.photoRevision})
 const src=photo.url??(candidate.photoRevision===0?candidate.avatar:null)
 return <article className="dating-card dating-live-card" data-front="true" aria-label={`${candidate.name}, ${candidate.age}, Dating profile`}>
  {src?<img className="dating-portrait" src={src} alt={`${candidate.name}'s profile photo`} referrerPolicy="no-referrer"/>:<div className="dating-live-no-photo"><Icon name="profile" size={64}/><span>{photo.loading?'Loading profile photo…':'No profile photo to display'}</span></div>}
  <span className="dating-photo-scrim" aria-hidden="true"/>
  <div className="dating-card-copy"><div className="dating-eyebrow">Dating profile</div><div className="dating-name-row"><h2><span className="dating-name">{candidate.name}</span><span className="dating-age">{candidate.age}</span></h2></div>
   <dl className="dating-card-info"><div><dt className="pt-sr-only">Home area</dt><dd>{candidate.city||'Home area not added'}</dd></div><div><dt className="pt-sr-only">Search-area distance</dt><dd>{candidate.areaDistanceMiles===0?'Same search-area anchor':`Within ${candidate.areaDistanceMiles} ${candidate.areaDistanceMiles===1?'mile':'miles'} between search areas`}</dd></div>{candidate.heightInches!==null&&<div><dt className="pt-sr-only">Height</dt><dd>{Math.floor(candidate.heightInches/12)}′ {candidate.heightInches%12}″</dd></div>}</dl>
   {candidate.bio&&<p className="dating-live-bio">{candidate.bio}</p>}
   <ul aria-label="Interests">{candidate.interests.map(interest=><li key={interest}>{interest}</li>)}</ul>
   <p className="dating-live-intentions">{candidate.intent} · {candidate.style}{candidate.gender?` · ${candidate.gender}`:''}{candidate.sexuality?` · ${candidate.sexuality}`:''}</p>
  </div>
 </article>
}
