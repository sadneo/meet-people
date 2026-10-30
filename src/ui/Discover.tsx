import { canShowDating } from './age-visibility'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { connections } from '../features/connections/client'
import { datingLiveClient } from '../features/matchmaking/dating-live-client'
import { detailedSettingsClient } from '../features/account/detailed-settings-client'
import { friendsPreferencesClient } from '../features/matchmaking/friends-preferences-client'
import type { DiscoveryPerson } from './useDiscoveryDeck'
import { useAction, useLoad } from './hooks'
import { ActionButton, ErrorMessage, Icon, Modal, PersonPhoto, ResourceState } from './common'
import { useCurrent } from './current'
import { DatingPreferencesPanel, FriendsPreferencesPanel } from './Preferences'
import { SafetyActions } from './Safety'
import { matchingClient } from './matching-client'
import { useDiscoveryDeck } from './useDiscoveryDeck'
import { interestSelectionProblem } from '../../shared/interests'
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
                  else await matchingClient(current.session.access_token).connect('Friends', id);
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
  onUndo,
  canUndo = false,
  intent,
  style,
  details,
  sharedAvailability,
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
  onUndo?: () => void;
  canUndo?: boolean;
  intent?: string;
  style?: string;
  details?: DiscoveryPerson['details'];
  sharedAvailability?: DiscoveryPerson['sharedAvailability'];
}) {
  const current = useCurrent();
  const [selectedInterest, setSelectedInterest] = useState<string | null>(null);
  const [interestError, setInterestError] = useState('');
  async function toggleInterest() {
    if (!selectedInterest || !current.account?.profile || current.busy || !current.available) return;
    const own = current.account.profile.interests;
    const next = own.includes(selectedInterest) ? own.filter(item => item !== selectedInterest) : [...own, selectedInterest];
    const problem = interestSelectionProblem(next);
    if (problem) { setInterestError(problem); return; }
    if (await current.save({ ...current.account, profile: { ...current.account.profile, interests: next } })) setSelectedInterest(null);
    else setInterestError('Your interests could not be confirmed. Reload your saved profile before trying again.');
  }
  const content = useRef<HTMLDivElement>(null), moving = useRef(false), live = useRef(true), animation = useRef<Animation | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; animation.current?.cancel(); };
  }, []);
  async function decide(direction: 'pass' | 'connect') {
    if (moving.current) return;
    const action = direction === 'pass' ? onSkip : onConnect;
    if (!action) return;
    moving.current = true;
    setTransitioning(true);
    try {
      if (content.current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const offset = direction === 'pass' ? -10 : 10;
        animation.current = content.current.animate([
          { transform: 'translateX(0) rotate(0deg)' },
          { transform: `translateX(${offset}px) rotate(${direction === 'pass' ? -.35 : .35}deg)` },
        ], { duration: 150, easing: 'ease-in', fill: 'forwards' });
        await animation.current.finished;
      }
      if (live.current) action();
    } catch {
      // Navigation/profile invalidation cancels the animation and pending action.
    } finally {
      animation.current?.cancel();
      animation.current = null;
      moving.current = false;
      if (live.current) setTransitioning(false);
    }
  }
  const shared = interests.filter(interest => current.account?.profile?.interests.includes(interest));
  const sortedInterests = [...shared, ...interests.filter(interest => !shared.includes(interest))];
  return (
    <article className={`dating-focus discovery-profile ${dating ? 'dating-profile' : 'friends-focus'}`}>
    <div className={`card dating-card ${dating ? '' : 'friends-card'}`}>
      <div className="discovery-profile-content" ref={content}>
      <div className="photo discovery-photo">
        <PersonPhoto
          id={id}
          name={name}
          revision={photoRevision}
          fallback={avatar}
          large
        />
        <div className="phototext">
        <h2>
          {name}
          {age !== undefined ? `, ${age}` : ""}
        </h2>
          {(city || intent || details?.occupation) && <p>{[details?.occupation, city].filter(Boolean).join(' · ')}{(city || details?.occupation) && intent && <br />}{intent}</p>}
        </div>
        <SafetyActions id={id} name={name} iconOnly />
      </div>
      <div className="dating-profile-body">
        {bio && <section><h3>About {name}</h3><p>{bio}</p></section>}
        <section>
          <div className="dating-section-heading"><h3>Interests</h3>{shared.length > 0 && <span>{shared.length} in common</span>}</div>
          <div className="dating-interest-list">{sortedInterests.map(interest => <button type="button" key={interest} onClick={() => { setSelectedInterest(interest); setInterestError(''); }} className={`dating-interest ${shared.includes(interest) ? 'in-common' : ''}`}>
            {shared.includes(interest) && <Icon name="Check" />}{interest}{shared.includes(interest) && <span className="sr-only"> · shared interest</span>}
          </button>)}</div>
        </section>
        {sharedAvailability && <section className="dating-overlap" aria-label="Shared availability">
          <Icon name="Clock" />
          <div><h3>Time in common</h3><p>{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][sharedAvailability.dayOfWeek]} {sharedAvailability.period} · Shared availability</p>
          <span className="sr-only">Times shown in {sharedAvailability.timeZone}</span></div>
        </section>}
        {(intent || style || details?.education || details?.languages?.length) && <section className="dating-facts" aria-label={dating ? 'Dating details' : 'Profile details'}>
          {intent && <div><span>Looking for</span><p>{intent}</p></div>}
          {style && <div><span>Relationship style</span><p>{style}</p></div>}
          {details?.education && <div><span>Education</span><p>{details.education}</p></div>}
          {!!details?.languages?.length && <div><span>Languages</span><p>{details.languages.join(', ')}</p></div>}
        </section>}
      </div>
      </div>
      {onConnect ? <div className="dating-actions" aria-label="Profile actions">
        <button type="button" className="photo-action undo" aria-label="Undo skip" title="Undo skip" disabled={!canUndo || transitioning} onClick={onUndo}><Icon name="Undo" /></button>
        <button type="button" className="photo-action" aria-label="Pass" title="Skip profile" disabled={transitioning} onClick={() => void decide('pass')}><Icon name="Skip" /></button>
        <button type="button" className="photo-action primary" aria-label={dating ? 'Send Dating request' : 'Connect'} title={dating ? 'Send Dating request' : 'Send friend request'} disabled={transitioning} onClick={() => void decide('connect')}><Icon name={dating ? 'Dating' : 'AddFriend'} /></button>
      </div> : <Connect id={id} dating={dating} />}
    </div>
    {selectedInterest && <Modal title={selectedInterest} close={() => setSelectedInterest(null)}><p>{shared.includes(selectedInterest) ? `You and ${name} both enjoy ${selectedInterest}.` : `${name} enjoys ${selectedInterest}.`}</p><ErrorMessage>{interestError}</ErrorMessage><div className="row wrap"><ActionButton disabled={current.busy || !current.available} onClick={() => void toggleInterest()}>{shared.includes(selectedInterest) ? 'Remove from my interests' : 'Add to my interests'}</ActionButton><Link className="btn light" to="/profile?section=interests">Edit your interests</Link></div></Modal>}
    </article>
  );
}

