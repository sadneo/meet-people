import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { connections } from '../features/connections/client'
import { datingLiveClient } from '../features/matchmaking/dating-live-client'
import { detailedSettingsClient } from '../features/account/detailed-settings-client'
import { useAction, useLoad } from './hooks'
import { ActionButton, ErrorMessage, Icon, Modal, PersonPhoto, ResourceState } from './common'
import { useCurrent } from './current'
import { DatingPreferencesPanel, FriendsPreferencesPanel } from './Preferences'
import { SafetyActions } from './Safety'
import { matchingClient } from './matching-client'
import { useDiscoveryDeck } from './useDiscoveryDeck'
export function Connect({
  id,
  dating = false,
}: {
  id: string;
  dating?: boolean;
}) {
  const current = useCurrent(),
    action = useAction(),
    state = useLoad(
      useCallback((signal) => connections.state(id, signal), [id]),
    );
  const value = state.value;
  return (
    <div className="connect-actions">
      <ResourceState
        loading={state.loading}
        error={state.error}
        reload={state.reload}
      />
      <ErrorMessage>{action.error}</ErrorMessage>
      {value?.status === "connected" && value.conversationId ? (
        <Link
          className="btn"
          to={`/messages/chat?conversation=${encodeURIComponent(value.conversationId)}`}
        >
          Message
        </Link>
      ) : value?.status === "sent" ? (
        <p role="status">Connection request sent</p>
      ) : (
        value && (
          <ActionButton
            disabled={action.busy}
            onClick={() => {
              void action.run(async () => {
                try {
                  if (value.status === "incoming") await matchingClient(current.session.access_token).acceptFriend(id);
                  else if (dating)
                    await datingLiveClient(
                      current.session.access_token,
                    ).connect(id);
                  else await connections.request(id);
                } finally {
                  state.reload();
                }
              });
            }}
          >
            {value.status === "incoming"
              ? "Accept request"
              : dating
                ? "Send Dating request"
                : "Connect"}
          </ActionButton>
        )
      )}
    </div>
  );
}
function Candidate({
  id,
  name,
  avatar,
  interests,
  age,
  bio,
  city,
  photoRevision,
  dating = false,
  onConnect,
  onSkip,
}: {
  id: string;
  name: string;
  avatar: string | null;
  interests: string[];
  age?: number;
  bio?: string | null;
  city?: string | null;
  photoRevision?: number;
  dating?: boolean;
  onConnect?: () => void;
  onSkip?: () => void;
}) {
  return (
    <article className="live-candidate card">
      <div className="candidate-portrait">
        <PersonPhoto
          id={id}
          name={name}
          revision={photoRevision}
          fallback={avatar}
          large
        />
      </div>
      <div className="candidate-body">
        <h2>
          {name}
          {age !== undefined ? `, ${age}` : ""}
        </h2>
        {city && <p className="muted">{city}</p>}
        {bio && <p>{bio}</p>}
        <div>
          {interests.map((interest) => (
            <span key={interest} className="chip">
              {interest}
            </span>
          ))}
        </div>
        {onConnect ? <div className="match-actions"><ActionButton onClick={onConnect}>{dating ? 'Send Dating request' : 'Connect'}</ActionButton><ActionButton secondary onClick={onSkip}>Pass</ActionButton></div> : <Connect id={id} dating={dating} />}
        <SafetyActions id={id} name={name} />
      </div>
    </article>
  );
}

