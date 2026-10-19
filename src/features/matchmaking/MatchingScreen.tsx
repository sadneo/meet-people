import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useSession } from '../../auth/useSession'
import { supabase } from '../../supabase'
import { Icon } from '../prototype/ui'
import { PixelPebble } from '../pebble-art/PixelArt'
import { MatchingProfileSchema, type MatchingMode, type MatchingProfile } from '../../../shared/matchmaking'
import { useMatchmaking } from './useMatchmaking'
import { DeviceDisplayPreferences } from './DeviceDisplayPreferences'
import { withAccountIdentity, type AccountProfile } from '../../../shared/account-profile'
import { ProfileInterests } from '../prototype/ProfileInterests'
import { useSavedIdentity } from '../account/useSavedIdentity'
import { ReadyPreferencesSchema, readinessMessage } from '../../../shared/profile-readiness'
import { useAccount } from '../../auth/account-context'
import { ConnectButton } from '../connections/ConnectButton'
import { FriendsAvailability, FriendsInterests, FriendsPartyPreference, FriendsScene } from './FriendsPresentation'
import './friends.css'

const blankProfile: MatchingProfile = { username: '', display_name: '', bio: null, birthdate: null, location_city: null, avatar_url: null, interests: [], availability: [] }
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const setupBlocks = [
  { label: 'Morning', start_time: '08:00:00', end_time: '12:00:00' },
  { label: 'Afternoon', start_time: '12:00:00', end_time: '17:00:00' },
  { label: 'Evening', start_time: '17:00:00', end_time: '21:00:00' },
  { label: 'Late', start_time: '21:00:00', end_time: '24:00:00' },
]

