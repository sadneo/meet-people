import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useSession } from '../../auth/useSession'
import { EmailLinkSignIn } from '../../auth/EmailLinkSignIn'
import { MatchingProfileSchema, type MatchingMode, type MatchingProfile } from '../../../shared/matchmaking'
import { useMatchmaking } from './useMatchmaking'
import { DeviceDisplayPreferences } from './DeviceDisplayPreferences'

const blankProfile: MatchingProfile = { username: '', display_name: '', bio: null, birthdate: null, location_city: null, avatar_url: null, interests: [], availability: [] }
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function ProfileEditor({ initial, busy, error, save, close }: { initial: MatchingProfile | null; busy: boolean; error: string; save: (profile: MatchingProfile) => Promise<boolean>; close: () => void }) {
  const [draft, setDraft] = useState(initial ?? blankProfile)
  const [validation, setValidation] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  const update = (patch: Partial<MatchingProfile>) => setDraft(current => ({ ...current, ...patch }))
  const dismiss = () => { dialog.current?.close(); close() }
  return <dialog ref={dialog} className="match-preferences match-live-dialog" aria-labelledby="preferences-title" onCancel={event => { event.preventDefault(); if (!busy) dismiss() }}><form onSubmit={async event => {
    event.preventDefault()
    const parsed = MatchingProfileSchema.safeParse(draft)
    if (!parsed.success) { setValidation('Check your profile fields and non-overlapping same-day time windows.'); return }
    setValidation('')
    if (await save(parsed.data)) dismiss()
  }}><header><h2 id="preferences-title">Your preferences</h2><button type="button" className="match-close-button" aria-label="Close preferences" onClick={dismiss} disabled={busy}>×</button></header><div className="match-preferences-body">
    <label>Username<input required maxLength={80} value={draft.username} onChange={event => update({ username: event.target.value })} /></label>
    <label>Display name<input required maxLength={120} value={draft.display_name} onChange={event => update({ display_name: event.target.value })} /></label>
    <label>Bio<textarea maxLength={1000} value={draft.bio ?? ''} onChange={event => update({ bio: event.target.value || null })} /></label>
    <label>Birthdate (optional)<input type="date" value={draft.birthdate ?? ''} onChange={event => update({ birthdate: event.target.value || null })} /></label>
    <label>City or campus area<input maxLength={120} value={draft.location_city ?? ''} onChange={event => update({ location_city: event.target.value || null })} /></label>
    <p>Area text does not set coordinates or enforce a travel range.</p>
    <label>Avatar URL (HTTPS, optional)<input type="url" maxLength={2048} value={draft.avatar_url ?? ''} onChange={event => update({ avatar_url: event.target.value || null })} /></label>
    <fieldset><legend>Interests</legend><p>Each field is one interest label; line breaks within a label are preserved.</p>{draft.interests.map((interest, index) => <div key={index}><label>Interest {index + 1}<textarea required maxLength={120} disabled={busy} value={interest} onChange={event => update({ interests: draft.interests.map((item, i) => i === index ? event.target.value : item) })} /></label><button type="button" className="match-button match-button-secondary" disabled={busy} onClick={() => update({ interests: draft.interests.filter((_, i) => i !== index) })}>Remove interest {index + 1}</button></div>)}<button type="button" className="match-button match-button-secondary" disabled={busy || draft.interests.length >= 30} onClick={() => update({ interests: [...draft.interests, ''] })}>Add interest</button></fieldset>
    <fieldset><legend>Weekly availability</legend><p>Times use America/New_York campus wall time. Same-day windows only; midnight ends are 24:00:00.</p>{draft.availability.map((window, index) => <div className="match-form-row" key={index}>
      <label>Day<select value={window.dow} onChange={event => update({ availability: draft.availability.map((item, i) => i === index ? { ...item, dow: Number(event.target.value) } : item) })}>{days.map((day, dow) => <option key={day} value={dow}>{day}</option>)}</select></label>
      {(['start_time', 'end_time'] as const).map(field => <label key={field}>{field === 'start_time' ? 'Start' : 'End'}<input aria-label={`${field === 'start_time' ? 'Start' : 'End'} ${index + 1}`} placeholder="HH:MM:SS" value={window[field]} onChange={event => update({ availability: draft.availability.map((item, i) => i === index ? { ...item, [field]: event.target.value } : item) })} /></label>)}
      <button type="button" className="match-button match-button-secondary" onClick={() => update({ availability: draft.availability.filter((_, i) => i !== index) })}>Remove window {index + 1}</button>
    </div>)}<button type="button" className="match-button match-button-secondary" disabled={draft.availability.length >= 56} onClick={() => update({ availability: [...draft.availability, { dow: 1, start_time: '17:00:00', end_time: '21:00:00' }] })}>Add time window</button></fieldset>
    {(error || validation) && <p role="alert">{validation || error}</p>}
    </div><footer><button type="button" className="match-button match-button-secondary" disabled={busy} onClick={dismiss}>Cancel</button><button type="submit" className="match-button match-button-secondary" disabled={busy}>{busy ? 'Saving…' : 'Save preferences'}</button></footer></form></dialog>
}