function Feed({token,mode,enabled,revision}:{token:string;mode:'Friends'|'Dating';enabled:boolean;revision:string}){
 const deck=useDiscoveryDeck(token,mode,enabled,revision)
 if(!enabled)return null
 const notices=[...deck.outcomes.filter(item=>item.state!=='confirmed'),...deck.outcomes.filter(item=>item.state==='confirmed').slice(-1)]
 return <>
  {deck.loading&&<p role="status">{deck.cards.length?'Loading more people…':'Finding people…'}</p>}
  <ErrorMessage>{deck.error}</ErrorMessage>
  {deck.cards.slice(0,10).map((person,index)=><div className="discovery-card-slot" hidden={index!==0} key={person.id}><Candidate {...person} dating={mode==='Dating'} onConnect={()=>void deck.connect(person)} onSkip={()=>deck.advance(person)}/></div>)}
  {!deck.cards.length&&!deck.loading&&<div className="friends-waiting"><Icon name={mode}/><h2>{deck.searched?'You’re all caught up.':'Your next connection starts here.'}</h2><p className="muted">Check again as more people join.</p></div>}
  {notices.map(item=><div key={item.person.id} className="account-note" role="status">
   {item.state==='saving'?`Sending a request to ${item.person.name}…`:item.state==='uncertain'?<>{item.person.name}: request unconfirmed. <Link to="/activity">Check Connections</Link> before sending again. {item.error}</>:item.result?.status==='connected'?<>Connected with {item.person.name}. <Link to={`/messages/chat?conversation=${encodeURIComponent(item.result.conversationId??'')}`}>Open conversation</Link></>:`Request sent to ${item.person.name}.`}
  </div>)}
  <ActionButton secondary disabled={deck.loading} onClick={deck.cards.length?()=>void deck.refill():deck.reset}>Refresh recommendations</ActionButton>
 </>
}
function Friends({token,revision}:{token:string;revision:string}){
 const settings=useLoad(useCallback(signal=>{void revision;return detailedSettingsClient(token).read(signal)},[token,revision]))
 return <><ResourceState loading={settings.loading} error={settings.error} reload={settings.reload}/>
 {settings.value&&!settings.value.effective.friendsDiscovery&&<div className="friends-waiting"><Icon name="Friends"/><h2>Friends, at your pace.</h2><p>Turn on Friend recommendations in <Link to="/settings">Settings</Link> when you’re ready.</p></div>}
 <Feed token={token} mode="Friends" enabled={settings.value?.effective.friendsDiscovery===true} revision={revision}/></>
}
function Dating({token,revision}:{token:string;revision:string}){
 const runtime=useLoad(useCallback(signal=>{void revision;return datingLiveClient(token).status(signal)},[token,revision])), action=useAction()
 const [uncertain,setUncertain]=useState(false),manual=useRef(false)
 useEffect(()=>{if(manual.current&&runtime.value){manual.current=false;setUncertain(false)}},[runtime.value])
 async function toggle(){await action.run(async()=>{if(!runtime.value||uncertain)return;setUncertain(true);try{await datingLiveClient(token).enable({expectedProfileRevision:runtime.value.aggregate.profileRevision,expectedSearchRevision:runtime.value.aggregate.searchRevision,enabled:!runtime.value.aggregate.profile.enabled});setUncertain(false)}finally{runtime.reload()}})}
 const value=runtime.value
 return <><ResourceState loading={runtime.loading} error={runtime.error} reload={runtime.reload}/><ErrorMessage>{action.error}</ErrorMessage>
 {value&&!value.aggregate.effectiveEnabled&&<div className="friends-waiting"><Icon name="Dating"/><h2>Dating, at your pace.</h2><p>Save your preferences and choose when to be discovered.</p>{(!value.globalDiscovery||!value.datingDiscovery)&&<Link to="/settings">Enable Dating discovery in Settings</Link>}</div>}
 <Feed token={token} mode="Dating" enabled={value?.aggregate.effectiveEnabled===true&&!uncertain} revision={`${revision}:${value?.aggregate.profileRevision??0}:${value?.aggregate.searchRevision??0}`}/>
 <div className="match-actions">{value&&<ActionButton disabled={action.busy||uncertain||(!value.aggregate.profile.enabled&&!value.canStart)} onClick={()=>void toggle()}>{value.aggregate.profile.enabled?'Pause Dating':'Start Dating discovery'}</ActionButton>}
 <ActionButton secondary disabled={action.busy} onClick={()=>{manual.current=true;runtime.reload()}}>Refresh Dating status</ActionButton></div>
 {uncertain&&<p role="status">Participation is unconfirmed. Refresh Dating status before another change.</p>}</>
}
export function Discover(){
 const current=useCurrent(),[mode,setMode]=useState<'Friends'|'Dating'>('Friends'),[preferences,setPreferences]=useState(false),[epoch,setEpoch]=useState(0)
 const revision=JSON.stringify([epoch,current.account?.profile])
 return <div className="discovery-page"><div className="discoverhead"><h2>Discover</h2><button className="area-link" onClick={()=>setPreferences(true)}>⌖ Search area & preferences</button></div>
 <div className="discovertools"><div className="mode-toggle" role="group" aria-label="Matchmaking mode"><span className={`mode-toggle-indicator ${mode==='Dating'?'dating':''}`} aria-hidden="true"/>{(['Friends','Dating'] as const).map(item=><button key={item} className={mode===item?'selected':''} aria-pressed={mode===item} onClick={()=>setMode(item)}><Icon name={item}/>{item}</button>)}</div><button className="round" aria-label={`${mode} preferences`} onClick={()=>setPreferences(true)}><Icon name="preferences"/></button></div>
 <div hidden={mode!=='Friends'}><Friends key={current.session.user.id} token={current.session.access_token} revision={revision}/></div>
 <div hidden={mode!=='Dating'}><Dating key={current.session.user.id} token={current.session.access_token} revision={revision}/></div>
 {preferences&&<Modal title={`${mode} preferences`} close={()=>setPreferences(false)}>{mode==='Friends'?<FriendsPreferencesPanel done={()=>{setPreferences(false);setEpoch(value=>value+1)}}/>:<DatingPreferencesPanel done={()=>{setPreferences(false);setEpoch(value=>value+1)}}/>}</Modal>}
 </div>
}