// This workspace owns only a server-profile draft. It never reads PrototypeContext
// or device storage, and uses the same identity prerequisite as the existing editor.
export function MatchingSetup({ token, initial = null, busy, error, save, findFriends, searching = false, presentation = 'setup', writesAvailable = true, minimumRequired = false, submitLabel, canonicalIdentity, friends = false, savedIdentity }: { token: string; initial?: MatchingProfile | null; busy: boolean; error: string; save: (profile: MatchingProfile) => Promise<boolean>; findFriends?: (profile: MatchingProfile) => Promise<boolean>; searching?: boolean; navigation?: boolean; presentation?: 'setup' | 'profile'; writesAvailable?: boolean; minimumRequired?: boolean; submitLabel?: string; canonicalIdentity?: AccountProfile; friends?: boolean; savedIdentity?: ReturnType<typeof useSavedIdentity> }) {
  const [draft, setDraft] = useState(initial ?? blankProfile)
  const [validation, setValidation] = useState('')
  const read = useSavedIdentity(canonicalIdentity || savedIdentity ? null : token)
  const account = savedIdentity ?? (canonicalIdentity ? { ...read, account: canonicalIdentity, loading: false } : read)
  const submitting = useRef(false)
  const identity = account.account
  const blocked = busy || account.loading || !identity || !writesAvailable
  const update = (patch: Partial<MatchingProfile>) => setDraft(current => ({ ...current, ...patch }))
  return <section className={`match-setup match-setup-dashboard${friends ? ' friends-setup' : ''}`} aria-labelledby={presentation === 'setup' ? 'match-setup-title' : undefined} aria-label={presentation === 'profile' ? 'Shared profile preferences' : undefined}>
    {presentation === 'setup' && <>
    <header className="match-dashboard-heading match-setup-heading"><p>Active matchmaking</p><h2 id="match-setup-title" aria-label="Find your people">Find your people{friends ? '.' : ''}</h2>{friends && <div className="friends-intro-copy">A shared interest. A little free time.<br />That’s all a good friendship needs to start.</div>}</header>
    <div className="match-dashboard-scene match-setup-scene">{friends ? <FriendsScene searching={busy} /> : <div className="pt-mascot-scene match-setup-art" aria-hidden="true"><PixelPebble thinking={busy} /></div>}<p className={`match-focus-status${friends && !busy && initial ? ' pt-sr-only' : ''}`} role="status" aria-live="polite">{busy ? searching ? 'Searching…' : 'Saving shared preferences…' : initial ? friends ? 'Ready when you are.' : 'Your saved shared preferences.' : 'No matching profile saved yet.'}</p></div></>}
    <form aria-label={presentation === 'profile' ? 'Shared profile preferences' : 'Matching profile setup'} onSubmit={async event => {
      event.preventDefault()
      if (blocked || !identity || submitting.current) return
      const { username, display_name, bio, avatar_url } = identity
      const parsed = MatchingProfileSchema.safeParse(withAccountIdentity(draft, { username, display_name, bio, avatar_url }))
      if (!parsed.success) { setValidation('Check your interests and non-overlapping same-day time windows. Up to 30 unique interests and 56 windows are supported.'); return }
      if (minimumRequired && !ReadyPreferencesSchema.safeParse(parsed.data).success) { setValidation(readinessMessage); return }
      setValidation('')
      submitting.current = true
      try { await (findFriends ?? save)(parsed.data) } finally { submitting.current = false }
    }}>
      {friends ? <FriendsInterests values={draft.interests} onChange={interests => update({ interests })} disabled={busy || !writesAvailable} /> : <ProfileInterests values={draft.interests} onChange={interests => update({ interests })} disabled={busy} />}
      <section className={friends ? 'friends-time-editor' : 'match-setup-availability'} role="group" aria-labelledby={friends ? undefined : 'match-setup-availability-title'} aria-label={friends ? 'Weekly availability' : undefined}>
        {friends ? <FriendsAvailability values={draft.availability} onChange={availability => update({ availability })} disabled={busy || !writesAvailable} /> : <><h3 id="match-setup-availability-title">Weekly availability</h3><p id="match-setup-times">Campus time (America/New_York). Choose blocks; scroll for all days. Custom windows stay editable below.</p>
        <div className="match-setup-scroll" role="region" aria-label="Weekly availability, scroll for more days" tabIndex={0}><table aria-label="Weekly availability" aria-describedby="match-setup-times"><colgroup><col className="match-setup-time-column" /><col span={7} /></colgroup><thead><tr><td />{[1, 2, 3, 4, 5, 6, 0].map(dow => <th key={dow} scope="col" abbr={days[dow]}>{days[dow].slice(0, 3)}</th>)}</tr></thead><tbody>{setupBlocks.map(block => <tr key={block.label}><th scope="row">{block.label}<small>{block.start_time.slice(0, 5)}–{block.end_time.slice(0, 5)}</small></th>{[1, 2, 3, 4, 5, 6, 0].map(dow => {
          const index = draft.availability.findIndex(window => window.dow === dow && window.start_time === block.start_time && window.end_time === block.end_time)
          const overlap = draft.availability.some(window => window.dow === dow && window.start_time < block.end_time && window.end_time > block.start_time)
          const conflict = index < 0 && overlap
          return <td key={dow}><button type="button" aria-pressed={index >= 0} aria-label={`${days[dow]} ${block.label.toLowerCase()}, ${index >= 0 ? 'available' : conflict ? 'custom times; edit exact windows' : 'not available'}`} disabled={busy || conflict || (index < 0 && draft.availability.length >= 56)} onClick={() => update({ availability: index >= 0 ? draft.availability.filter((_, i) => i !== index) : [...draft.availability, { dow, start_time: block.start_time, end_time: block.end_time }] })} /></td>
        })}</tr>)}</tbody></table></div></>}
        <details className="match-setup-exact"><summary>Exact time windows ({draft.availability.length})</summary>{draft.availability.map((window, index) => <div className="match-setup-window" key={index}><label>Day {index + 1}<select disabled={busy} value={window.dow} onChange={event => update({ availability: draft.availability.map((item, i) => i === index ? { ...item, dow: Number(event.target.value) } : item) })}>{days.map((day, dow) => <option key={day} value={dow}>{day}</option>)}</select></label>{(['start_time', 'end_time'] as const).map(field => <label key={field}>{field === 'start_time' ? 'Start' : 'End'} {index + 1}<input disabled={busy} value={window[field]} onChange={event => update({ availability: draft.availability.map((item, i) => i === index ? { ...item, [field]: event.target.value } : item) })} /></label>)}<button type="button" className="match-button match-button-secondary" disabled={busy} onClick={() => update({ availability: draft.availability.filter((_, i) => i !== index) })}>Remove window {index + 1}</button></div>)}<button type="button" className="match-button match-button-secondary" disabled={busy || draft.availability.length >= 56} onClick={() => update({ availability: [...draft.availability, { dow: 1, start_time: '17:00:00', end_time: '21:00:00' }] })}>Add time window</button></details>
      </section>
      {presentation === 'profile' && <div className="match-setup-location"><h3>Location &amp; account details</h3><label>City or campus area<input maxLength={120} required={minimumRequired} disabled={busy} value={draft.location_city ?? ''} onChange={event => update({ location_city: event.target.value || null })} /></label><p>Area text does not set coordinates or enforce a travel range.</p><label>{minimumRequired ? 'Birthdate' : 'Birthdate (optional)'}<input type="date" required={minimumRequired} disabled={busy} value={draft.birthdate ?? ''} onChange={event => update({ birthdate: event.target.value || null })} /></label></div>}
      <footer className="match-setup-footer" role="group" aria-label="Matching setup actions">{friends && <FriendsPartyPreference disabled={busy || !writesAvailable} />}{account.loading ? <p role="status">Checking saved identity…</p> : identity ? !friends && <p>Using your saved account identity. Display name and bio are edited on Profile.</p> : <IdentityRetry account={account} busy={busy} />}
        {(validation || error) && <p role="alert">{validation || error}</p>}
        {presentation === 'setup' && <p><Link to="/profile">Edit location and birthdate on Profile</Link></p>}
        {findFriends && <p className={friends ? 'pt-sr-only' : undefined}>Find Friends saves your interests and free time, then starts an active search.</p>}
        <button type="submit" className="match-button match-button-primary" disabled={blocked}>{busy ? searching ? 'Searching…' : 'Saving…' : submitLabel ?? (presentation === 'profile' ? 'Save shared preferences' : findFriends ? 'Find Friends' : 'Save matching preferences')}</button>
      </footer>
    </form>
  </section>
}

