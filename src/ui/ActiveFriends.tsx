import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import type { z } from 'zod'
import { ActiveGroupSchema, type ActiveStatus, type ActiveCommand } from '../../shared/active-friends'
import { matchingClient, MatchingError } from './matching-client'
import { useCurrent } from './current'
import { ActionButton, ErrorMessage, ResourceState } from './common'
import { useAction, useLoad } from './hooks'
import { FriendsPreferencesPanel } from './Preferences'
import { MatchingSchedule } from './MatchingSchedule'
import { SafetyActions } from './Safety'
export type ActiveGroup = z.infer<typeof ActiveGroupSchema>
function unknownWrite(error: unknown) { return !(error instanceof MatchingError) || error.status === 0 || error.status >= 500 }
export function ActiveFriends({ close, changed }: { close: () => void; changed: () => void }) {
 const current=useCurrent(),client=useMemo(()=>matchingClient(current.session.access_token),[current.session.access_token])
 const [status,setStatus]=useState<ActiveStatus|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false)
 const [ideal,setIdeal]=useState(3),[allowExisting,setAllowExisting]=useState(false),[preferences,setPreferences]=useState(false)
 const live=useRef(true),lock=useRef(false),epoch=useRef(0),read=useRef<AbortController|null>(null)
  // Invalidate the latest request generation on unmount; this is not a DOM ref.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 useEffect(()=>{live.current=true;return()=>{live.current=false;epoch.current++;read.current?.abort()}},[])
 const refresh=useCallback(async()=>{
  const generation=++epoch.current,abort=new AbortController();read.current?.abort();read.current=abort;setLoading(true);setError('')
  try{const value=await client.status(abort.signal);if(live.current&&generation===epoch.current){setStatus(value);setUncertain(false)}}
  catch(failure){if(live.current&&!abort.signal.aborted&&generation===epoch.current)setError(failure instanceof Error?failure.message:'Group search is unavailable.')}
  finally{if(live.current&&generation===epoch.current)setLoading(false)}
 },[client])
 useEffect(()=>{let active=true;queueMicrotask(()=>{if(active)void refresh()});return()=>{active=false}},[refresh])
 useEffect(()=>{const expires=status?.proposal?.expiresAt;if(!expires)return;const timer=setTimeout(()=>void refresh(),Math.max(0,Date.parse(expires)-Date.now()+100));return()=>clearTimeout(timer)},[status?.proposal?.expiresAt,refresh])
 async function mutate(action:ActiveCommand['action']|'check',data:Record<string,unknown>={}){
  if(lock.current||loading||uncertain)return;lock.current=true;setBusy(true);setError('')
  const generation=epoch.current
  try{const value=await(action==='check'?client.check():client.command(action,data));if(live.current&&generation===epoch.current){setStatus(value);setUncertain(false);changed()}}
  catch(failure){if(live.current&&generation===epoch.current){setError(failure instanceof Error?failure.message:'Action could not be confirmed.');setUncertain(unknownWrite(failure))}}
  finally{lock.current=false;if(live.current)setBusy(false)}
 }
 const disabled=loading||busy||uncertain,active=status&&['queued','reserved','accepted'].includes(status.state)
 return <div className="active-friends-flow">
  <ResourceState loading={loading} error={error} reload={()=>void refresh()}/>
  {uncertain&&<p role="status">Your action may already be saved. Refresh search status before another change.</p>}
  {status?.proposal?<ProposalReview key={status.proposal.id} status={status} disabled={disabled} mutate={mutate}/>:status?.state==='formed'&&status.groupId?
   <div className="card"><h3>Your group is ready.</h3><Link className="btn" onClick={close} to={`/messages/chat?group=${encodeURIComponent(status.groupId)}`}>Open group chat</Link><ActionButton secondary disabled={disabled} onClick={()=>void refresh()}>Refresh search status</ActionButton></div>:
   active?<div className="card" role="status"><h3>Looking for a group…</h3><p>Different interests are welcome. You’ll review the full roster before joining.</p><div className="row"><ActionButton disabled={disabled} onClick={()=>void mutate('check')}>Check for a group</ActionButton><ActionButton secondary disabled={disabled} onClick={()=>void mutate('cancel')}>Cancel search</ActionButton></div></div>:
   <><p>Your ideal size. Everyone confirms the final group before a chat starts.</p>
    {status?.lastOutcome&&<p role="status">{status.lastOutcome==='expired'?'The previous proposal expired.':'The previous search ended.'}</p>}
    <label htmlFor="active-group-size">New friends · You + {ideal}<input id="active-group-size" type="range" min={1} max={8} value={ideal} disabled={disabled} onChange={event=>setIdeal(+event.target.value)}/></label>
    <label className="check"><input type="checkbox" checked={allowExisting} disabled={disabled} onChange={event=>setAllowExisting(event.target.checked)}/>Open to joining an existing group</label>
    <p className="muted">We may offer a smaller group of at least two. Everyone must accept that exact roster.</p>
    <ActionButton disabled={disabled||!status?.enabled||current.busy} onClick={()=>void mutate('join',{preferredNewFriends:ideal,minimumGroupSize:2,maximumGroupSize:ideal+1,allowExistingGroups:allowExisting})}>Find a group</ActionButton>
    {status&&!status.enabled&&<p role="status">Group search is not available right now.</p>}
   </>}
  <div className="row"><ActionButton secondary disabled={busy||loading} onClick={()=>void refresh()}>Refresh search status</ActionButton><ActionButton secondary disabled={busy} onClick={()=>setPreferences(value=>!value)}>Search preferences</ActionButton></div>
  {preferences&&<FriendsPreferencesPanel done={()=>{setPreferences(false);void refresh()}}/>}
  <MatchingSchedule token={current.session.access_token} disabled={disabled} onSaved={()=>void refresh()}/>
 </div>
}
function ProposalReview({status,disabled,mutate}:{status:ActiveStatus;disabled:boolean;mutate:(action:ActiveCommand['action'],data:Record<string,unknown>)=>Promise<void>}){
 const current=useCurrent(),proposal=status.proposal!,own=proposal.members.find(person=>person.id===current.session.user.id)
 const existing=useLoad(useCallback(signal=>proposal.groupId?matchingClient(current.session.access_token).group(proposal.groupId,signal):Promise.resolve(null),[proposal.groupId,current.session.access_token]))
 const [selected,setSelected]=useState(()=>new Set(proposal.members.filter(person=>person.response==='accepted'||person.id===current.session.user.id).map(person=>person.id)))
 const mandatory=new Set(existing.value?.members.map(person=>person.id)??[])
 const finalIds=[...new Set([...selected,...mandatory])]
 return <section className="group-proposal card"><h3>Meet your group</h3><p>{proposal.meetingArea} · {proposal.members.length} people</p>
  {proposal.commonWindow&&<p>Shared time: {new Date(proposal.commonWindow.start).toLocaleString()} – {new Date(proposal.commonWindow.end).toLocaleString()}</p>}
  <p className="muted">Review by {new Date(proposal.expiresAt).toLocaleTimeString()}. Everyone must accept this exact roster.</p>
  <ul className="group-roster">{proposal.members.map(person=><li key={person.id}><span>{person.id===current.session.user.id?'You':person.name}, {person.age}</span><span>{person.response==='accepted'?'Accepted':'Pending'}</span>{person.id!==current.session.user.id&&<SafetyActions id={person.id} name={person.name}/>}</li>)}</ul>
  <div className="row">{own?.response==='pending'?<ActionButton disabled={disabled} onClick={()=>void mutate('accept',{proposalId:proposal.id})}>Accept this group</ActionButton>:<p role="status">You accepted. Waiting for the others.</p>}<ActionButton secondary disabled={disabled} onClick={()=>void mutate('decline',{proposalId:proposal.id})}>Decline group</ActionButton></div>
  {own?.response==='accepted'&&proposal.members.length>2&&<details><summary>Propose a smaller group</summary><p>Everyone selected, including you, must accept again.</p>
   {proposal.members.map(person=><label className="check" key={person.id}><input type="checkbox" checked={selected.has(person.id)||mandatory.has(person.id)} disabled={disabled||person.id===current.session.user.id||mandatory.has(person.id)||existing.loading} onChange={event=>setSelected(value=>{const next=new Set(value);if(event.target.checked)next.add(person.id);else next.delete(person.id);return next})}/>{person.id===current.session.user.id?'You':person.name}</label>)}
   <ActionButton disabled={disabled||existing.loading||!!existing.error||finalIds.length<2||finalIds.length>=proposal.members.length} onClick={()=>void mutate('smaller',{proposalId:proposal.id,memberIds:finalIds})}>Propose selected roster</ActionButton></details>}
 </section>
}
export function GroupControls({group,changed}:{group:ActiveGroup;changed:()=>void}){
 const current=useCurrent(),client=useMemo(()=>matchingClient(current.session.access_token),[current.session.access_token]),action=useAction(),navigate=useNavigate()
 const [uncertain,setUncertain]=useState(false),[name,setName]=useState(group.name??''),[confirmLeave,setConfirmLeave]=useState(false)
 async function command(kind:ActiveCommand['action'],data:Record<string,unknown>={}){await action.run(async()=>{setUncertain(true);try{await client.command(kind,{groupId:group.id,...data});setUncertain(false);changed();if(kind==='leave')navigate('/messages')}catch(error){setUncertain(unknownWrite(error));throw error}})}
 return <details className="group-controls"><summary>Group details & ready-up</summary><ErrorMessage>{action.error}</ErrorMessage>
  <ul className="group-roster">{group.members.map(person=><li key={person.id}><span>{person.id===current.session.user.id?'You':person.display_name}</span><span>{group.readyMemberIds.includes(person.id)?'Ready':'Not ready'}</span>{person.id!==current.session.user.id&&<SafetyActions id={person.id} name={person.display_name}/>}</li>)}</ul>
  {group.members.length<group.targetSize&&<><p>{group.members.length} of {group.targetSize} members. Everyone readies up to search; everyone confirms the proposed roster.</p><div className="row"><ActionButton disabled={action.busy||uncertain} onClick={()=>void command('ready',{ready:!group.readyMemberIds.includes(current.session.user.id)})}>{group.readyMemberIds.includes(current.session.user.id)?'Not ready':'Ready up'}</ActionButton><ActionButton secondary disabled={action.busy||uncertain} onClick={()=>void command('cancel-growth')}>Cancel group search</ActionButton></div></>}
  {['queued','reserved'].includes(group.searchState)&&<p>Open “Find a group” in Messages to check or review your group search.</p>}
  <label>Group name<input value={name} maxLength={80} onChange={event=>setName(event.target.value)}/></label><ActionButton secondary disabled={action.busy||uncertain||!name.trim()} onClick={()=>void command('rename',{name:name.trim()})}>Save group name</ActionButton>
  <ActionButton secondary disabled={action.busy} onClick={()=>void action.run(async()=>{await client.group(group.id);setUncertain(false);changed()})}>Refresh group</ActionButton>
  <ActionButton secondary disabled={action.busy||uncertain} onClick={()=>setConfirmLeave(true)}>Leave group</ActionButton>
  {confirmLeave&&<div className="notice"><p>Leave this conversation? You won’t be able to read new messages.</p><ActionButton disabled={action.busy||uncertain} onClick={()=>void command('leave')}>Confirm leave</ActionButton><ActionButton secondary onClick={()=>setConfirmLeave(false)}>Keep chatting</ActionButton></div>}
  {uncertain&&<p role="status">This action is unconfirmed. Refresh group before another change.</p>}
 </details>
}