function Feed({token,mode,enabled,revision}:{token:string;mode:'Friends'|'Dating';enabled:boolean;revision:string}){
 const deck=useDiscoveryDeck(token,mode,enabled,revision)
 if(!enabled)return null
 const notices=[...deck.outcomes.filter(item=>item.state!=='confirmed'),...deck.outcomes.filter(item=>item.state==='confirmed').slice(-1)]
 return <>
   {deck.loading&&<p role="status" className={deck.cards.length ? 'sr-only' : undefined}>{deck.cards.length?'Loading more people…':'Finding people…'}</p>}
   <ErrorMessage>{deck.error}</ErrorMessage>
   {deck.error && <ActionButton secondary disabled={deck.loading} onClick={deck.reset}>Try again</ActionButton>}
  {deck.cards.slice(0,10).map((person,index)=><div className="discovery-card-slot" hidden={index!==0} key={person.id}><Candidate {...person} dating={mode==='Dating'} onConnect={()=>void deck.connect(person)} onSkip={()=>deck.advance(person)} onUndo={deck.undo} canUndo={deck.canUndo}/></div>)}
  {!deck.cards.length&&!deck.loading&&<div className="friends-waiting"><Icon name={mode}/><h2>{deck.searched?'You’re all caught up.':'Your next connection starts here.'}</h2><p className="muted">Check again as more people join.</p></div>}
  {notices.map(item=><div key={item.person.id} className="account-note" role="status">
   {item.state==='saving'?`Sending a request to ${item.person.name}…`:item.state==='rejected'?<>{item.person.name}: request not sent. {item.error}</>:item.state==='uncertain'?<>{item.person.name}: request unconfirmed. <Link to="/activity">Check Connections</Link> before sending again. {item.error}</>:item.result?.status==='connected'?<>Connected with {item.person.name}. <Link to={`/messages/chat?conversation=${encodeURIComponent(item.result.conversationId??'')}`}>Open conversation</Link></>:`Request sent to ${item.person.name}.`}
  </div>)}
  {!deck.cards.length && deck.canUndo && <ActionButton secondary onClick={deck.undo}>Undo skip</ActionButton>}
 </>
}
function Friends({token,revision}:{token:string;revision:string}){
 const settings=useLoad(useCallback(signal=>{void revision;return detailedSettingsClient(token).read(signal)},[token,revision]))
 return <><ResourceState loading={settings.loading} error={settings.error} reload={settings.reload}/>
  {settings.value&&!settings.value.effective.friendsDiscovery&&<div className="friends-waiting"><Icon name="Friends"/><h2>Friends, at your pace.</h2><p>Turn on Friend recommendations in <Link to="/profile?section=discovery">Discovery settings</Link> when you’re ready.</p></div>}
 <Feed token={token} mode="Friends" enabled={settings.value?.effective.friendsDiscovery===true} revision={revision}/></>
}
function Dating({token,revision}:{token:string;revision:string}){
 const runtime=useLoad(useCallback(signal=>{void revision;return datingLiveClient(token).status(signal)},[token,revision])), action=useAction()
 const [uncertain,setUncertain]=useState(false),manual=useRef(false)
 useEffect(()=>{if(manual.current&&runtime.value){manual.current=false;setUncertain(false)}},[runtime.value])
 async function toggle(){await action.run(async()=>{if(!runtime.value||uncertain)return;setUncertain(true);try{await datingLiveClient(token).enable({expectedProfileRevision:runtime.value.aggregate.profileRevision,expectedSearchRevision:runtime.value.aggregate.searchRevision,enabled:!runtime.value.aggregate.profile.enabled});setUncertain(false)}finally{runtime.reload()}})}
 const value=runtime.value
 return <><ResourceState loading={runtime.loading} error={runtime.error} reload={runtime.reload}/><ErrorMessage>{action.error}</ErrorMessage>
  {value&&!value.aggregate.effectiveEnabled&&<div className="friends-waiting"><Icon name="Dating"/><h2>Dating, at your pace.</h2><p>Save your preferences and choose when to be discovered.</p>{(!value.globalDiscovery||!value.datingDiscovery)&&<Link to="/profile?section=discovery">Enable Dating discovery in Discovery settings</Link>}</div>}
 <Feed token={token} mode="Dating" enabled={value?.aggregate.effectiveEnabled===true&&!uncertain} revision={`${revision}:${value?.aggregate.profileRevision??0}:${value?.aggregate.searchRevision??0}`}/>
 <div className="match-actions">{value&&<ActionButton disabled={action.busy||uncertain||(!value.aggregate.profile.enabled&&!value.canStart)} onClick={()=>void toggle()}>{value.aggregate.profile.enabled?'Pause Dating':'Start Dating discovery'}</ActionButton>}
 <ActionButton secondary disabled={action.busy} onClick={()=>{manual.current=true;runtime.reload()}}>Refresh Dating status</ActionButton></div>
 {uncertain&&<p role="status">Participation is unconfirmed. Refresh Dating status before another change.</p>}</>
}
export function Discover(){
  const current=useCurrent(),[epoch,setEpoch]=useState(0),[preferencesBusy,setPreferencesBusy]=useState(false)
  const [search,setSearch]=useSearchParams()
  const adult=canShowDating(current.account?.profile?.birthdate)
  const mode=adult&&search.get('mode')==='dating'?'Dating':'Friends', preferences=search.get('preferences')==='true'
  function setMode(value:'Friends'|'Dating'){setSearch(before=>{const next=new URLSearchParams(before);next.set('mode',value.toLowerCase());return next},{replace:true})}
  function setPreferences(open:boolean){setSearch(before=>{const next=new URLSearchParams(before);if(open)next.set('preferences','true');else next.delete('preferences');return next},{replace:true})}
  const token = current.session.access_token, home = current.account?.profile?.location_city;
  const area = useLoad(useCallback(async signal => {
    void epoch;
    const saved = mode === 'Friends'
      ? (await friendsPreferencesClient(token).read(signal)).preferences?.searchArea
      : (await datingLiveClient(token).status(signal)).aggregate.search?.searchArea;
    return saved?.source === 'temporary' ? saved.areaLabel : saved?.source === 'home' ? home : null;
  }, [mode, token, epoch, home]));
  const revision=JSON.stringify([epoch,current.account?.profile])
  return <div className="discovery-page"><div className="discoverhead"><h2>Discover</h2><button className="area-link" aria-label="Search area & preferences" onClick={()=>setPreferences(true)}>⌖ {area.loading || area.error ? 'Search area' : area.value || 'Search area'} <span aria-hidden="true">⌄</span></button></div>
  <div className="discovertools"><div className="mode-toggle" role="group" aria-label="Matchmaking mode"><span className={`mode-toggle-indicator ${mode==='Dating'?'dating':''}`} aria-hidden="true"/>{(['Friends','Dating'] as const).filter(item=>item==='Friends'||adult).map(item=><button key={item} data-mode={item} className={mode===item?'selected':''} aria-pressed={mode===item} onClick={()=>setMode(item)}><Icon name={item}/>{item}</button>)}</div><div className="row"><button className="round" aria-label={`${mode} preferences`} onClick={()=>setPreferences(true)}><Icon name="DiscoveryPreferences"/></button><Link className="round discovery-activity" to="/matches" aria-label="Matches and activity"><Icon name="DiscoveryActivity" /></Link></div></div>
 <div hidden={mode!=='Friends'}><Friends key={current.session.user.id} token={current.session.access_token} revision={revision}/></div>
 {adult&&<div hidden={mode!=='Dating'}><Dating key={current.session.user.id} token={current.session.access_token} revision={revision}/></div>}
  {preferences&&<Modal className={mode==='Friends'?'friends-preferences-modal':'dating-preferences-modal'} title={`${mode} preferences`} close={()=>{if(!preferencesBusy){setPreferences(false);setEpoch(value=>value+1)}}}>{mode==='Friends'?<FriendsPreferencesPanel onSavingChange={setPreferencesBusy} done={()=>{setPreferences(false);setEpoch(value=>value+1)}}/>:<DatingPreferencesPanel onSavingChange={setPreferencesBusy} done={()=>{setPreferences(false);setEpoch(value=>value+1)}}/>}</Modal>}
 </div>
}