function IdentityRetry({ account, busy }: { account: ReturnType<typeof useSavedIdentity>; busy: boolean }) {
  return <div><p role="status">A saved server identity is required before saving matching preferences. {account.error ? 'The account identity service is unavailable.' : 'No saved account identity is available.'} Saving shared preferences is unavailable.</p>
    {account.error && <p>{account.error} Identity is read from the account-profile service; retry cannot install missing backend support.</p>}
    <button type="button" className="match-button match-button-secondary" disabled={busy || account.loading} onClick={account.retry}>Retry saved identity</button><Link className="match-button match-button-secondary" to="/profile">Check Profile identity</Link></div>
}

function SearchReplacement({ cancel, confirm }: { cancel: () => void; confirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current!, opener = document.activeElement as HTMLElement | null
    element.showModal()
    return () => { element.close(); opener?.focus() }
  }, [])
  return <dialog ref={dialog} className="match-preferences match-live-dialog" aria-labelledby="active-replacement-title" onCancel={event => { event.preventDefault(); cancel() }}><h2 id="active-replacement-title">Replace downtime matching?</h2><p>There is one Friends queue. Find Friends replaces downtime with an active search. Cancel keeps downtime unchanged.</p><footer><button type="button" className="match-button match-button-secondary" autoFocus onClick={cancel}>Cancel</button><button type="button" className="match-button match-button-primary" onClick={confirm}>Replace with active search</button></footer></dialog>
}