function AuthenticatedMatching({ mode, token }: { mode: MatchingMode; token: string }) {
  const state = useMatchmaking(token)
  const [preferences, setPreferences] = useState(false)
  const preferencesButton = useRef<HTMLButtonElement>(null)
  const candidate = state.result?.candidate
  const closePreferences = () => { setPreferences(false); preferencesButton.current?.focus() }
  return <>
    <section className="match-record-card"><h2>Matching queue</h2>
      <p role="status" aria-live="polite">{state.busy ? 'Loading queue status…' : !state.known ? 'Queue status unavailable.' : state.mode ? `You are in the ${state.mode} queue.` : 'Ready when you are.'}</p>
      {state.error && <p role="alert">{state.error} Last confirmed status is shown; refresh to check.</p>}
      <div className="match-live-actions"><button type="button" className={`match-button match-button-${state.mode ? 'secondary' : 'primary'}`} disabled={state.busy || !state.known || (!state.mode && !state.canJoin)} onClick={() => void state.queue(state.mode ? 'leave' : 'join', mode)}>{state.mode ? mode === 'downtime' ? 'Pause downtime matching' : 'Cancel search' : mode === 'downtime' ? 'Turn on downtime matching' : 'Start matching'}</button>
      {state.mode && state.mode !== mode && <button className="match-button match-button-secondary" disabled={state.busy || !state.canJoin} onClick={() => void state.queue('join', mode)}>Switch to {mode} queue</button>}
      <button className="match-button match-button-secondary" disabled={state.busy} onClick={() => void state.queue('refresh')}>Refresh status</button>
      {state.mode && <button className="match-button match-button-secondary" disabled={state.busy || state.checking || state.saving} onClick={() => void state.check()}>{state.checking ? 'Checking…' : 'Check for a match'}</button>}</div>
      <p>One person at a time. Checking is manual; no background scoring or notifications.</p>
      {!state.canJoin && <p>Load and save a matching profile before joining a queue. You can still refresh status or leave an existing queue.</p>}
    </section>
    {state.result && !candidate && <section className="match-record-card"><h2>No candidate yet</h2><p>You can check again later or cancel your search.</p></section>}
    {candidate && <article className="match-record-card"><h2>{candidate.name}</h2>{candidate.avatar && <img src={candidate.avatar} alt="" width={64} height={64} referrerPolicy="no-referrer" />}<p>Shared interests: {candidate.interests.length ? candidate.interests.join(', ') : 'No shared labels returned'}</p><p>Weekly overlap: {candidate.overlap === 'none' ? 'None' : candidate.overlap === 'some' ? 'Under two hours' : 'Two hours or more'}</p>{candidate.meetup && <section><h3>{candidate.meetup.title ?? 'Suggested meetup'}</h3>{candidate.meetup.location && <p>{candidate.meetup.location}</p>}{candidate.meetup.startsAt && <time dateTime={candidate.meetup.startsAt}>{new Date(candidate.meetup.startsAt).toLocaleString()}</time>}</section>}<p>This is a suggestion, not an invitation or confirmed connection.</p></article>}
    <section className="match-record-card"><h2>Matching profile</h2>{state.profileLoading && <p>Loading profile…</p>}{state.profileError && !preferences && <><p role="alert">{state.profileError}</p><button className="match-button match-button-secondary" disabled={state.profileLoading} onClick={() => void state.reloadProfile()}>Retry profile</button></>}{state.profileReady && <><p>{state.profile ? state.profile.display_name : 'No matching profile saved yet.'}</p>{state.profile && <p>{state.profile.interests.join(', ') || 'No interests added.'}</p>}<button ref={preferencesButton} className="match-button match-button-secondary" disabled={state.profileLoading} onClick={() => setPreferences(true)}>Preferences</button></>}<p>Birthdate is optional. Coordinates and travel limits are not collected here.</p></section>
    <DeviceDisplayPreferences />
    {preferences && <ProfileEditor initial={state.profile} busy={state.saving} error={state.profileError} save={state.save} close={closePreferences} />}
  </>
}

export function MatchingScreen({ mode }: { mode: MatchingMode }) {
  const { session, ready } = useSession()
  return <div className="match-home match-live"><header className="match-topbar"><h1>{mode === 'active' ? 'Active matchmaking' : 'Downtime matchmaking'}</h1><Link className="match-mode-switch" to={mode === 'active' ? '/downtime-matchmaking' : '/matchmaking'}>{mode === 'active' ? 'Downtime matchmaking' : 'Active matchmaking'}</Link></header><p>{mode === 'active' ? 'Find someone through shared interests and the existing friendship signals.' : 'Find someone with overlapping weekly free time. Your queue stays on the server until you leave.'}</p>{!ready ? <p role="status">Loading session…</p> : !session ? <EmailLinkSignIn /> : <AuthenticatedMatching key={session.access_token} mode={mode} token={session.access_token} />}</div>
}
