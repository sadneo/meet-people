import { DiscoverPhotos } from './PhotoGallery'
import { canShowDating } from './age-visibility'
import { PageSkeleton } from './loading/PageSkeleton'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { connections } from '../features/connections/client'
import { datingLiveClient, DatingLiveError } from '../features/matchmaking/dating-live-client'
import { datingDiscoveryBlocker } from '../../shared/dating-live'
import { friendsPreferencesClient } from '../features/matchmaking/friends-preferences-client'
import type { DiscoveryPerson } from './useDiscoveryDeck'
import { useAction, useLoad } from './hooks'
import { ActionButton, ErrorMessage, Icon, Modal, ResourceState } from './common'
import { useCurrent } from './current'
import { DatingPreferencesPanel, FriendsPreferencesPanel } from './Preferences'
import { SafetyActions } from './Safety'
import { matchingClient } from './matching-client'
import { useDiscoveryDeck } from './useDiscoveryDeck'
import { useRequestAllowance, type RequestAllowanceControl } from './useRequestAllowance'
import { useQueryClient } from '@tanstack/react-query'
import { canonicalInterest, interestSelectionProblem } from '../../shared/interests'
import { MatchingSetup } from './MatchingSetup'
import { DiscoverModes } from './DiscoverModes'
import { haptic, prefersReducedMotion } from './feedback'
import { useProfileShowcase } from '../features/account/profile-customization-client'
import { orderInterests } from '../../shared/profile-customization'
import { ArtPreview } from '../features/garden/ArtPreview'
import { gardenItemName } from '../features/garden/showcase'
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
  photoGalleryActive = false,
  dating = false,
  onConnect,
  onSkip,
  onUndo,
  canUndo = false,
  connectDisabled = false,
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
  photoGalleryActive?: boolean;
  dating?: boolean;
  onConnect?: () => void;
  onSkip?: () => void;
  onUndo?: () => void;
  canUndo?: boolean;
  connectDisabled?: boolean;
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
  const [lean, setLean] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; animation.current?.cancel(); };
  }, []);
  async function decide(direction: 'pass' | 'connect') {
    if (moving.current) return;
    const action = direction === 'pass' ? onSkip : onConnect;
    if (!action || (direction === 'connect' && connectDisabled)) return;
    moving.current = true;
    setTransitioning(true);
    setLean(direction === 'pass' ? -1 : 1);
    haptic(direction === 'connect' ? 'medium' : 'light');
    try {
      if (content.current && !prefersReducedMotion()) {
        // The card leaves in the chosen direction; the next card rises in.
        const sign = direction === 'pass' ? -1 : 1, width = content.current.offsetWidth || 360;
        animation.current = content.current.animate([
          { transform: 'none' },
          { transform: `translateX(${sign * (width + 80)}px) rotate(${sign * 14}deg)` },
        ], { duration: 280, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' });
        await animation.current.finished;
      }
      if (live.current) action();
    } catch {
      // Navigation/profile invalidation cancels the animation and pending action.
    } finally {
      animation.current?.cancel();
      animation.current = null;
      moving.current = false;
      if (content.current) content.current.style.transform = '';
      if (live.current) { setTransitioning(false); setLean(0); }
    }
  }
  const viewerInterests = new Set(current.account?.profile?.interests.map(canonicalInterest) ?? []);
  const shared = interests.filter(interest => viewerInterests.has(canonicalInterest(interest)));
  const sharedCount = new Set(shared.map(canonicalInterest)).size;
  // The owner's top interest leads, then shared ones, then the rest in their order.
  const showcase = useProfileShowcase(id, photoGalleryActive);
  const ownerOrder = orderInterests(interests, showcase.data?.interestOrder ?? []);
  const top = showcase.data?.interestOrder.find(label => interests.includes(label));
  const sortedInterests = [...(top ? [top] : []), ...ownerOrder.filter(interest => interest !== top && shared.includes(interest)), ...ownerOrder.filter(interest => interest !== top && !shared.includes(interest))];
  const gardenItem = showcase.data?.gardenItem ?? null;
  return (
    <article className={`dating-focus discovery-profile ${dating ? 'dating-profile' : 'friends-focus'}`}>
    <div className={`card dating-card ${dating ? '' : 'friends-card'}`}>
      <div className="discovery-profile-content" ref={content}>
      <div className="photo discovery-photo">
        {onConnect && <><span className="decision-stamp pass" aria-hidden="true" style={{ opacity: Math.max(0, -lean) }}>Pass</span>
        <span className="decision-stamp connect" aria-hidden="true" style={{ opacity: Math.max(0, lean) }}>{dating ? 'Like' : 'Connect'}</span></>}
        <DiscoverPhotos id={id} name={name} revision={photoRevision} fallback={avatar} active={photoGalleryActive}/>
        <div className="phototext">
        <h2>
          {name}
          {age !== undefined ? `, ${age}` : ""}
        </h2>
          {(city || intent || details?.occupation) && <p>{[details?.occupation, city].filter(Boolean).join(' · ')}{(city || details?.occupation) && intent && <br />}{intent}</p>}
        </div>
        <SafetyActions id={id} name={name} iconOnly />
        {gardenItem && <span className="card-garden-item" role="img" aria-label={`From ${name}'s Garden: ${gardenItemName(gardenItem).replace('Your ', '')}`} title={gardenItemName(gardenItem).replace('Your ', '')}><ArtPreview id={gardenItem} size={40}/></span>}
      </div>
      <div className="dating-profile-body">
        {bio && <section><h3>About {name}</h3><p>{bio}</p></section>}
        <section>
          <div className="dating-section-heading"><h3>Interests</h3>{sharedCount > 0 && <span>{sharedCount} in common</span>}</div>
          <div className="dating-interest-list">{sortedInterests.map(interest => <button type="button" key={interest} onClick={() => { setSelectedInterest(interest); setInterestError(''); }} className={`dating-interest ${shared.includes(interest) ? 'in-common' : ''} ${interest === top ? 'is-top' : ''}`}>
            {interest === top ? <Icon name="Star" /> : shared.includes(interest) && <Icon name="Check" />}{interest}{interest === top && <span className="sr-only"> · top interest</span>}{shared.includes(interest) && <span className="sr-only"> · shared interest</span>}
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
        <button type="button" className="photo-action primary" aria-label={dating ? 'Send Dating request' : 'Connect'} title={dating ? 'Send Dating request' : 'Send friend request'} disabled={transitioning || connectDisabled} onClick={() => void decide('connect')}><Icon name={dating ? 'Dating' : 'AddFriend'} /></button>
      </div> : <Connect id={id} dating={dating} />}
    </div>
    {selectedInterest && <Modal variant="sheet" title={selectedInterest} close={() => setSelectedInterest(null)}><p>{shared.includes(selectedInterest) ? `You and ${name} both enjoy ${selectedInterest}.` : `${name} enjoys ${selectedInterest}.`}</p><ErrorMessage>{interestError}</ErrorMessage><div className="row wrap"><ActionButton disabled={current.busy || !current.available} onClick={() => void toggleInterest()}>{shared.includes(selectedInterest) ? 'Remove from my interests' : 'Add to my interests'}</ActionButton><Link className="btn light" to="/profile?section=interests">Edit your interests</Link></div></Modal>}
    </article>
  );
}

function Feed({token,mode,enabled,visible,revision,allowance,refreshStatus}:{token:string;mode:'Friends'|'Dating';enabled:boolean;visible:boolean;revision:string;allowance:RequestAllowanceControl;refreshStatus?:()=>void}){
 const deck=useDiscoveryDeck(token,mode,enabled,revision)
 const setupRefreshed=useRef(false)
 useEffect(()=>{if(['friends_setup_required','dating_setup_required'].includes(deck.errorCode)&&!setupRefreshed.current){setupRefreshed.current=true;refreshStatus?.()}},[deck.errorCode,refreshStatus])
 if(!enabled)return null
 const notices=[...deck.outcomes.filter(item=>item.state!=='confirmed'),...deck.outcomes.filter(item=>item.state==='confirmed').slice(-1)]
 return <>
    {deck.loading&&!deck.error&&(deck.cards.length ? <p role="status" className="sr-only">Loading more people…</p> : <PageSkeleton view="discover" label="Finding people…"/>)}
   <ErrorMessage>{deck.error}</ErrorMessage>
   {deck.error && <ActionButton secondary disabled={deck.loading} onClick={()=>{setupRefreshed.current=false;deck.reset()}}>Try again</ActionButton>}
  {deck.cards.slice(0,10).map((person,index)=><div className="discovery-card-slot" hidden={index!==0} key={person.id}><Candidate {...person} photoGalleryActive={visible && index===0} dating={mode==='Dating'} connectDisabled={allowance.blocked} onConnect={()=>void allowance.send(()=>deck.connect(person))} onSkip={()=>deck.advance(person)} onUndo={deck.undo} canUndo={deck.canUndo}/></div>)}
  {!deck.cards.length&&!deck.loading&&<div className="friends-waiting"><Icon name={mode}/><h2>{deck.searched?'You’re all caught up.':'Your next connection starts here.'}</h2><p className="muted">Check again as more people join.</p></div>}
  {notices.map(item=><div key={item.person.id} className="account-note" role="status">
   {item.state==='saving'?`Sending a request to ${item.person.name}…`:item.state==='rejected'?<>{item.person.name}: request not sent. {item.error}</>:item.state==='uncertain'?<>{item.person.name}: request unconfirmed. <Link to="/activity">Check Connections</Link> before sending again. {item.error}</>:item.result?.status==='connected'?<>Connected with {item.person.name}. <Link to={`/messages/chat?conversation=${encodeURIComponent(item.result.conversationId??'')}`}>Open conversation</Link></>:`Request sent to ${item.person.name}.`}
  </div>)}
  {!deck.cards.length && deck.canUndo && <ActionButton secondary onClick={deck.undo}>Undo skip</ActionButton>}
 </>
}
function Friends({token,revision,allowance,visible}:{token:string;revision:string;allowance:RequestAllowanceControl;visible:boolean}){
 const [setup,setSetup]=useState(false)
 const status=useLoad(useCallback(signal=>{void revision;return matchingClient(token).friendsStatus(signal)},[token,revision]))
 const reason=status.value?.reason
 const guidance=reason==='age'?{title:'Friends discovery is for ages 18–99.',text:'Your saved birthdate is outside the supported age range.',label:'Review birthdate',to:'/profile?section=basics'}
  :reason==='discovery_off'?{title:'Friends discovery is paused.',text:'Turn on Friends discovery when you’re ready.',label:'Discovery settings',to:'/profile?section=discovery'}
  :reason==='location'?{title:'Confirm your Friends search area.',text:'Your saved search area has expired or changed.',label:'Review Friends setup'}
  :{title:'Set up Friends matchmaking.',text:'Add a photo and an interest, then confirm where you’d like to meet people.',label:'Set up Friends'}
  return <><ResourceState loading={status.loading} error={status.error} reload={status.reload} skeleton={<PageSkeleton view="discover" label="Checking Friends setup"/>}/>
  {status.value&&!status.value.eligible&&<section className="friends-waiting"><Icon name="Friends"/><h2>{guidance.title}</h2><p>{guidance.text}</p>{guidance.to?<Link className="btn light" to={guidance.to}>{guidance.label}</Link>:<ActionButton onClick={()=>setSetup(true)}>{guidance.label}</ActionButton>}</section>}
 <Feed visible={visible} allowance={allowance} token={token} mode="Friends" enabled={status.value?.eligible===true} revision={revision} refreshStatus={status.reload}/>
 {setup&&<MatchingSetup mode="friends" close={()=>{setSetup(false);status.reload()}} done={()=>{setSetup(false);status.reload()}}/>}</>
}
function Dating({token,revision,allowance,visible}:{token:string;revision:string;allowance:RequestAllowanceControl;visible:boolean}){
 const runtime=useLoad(useCallback(signal=>{void revision;return datingLiveClient(token).status(signal)},[token,revision])), action=useAction()
 const [uncertain,setUncertain]=useState(false),[setup,setSetup]=useState(false),manual=useRef(false)
 useEffect(()=>{if(manual.current&&runtime.value){manual.current=false;setUncertain(false)}},[runtime.value])
 async function toggle(){await action.run(async()=>{if(!runtime.value||uncertain)return;setUncertain(true);try{await datingLiveClient(token).enable({expectedProfileRevision:runtime.value.aggregate.profileRevision,expectedSearchRevision:runtime.value.aggregate.searchRevision,enabled:!runtime.value.aggregate.profile.enabled});setUncertain(false)}catch(error){if(error instanceof DatingLiveError&&error.status===409)setUncertain(false);throw error}finally{runtime.reload()}})}
 const value=runtime.value
 const blocker=value?datingDiscoveryBlocker(value):null
 const guidance=blocker==='age'?{title:'Dating is for adults 18 and older.',text:'Your saved birthdate does not meet Dating’s age requirement.',label:'Review birthdate',to:'/profile?section=basics'}
  :blocker==='discovery_off'?{title:'Dating discovery is off.',text:'Enable Dating discovery when you’re ready.',label:'Discovery settings',to:'/profile?section=discovery'}
  :blocker==='location'?{title:'Confirm your Dating search area.',text:'Your saved search area has expired or changed.',label:'Review Dating setup'}
  :blocker==='paused'?{title:'Dating is paused.',text:'Start Dating discovery when you’re ready.'}
  :{title:'Set up Dating.',text:'Add a photo and an interest, then choose who you’d like to meet and confirm your Dating search area.',label:'Set up Dating'}
  return <><ResourceState loading={runtime.loading} error={runtime.error} reload={runtime.reload} skeleton={<PageSkeleton view="discover" label="Checking Dating setup"/>}/><ErrorMessage>{action.error}</ErrorMessage>
  {value&&blocker&&<section className="friends-waiting"><Icon name="Dating"/><h2>{guidance.title}</h2><p>{guidance.text}</p>{guidance.to?<Link className="btn light" to={guidance.to}>{guidance.label}</Link>:guidance.label&&<ActionButton onClick={()=>setSetup(true)}>{guidance.label}</ActionButton>}</section>}
 <Feed visible={visible} allowance={allowance} token={token} mode="Dating" enabled={!!value&&!blocker&&!uncertain} revision={`${revision}:${value?.aggregate.profileRevision??0}:${value?.aggregate.searchRevision??0}`} refreshStatus={runtime.reload}/>
 <div className="match-actions">{value&&(value.aggregate.profile.enabled||blocker==='paused')&&<ActionButton disabled={action.busy||uncertain} onClick={()=>void toggle()}>{value.aggregate.profile.enabled?'Pause Dating':'Start Dating discovery'}</ActionButton>}
 {uncertain&&<ActionButton secondary disabled={action.busy||runtime.loading} onClick={()=>{manual.current=true;runtime.reload()}}>Refresh Dating status</ActionButton>}</div>
 {setup&&<MatchingSetup mode="dating" close={()=>{setSetup(false);runtime.reload()}} done={()=>{setSetup(false);runtime.reload()}}/>}
 {uncertain&&<p role="status">Participation is unconfirmed. Refresh Dating status before another change.</p>}</>
}
export function Discover(){
  const cache=useQueryClient()
  const allowance=useRequestAllowance()
  const current=useCurrent(),[epoch,setEpoch]=useState(0),[preferencesBusy,setPreferencesBusy]=useState(false)
  const [search,setSearch]=useSearchParams()
  const adult=canShowDating(current.account?.profile?.birthdate)
  const mode=adult&&search.get('mode')==='dating'?'Dating':'Friends', preferences=search.get('preferences')==='true'
  function setMode(value:'Friends'|'Dating'){setSearch(before=>{const next=new URLSearchParams(before);next.set('mode',value.toLowerCase());return next},{replace:true})}
  function setPreferences(open:boolean){if(!open)cache.removeQueries({queryKey:['discovery-deck']});setSearch(before=>{const next=new URLSearchParams(before);if(open)next.set('preferences','true');else next.delete('preferences');return next},{replace:true})}
  const token = current.session.access_token, home = current.account?.profile?.location_city;
  const area = useLoad(useCallback(async signal => {
    void epoch;
    const saved = mode === 'Friends'
      ? (await friendsPreferencesClient(token).read(signal)).preferences?.searchArea
      : (await datingLiveClient(token).status(signal)).aggregate.search?.searchArea;
    if (!saved?.resolvedLocationRef) return null;
    return saved.source === 'temporary' ? saved.areaLabel : saved.source === 'home' ? home : null;
  }, [mode, token, epoch, home]));
  const revision=JSON.stringify([epoch,current.account?.profile])
  return <div className="discovery-page"><div className="discoverhead"><h2>Discover</h2><button className={`area-link ${!area.loading&&!area.value?'needs-area':''}`} aria-label="Search area & preferences" onClick={()=>setPreferences(true)}><Icon name="Location"/><span>{area.loading ? 'Search area' : area.error ? 'Check search area' : area.value || 'Choose an area'}</span><span className="area-chevron" aria-hidden="true">⌄</span></button></div>
  <div className="discovertools"><DiscoverModes adult={adult} mode={mode} discoverSearch={search.toString()} onModeChange={setMode}/><div className="row discover-tool-row"><button className="discover-tool" aria-label={`${mode} preferences`} onClick={()=>setPreferences(true)}><span className="discover-tool-icon"><Icon name="DiscoveryPreferences"/></span><span className="discover-tool-label" aria-hidden="true">Filters</span></button><Link className="discover-tool discovery-activity" to="/matches" aria-label="Matches and activity"><span className="discover-tool-icon"><Icon name="DiscoveryActivity" /></span><span className="discover-tool-label" aria-hidden="true">Activity</span></Link></div></div>
  <ResourceState loading={!allowance.value && allowance.checking} error={allowance.error} reload={()=>void allowance.refresh()} skeleton={<span className="sr-only" role="status">Checking request availability</span>}/>
 {allowance.limited ? <section className="friends-waiting discovery-request-limit" aria-labelledby="request-limit-title">
  <Icon name="Clock"/><h2 id="request-limit-title">You’ve reached today’s request limit.</h2>
  <p>You can send 10 new requests across Friends and Dating in 24 hours.</p>
  {allowance.value?.availableAt ? <p>Your next request is available <time dateTime={allowance.value.availableAt}>{new Date(allowance.value.availableAt).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'})}</time>.</p> : <p>Check back as your earlier requests pass 24 hours.</p>}
  <div className="row wrap"><Link className="btn" to="/messages">Go to Messages</Link><Link className="btn light" to="/messages/requests">View incoming requests</Link><ActionButton secondary disabled={allowance.checking || allowance.busy} onClick={()=>void allowance.refresh()}>Check availability</ActionButton></div>
 </section> : <>
 <div hidden={mode!=='Friends'}><Friends visible={mode==='Friends'} allowance={allowance} key={current.session.user.id} token={current.session.access_token} revision={revision}/></div>
 {adult&&<div hidden={mode!=='Dating'}><Dating visible={mode==='Dating'} allowance={allowance} key={current.session.user.id} token={current.session.access_token} revision={revision}/></div>}
 </>}
  {preferences&&<Modal className={mode==='Friends'?'friends-preferences-modal':'dating-preferences-modal'} title={`${mode} preferences`} close={()=>{if(!preferencesBusy){setPreferences(false);setEpoch(value=>value+1)}}}>{mode==='Friends'?<FriendsPreferencesPanel onSavingChange={setPreferencesBusy} done={()=>{setPreferences(false);setEpoch(value=>value+1)}}/>:<DatingPreferencesPanel onSavingChange={setPreferencesBusy} done={()=>{setPreferences(false);setEpoch(value=>value+1)}}/>}</Modal>}
 </div>
}