function ProfileEditor({ initial, busy, error, save, close, token }: { initial: MatchingProfile | null; busy: boolean; error: string; save: (profile: MatchingProfile) => Promise<boolean>; close: () => void; token: string }) {
  const [draft, setDraft] = useState(initial ?? blankProfile)
  const [validation, setValidation] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const account = useSavedIdentity(token)
  // Shared-field writes are always paired with canonical server identity.
  const identity = account.account
  const blocked = busy || account.loading || !identity
  useEffect(() => { dialog.current?.showModal() }, [])
  const update = (patch: Partial<MatchingProfile>) => setDraft(current => ({ ...current, ...patch }))
  const dismiss = () => { dialog.current?.close(); close() }
  return <dialog ref={dialog} className="match-preferences match-live-dialog" aria-labelledby="preferences-title" onCancel={event => { event.preventDefault(); if (!busy) dismiss() }}><form onSubmit={async event => {
    event.preventDefault()
    if (blocked || !identity) return
    const { username, display_name, bio, avatar_url } = identity
    const parsed = MatchingProfileSchema.safeParse(withAccountIdentity(draft, { username, display_name, bio, avatar_url }))
    if (!parsed.success) { setValidation('Check your profile fields and non-overlapping same-day time windows.'); return }
    if (!ReadyPreferencesSchema.safeParse(parsed.data).success) { setValidation(readinessMessage); return }
    setValidation('')
    if (await save(parsed.data)) dismiss()
  }}><header><h2 id="preferences-title">Your preferences</h2><button type="button" className="match-close-button" aria-label="Close preferences" onClick={dismiss} disabled={busy}>×</button></header><div className="match-preferences-body">
    <Link className="match-button match-button-secondary" to="/profile">Profile</Link>
    <p>Location, birthdate, display name and bio are edited on Profile.</p>
    {account.loading ? <p>Checking saved identity…</p> : identity
      ? <p>Using your saved account identity. Saving preferences keeps that server identity.</p>
      : <IdentityRetry account={account} busy={busy} />}
    <ProfileInterests values={draft.interests} onChange={interests => update({ interests })} disabled={busy} />
    <fieldset><legend>Weekly availability</legend><p>Times use America/New_York campus wall time. Same-day windows only; midnight ends are 24:00:00.</p>{draft.availability.map((window, index) => <div className="match-form-row" key={index}>
      <label>Day<select value={window.dow} onChange={event => update({ availability: draft.availability.map((item, i) => i === index ? { ...item, dow: Number(event.target.value) } : item) })}>{days.map((day, dow) => <option key={day} value={dow}>{day}</option>)}</select></label>
      {(['start_time', 'end_time'] as const).map(field => <label key={field}>{field === 'start_time' ? 'Start' : 'End'}<input aria-label={`${field === 'start_time' ? 'Start' : 'End'} ${index + 1}`} placeholder="HH:MM:SS" value={window[field]} onChange={event => update({ availability: draft.availability.map((item, i) => i === index ? { ...item, [field]: event.target.value } : item) })} /></label>)}
      <button type="button" className="match-button match-button-secondary" onClick={() => update({ availability: draft.availability.filter((_, i) => i !== index) })}>Remove window {index + 1}</button>
    </div>)}<button type="button" className="match-button match-button-secondary" disabled={draft.availability.length >= 56} onClick={() => update({ availability: [...draft.availability, { dow: 1, start_time: '17:00:00', end_time: '21:00:00' }] })}>Add time window</button></fieldset>
    {(error || validation) && <p role="alert">{validation || error}</p>}
    </div><footer><button type="button" className="match-button match-button-secondary" disabled={busy} onClick={dismiss}>Cancel</button><button type="submit" className="match-button match-button-secondary" disabled={blocked}>{busy ? 'Saving…' : 'Save preferences'}</button></footer></form></dialog>
}

const connectClasses = { primary: 'match-button match-button-primary', secondary: 'match-button match-button-secondary' }

