import { useEffect,useRef,useState } from 'react'
import { AccountDialog } from './AccountDialog'
import { useAccount } from '../../auth/account-context'
import { photoChangedEvent,useProfilePhoto } from './useProfilePhoto'
import { ProfilePhotoError } from './profile-photo-client'
export function ProfilePhotoEditor({close}: {close:()=>void}){
 const account=useAccount(),key=account?.session?`${account.session.user.id}:${account.session.access_token}`:'signed-out'
 return <PhotoResource key={key} close={close}/>
}
function PhotoResource({close}:{close:()=>void}){
 const resource=useProfilePhoto(),[file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[reconcile,setReconcile]=useState(false),[retryable,setRetryable]=useState(false)
 const pending=useRef<{file:File|null;revision:number;requestId:string}|null>(null),active=useRef(false),operation=useRef<AbortController|null>(null),locked=useRef(false)
 const [preview,setPreview]=useState<string|null>(null),chosenUrl=useRef<string|null>(null)
 function selectFile(next:File|null){if(chosenUrl.current)URL.revokeObjectURL(chosenUrl.current);chosenUrl.current=next?URL.createObjectURL(next):null;setPreview(chosenUrl.current);setFile(next);setRetryable(false)}
 useEffect(()=>()=>{if(chosenUrl.current)URL.revokeObjectURL(chosenUrl.current)},[])
 useEffect(()=>{active.current=true;return()=>{active.current=false;operation.current?.abort()}},[])
 async function save(remove=false,retry=false){
  if(locked.current||!resource.client||!resource.snapshot||resource.loading||reconcile&&!retry)return
  const value=retry?pending.current:{file:remove?null:file,revision:resource.snapshot.revision,requestId:crypto.randomUUID()}
  if(!value||!remove&&!retry&&!value.file)return
  pending.current=value;locked.current=true;setBusy(true);setRetryable(false);setError('');const controller=new AbortController();operation.current=controller
  try{
   await resource.client.save(value.file,value.revision,value.requestId,controller.signal)
   if(!active.current||controller.signal.aborted)return
   pending.current=null;window.dispatchEvent(new CustomEvent(photoChangedEvent,{detail:resource.owner}));close()
  }catch(failure){if(active.current&&!controller.signal.aborted){setError(failure instanceof Error?failure.message:'Photo save could not be confirmed.');setReconcile(true);if(failure instanceof ProfilePhotoError&&failure.status<500)pending.current=null;else setRetryable(true)}}
  finally{if(active.current){locked.current=false;setBusy(false)}}
 }
 const blocked=busy||resource.loading||!resource.snapshot||reconcile
 return <AccountDialog title="Your profile picture" close={close} busy={busy}><div className="account-feature-form">
  <p>One shared profile photo, used on Dating too. Upload a still JPEG, PNG or WebP up to 5 MB. Camera metadata is removed.</p>
  {preview||resource.url?<img className="account-picture-preview" src={preview??resource.url!} alt={preview?'Selected photo, not uploaded yet':'Your saved profile photo'}/>:<div className="account-photo-empty">No saved photo to display</div>}
  <label className="account-feature-field">Choose a picture<input type="file" accept="image/jpeg,image/png,image/webp" disabled={blocked} onChange={event=>{
   const next=event.target.files?.[0];event.target.value='';if(!next)return
   if(!['image/jpeg','image/png','image/webp'].includes(next.type)||next.size===0||next.size>5*1024*1024){selectFile(null);setError('Choose a JPEG, PNG or WebP up to 5 MB.');return}
   pending.current=null;selectFile(next);setError('')
  }}/></label>
  {resource.loading&&<p role="status">Loading saved photo…</p>}{busy&&<p role="status">Saving and confirming your photo…</p>}
  {(error||resource.error)&&<p role="alert">{error||resource.error}</p>}
  <button type="button" className="account-secondary" disabled={busy||resource.loading} onClick={()=>{pending.current=null;selectFile(null);setError('');setReconcile(false);resource.reload()}}>Reload saved photo</button>
  {retryable&&reconcile&&<button type="button" className="account-secondary" disabled={busy} onClick={()=>void save(false,true)}>Retry same photo change</button>}
  <button type="button" className="account-secondary" disabled={blocked||!resource.snapshot?.hasPhoto} onClick={()=>void save(true)}>Remove saved photo</button>
  <div className="account-feature-actions"><button type="button" className="account-secondary" disabled={busy} onClick={close}>Cancel</button><button type="button" className="account-green-action" disabled={blocked||!file} onClick={()=>void save()}>Upload profile photo</button></div>
  <p className="account-feature-note">Choosing a file is a draft. Only a confirmed upload changes your photo. Cancel discards the selection.</p>
 </div></AccountDialog>
}