function MatchingProfileSummary({ profile }: { profile: MatchingProfile }) {
  const clock = (time: string) => time.endsWith(':00') ? time.slice(0, 5) : time
  return <section className="match-dashboard-summary" aria-labelledby="matching-summary-title">
    <h2 id="matching-summary-title">What brings you together</h2>
    <p className="match-dashboard-name">{profile.display_name}</p>
    {profile.bio && <p>{profile.bio}</p>}
    <div className="match-dashboard-interests" aria-label="Saved matching interests">{profile.interests.length ? profile.interests.map((interest, index) => <span key={index}>{interest}</span>) : <p>No matching interests saved.</p>}</div>
    <div className="match-dashboard-details">
      <section aria-labelledby="matching-free-time"><h3 id="matching-free-time">Free time</h3>{profile.availability.length ? <ul>{profile.availability.map((window, index) => <li key={index}>{days[window.dow]} · {clock(window.start_time)}–{clock(window.end_time)}</li>)}</ul> : <p>No weekly time windows saved.</p>}<small>America/New_York campus wall time.</small></section>
      <section aria-labelledby="matching-nearby"><h3 id="matching-nearby">Nearby</h3><p>{profile.location_city || 'Campus area not provided.'}</p><small>Area text does not set coordinates or enforce a travel range.</small></section>
    </div>
  </section>
}

function AuthenticatedMatching({ mode, token, navigation }: { mode: MatchingMode; token: string; navigation: boolean }) {
  const account = useAccount()
  const state = useMatchmaking(token)
  const identity = useSavedIdentity(token)
  const canonical = identity.account
  const searching = state.searchStage !== null
  const replacement = state.confirmReplacement && <SearchReplacement cancel={state.cancelReplacement} confirm={() => void state.confirmSearch()} />
  const [preferences, setPreferences] = useState(false)
  const [profileRevision, setProfileRevision] = useState(0)
  const preferencesButton = useRef<HTMLButtonElement>(null)
  const candidate = state.result?.candidate
  const queuedHere = state.mode === mode
  const replacing = !!state.mode && !queuedHere
  const dashboard = mode === 'active' && state.profileReady && !!state.profile && !state.profileLoading
  useEffect(() => {
    if (account?.focusTarget !== 'matching-preferences' || state.profileLoading || identity.loading) return
    const opener = preferencesButton.current
    if (opener && !opener.disabled) { opener.focus(); account.focusRestored?.() }
  }, [account, dashboard, state.profileLoading, identity.loading])
  const closePreferences = () => { setPreferences(false); preferencesButton.current?.focus() }
  const preferencesControl = <nav className="match-dashboard-controls friends-preferences" aria-label="Matching modes"><button type="button" ref={preferencesButton} className="match-button match-button-secondary" aria-label="Preferences" disabled={state.profileLoading || searching || state.confirmReplacement} onClick={() => setPreferences(true)}><Icon name="settings" size={20} /><span className="pt-sr-only">Preferences</span></button></nav>
  const editor = preferences && <ProfileEditor token={token} initial={state.profile} busy={state.saving || searching} error={state.profileError} save={async profile => { const saved = await state.save(profile); if (saved) { setProfileRevision(value => value + 1); account?.reload({ restoreFocus: 'matching-preferences' }) } return saved }} close={closePreferences} />
  const joinExplanation = !queuedHere && !state.canJoin
    ? state.profileLoading ? 'Loading matching preferences before joining Friends.'
      : state.profileError ? 'Matching preferences are unavailable. Retry loading them before joining Friends.'
        : state.saving ? 'Saving matching preferences before joining Friends.'
          : 'Save matching preferences before joining Friends.'
    : ''
  if (mode === 'active' && state.known && state.mode !== 'active' && state.profileReady && !state.profileLoading) return <>
    {preferencesControl}
    <div hidden={preferences}><MatchingSetup key={profileRevision} friends savedIdentity={identity} initial={state.profile} token={token} busy={state.saving || searching || state.busy} searching={state.searchStage === 'searching'} error={state.profileError || state.error} save={state.save} findFriends={draft => {
      const previous = state.profile && (canonical ? withAccountIdentity(state.profile, canonical) : state.profile)
      const unchanged = previous && (Object.keys(draft) as (keyof MatchingProfile)[]).every(key => JSON.stringify(draft[key]) === JSON.stringify(previous[key]))
      return state.findFriends(unchanged ? undefined : draft)
    }} minimumRequired={!!account || (!!state.profile && ReadyPreferencesSchema.safeParse(state.profile).success)} writesAvailable={!state.confirmReplacement} navigation={navigation} /></div>
    {state.mode === 'downtime' && <p className="friends-downtime">Downtime matching is on. Starting active matching replaces downtime matching.</p>}
    {editor}
    {replacement}
    <div className="pt-focus-secondary"><button className="pt-icon-button pt-quiet-icon" aria-label="Refresh status" title="Refresh status" disabled={state.busy || searching || state.confirmReplacement} onClick={() => void state.queue('refresh')}><Icon name="refresh" size={24} /></button></div>
    <details className="match-device-disclosure"><summary>On this device</summary><DeviceDisplayPreferences /></details>
  </>
  const visual = candidate ? <article className="match-person">
    <div className="match-person-portrait">{candidate.avatar ? <img src={candidate.avatar} alt="" referrerPolicy="no-referrer" /> : <Icon name="profile" size={80} />}</div>
    <h2>{candidate.name}</h2><div className="match-person-interests">{candidate.interests.slice(0, 4).map(interest => <span key={interest}>{interest}</span>)}</div>
    <p>Weekly overlap: {candidate.overlap === 'none' ? 'None' : candidate.overlap === 'some' ? 'Under two hours' : 'Two hours or more'}</p>
    {candidate.meetup && <section><h3>{candidate.meetup.title ?? 'Suggested meetup'}</h3>{candidate.meetup.location && <p>{candidate.meetup.location}</p>}{candidate.meetup.startsAt && <time dateTime={candidate.meetup.startsAt}>{new Date(candidate.meetup.startsAt).toLocaleString()}</time>}</section>}
    <ConnectButton key={candidate.id} userId={candidate.id} name={candidate.name} classes={connectClasses} /><small>Suggested match</small>
  </article> : mode === 'active' ? <FriendsScene searching={!!state.mode || state.busy} /> : <div className="pt-mascot-scene match-mascot" aria-hidden="true">{state.known && <PixelPebble thinking={Boolean(state.mode) || (dashboard && (state.busy || state.checking || state.saving))} />}</div>
  const status = <p className="match-focus-status" role="status" aria-live="polite">{searching ? state.searchStage === 'saving' ? 'Saving shared preferences…' : 'Searching…' : state.busy ? 'Loading…' : !state.known ? 'Matching unavailable' : state.mode ? <>{replacing ? 'Downtime matching is on.' : candidate ? 'Someone to meet' : state.result ? 'No candidate yet' : 'Finding people…'}<span className="pt-sr-only"> You are in the {state.mode} queue.</span></> : 'Ready when you are.'}</p>
  return <>
    {navigation && !dashboard && <MatchingNavigation mode={mode} />}
    <section className={`match-focus ${dashboard ? 'match-dashboard' : ''} ${state.mode ? 'is-searching' : ''}`} aria-label={dashboard ? 'Friends matching dashboard' : undefined}>
      {mode === 'active' && <>{!state.profileLoading && preferencesControl}<header className="match-dashboard-heading"><p>Active matchmaking</p><h2>Find your people.</h2></header></>}
      {dashboard ? <div className={`match-dashboard-scene ${candidate ? 'has-candidate' : ''}`}>{visual}{status}</div> : <>{visual}{status}</>}
      {state.error && <p className="match-error" role="alert">{state.error} Last confirmed status is shown; refresh to check.</p>}
      {!identity.loading && !canonical && !preferences && <IdentityRetry account={identity} busy={searching} />}
      {identity.loading && !preferences && <p>Checking saved identity…</p>}
      {dashboard && state.profile && <details className="friends-saved-summary"><summary>Saved preferences</summary><MatchingProfileSummary profile={canonical ? withAccountIdentity(state.profile, canonical) : state.profile} /></details>}
      <div className={`match-focus-actions ${dashboard ? 'match-dashboard-actions' : ''}`} role={dashboard ? 'region' : undefined} aria-label={dashboard ? 'Matching actions' : undefined}>
        {replacing && <p id="match-replacement-warning">Starting active matching replaces downtime matching.</p>}
        {queuedHere && <button className={`match-button match-button-${candidate ? 'secondary' : 'primary'}`} disabled={state.busy || state.checking || state.saving || searching} onClick={() => void state.check()}>{state.checking ? 'Checking…' : 'Check for a match'}</button>}
        <button type="button" className={`match-button match-button-${queuedHere ? 'secondary' : 'primary'}`} aria-describedby={[joinExplanation ? 'match-join-explanation' : '', replacing ? 'match-replacement-warning' : ''].filter(Boolean).join(' ') || undefined} disabled={state.busy || searching || state.confirmReplacement || !state.known || (!queuedHere && (!state.canJoin || identity.loading || !canonical))} onClick={() => queuedHere ? void state.queue('leave', mode) : mode === 'active' ? void state.findFriends() : void state.queue('join', mode)}>{searching ? state.searchStage === 'saving' ? 'Saving…' : 'Searching…' : queuedHere ? mode === 'downtime' ? 'Pause downtime matching' : 'Cancel search' : mode === 'downtime' ? 'Turn on downtime matching' : 'Find Friends'}</button>
      </div>
      {joinExplanation && <p id="match-join-explanation" className="match-action-explanation">{joinExplanation}</p>}
      {state.profileLoading && <p>Loading profile…</p>}
      {state.profileReady && !state.profile && <><p>No matching profile saved yet.</p><button type="button" className="match-button match-button-secondary" onClick={() => setPreferences(true)}>Set up matching preferences</button></>}
      {state.profileError && !preferences && <><p role="alert">{state.profileError}</p><button className="match-button match-button-secondary" disabled={state.profileLoading} onClick={() => void state.reloadProfile()}>Retry profile</button></>}
      <div className="pt-focus-secondary">
        <button className="pt-icon-button pt-quiet-icon" aria-label="Refresh status" title="Refresh status" disabled={state.busy || searching || state.confirmReplacement} onClick={() => void state.queue('refresh')}><Icon name="refresh" size={24} /></button>
        {state.profileReady && !dashboard && mode !== 'active' && <button ref={preferencesButton} className="pt-icon-button pt-quiet-icon" aria-label="Preferences" title="Preferences" disabled={state.profileLoading} onClick={() => setPreferences(true)}><Icon name="settings" size={24} /></button>}
      </div>
    </section>
    <details className="match-device-disclosure"><summary>On this device</summary><DeviceDisplayPreferences /></details>
    {editor}
    {replacement}
  </>
}

export function MatchingNavigation({ mode }: { mode: MatchingMode }) {
  if (mode === 'active') return null
  return <nav className="match-calm-toolbar" aria-label="Matching modes"><Link className="pt-icon-button pt-quiet-icon" to="/matchmaking" aria-label="Active matchmaking" title="Active matchmaking"><Icon name="matchmaking" size={24} /></Link></nav>
}
export function MatchingScreen({ mode, navigation = true }: { mode: MatchingMode; navigation?: boolean }) {
  const { session, ready } = useSession()
  return <div className="match-home match-live match-calm">{navigation && (!ready || !session) && <MatchingNavigation mode={mode} />}<h1 tabIndex={-1} className="pt-sr-only">{mode === 'active' ? 'Active matchmaking' : 'Downtime matchmaking'}</h1>{!ready ? <section className="match-focus"><div className="pt-mascot-scene" aria-hidden="true"><PixelPebble thinking /></div><p role="status">Loading…</p></section> : !session ? <section className="match-focus"><div className="pt-mascot-scene" aria-hidden="true"><PixelPebble /></div><h2>Sign in to match</h2>{supabase ? <Link className="pt-button pt-discovery-action" to={`/login?returnTo=${mode === 'active' ? '/matchmaking' : '/downtime-matchmaking'}`}>Sign in</Link> : <><button className="pt-button pt-discovery-action" disabled>Sign in</button><small role="status">Sign-in unavailable</small></>}
  </section> : <AuthenticatedMatching key={session.access_token} mode={mode} token={session.access_token} navigation={navigation} />}</div>
}
