import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useSession } from '../../auth/useSession'
import { getLocalDevelopmentEnvironment, isLocalDevelopment } from '../../auth/localDevelopment'
import { supabase } from '../../supabase'
import { Button, Icon } from '../prototype/ui'
import { PixelPebble } from '../pebble-art/PixelArt'
import { MatchingProfileSchema, type MatchingMode, type MatchingProfile } from '../../../shared/matchmaking'
import { useMatchmaking } from './useMatchmaking'
import { DeviceDisplayPreferences } from './DeviceDisplayPreferences'
import { useAccount } from '../../auth/account-context'

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
  const account = useAccount()
  const state = useMatchmaking(token)
  const [preferences, setPreferences] = useState(false)
  const preferencesButton = useRef<HTMLButtonElement>(null)
  const candidate = state.result?.candidate
  const closePreferences = () => { setPreferences(false); preferencesButton.current?.focus() }
  return <>
    <section className={`match-focus ${state.mode ? 'is-searching' : ''}`}>
      {candidate ? <article className="match-person"><div className="match-person-portrait">{candidate.avatar ? <img src={candidate.avatar} alt="" referrerPolicy="no-referrer" /> : <Icon name="profile" size={80} />}</div><h2>{candidate.name}</h2><div className="match-person-interests">{candidate.interests.slice(0, 4).map(interest => <span key={interest}>{interest}</span>)}</div><p>Weekly overlap: {candidate.overlap === 'none' ? 'None' : candidate.overlap === 'some' ? 'Under two hours' : 'Two hours or more'}</p>{candidate.meetup && <section><h3>{candidate.meetup.title ?? 'Suggested meetup'}</h3>{candidate.meetup.location && <p>{candidate.meetup.location}</p>}{candidate.meetup.startsAt && <time dateTime={candidate.meetup.startsAt}>{new Date(candidate.meetup.startsAt).toLocaleString()}</time>}</section>}<small>Suggested match</small></article> : <div className="pt-mascot-scene match-mascot" aria-hidden="true"><PixelPebble thinking={Boolean(state.mode) || state.busy} /></div>}
      <p className="match-focus-status" role="status" aria-live="polite">{state.busy ? 'Loading…' : !state.known ? 'Matching unavailable' : state.mode ? <>{candidate ? 'Someone to meet' : state.result ? 'No candidate yet' : 'Finding people…'}<span className="pt-sr-only"> You are in the {state.mode} queue.</span></> : 'Ready when you are.'}</p>
      {state.error && <p className="match-error" role="alert">{state.error} Last confirmed status is shown; refresh to check.</p>}
      <div className="match-focus-actions">
        {state.mode && <button className="match-button match-button-primary" disabled={state.busy || state.checking || state.saving} onClick={() => void state.check()}>{state.checking ? 'Checking…' : 'Check for a match'}</button>}
        <button type="button" className={`match-button match-button-${state.mode ? 'secondary' : 'primary'}`} disabled={state.busy || !state.known || (!state.mode && !state.canJoin)} onClick={() => void state.queue(state.mode ? 'leave' : 'join', mode)}>{state.mode ? mode === 'downtime' ? 'Pause downtime matching' : 'Cancel search' : mode === 'downtime' ? 'Turn on downtime matching' : 'Start matching'}</button>
        {state.mode && state.mode !== mode && <button className="match-button match-button-secondary" disabled={state.busy || !state.canJoin} onClick={() => void state.queue('join', mode)}>Switch to {mode} queue</button>}
      </div>
      {state.profileLoading && <p>Loading profile…</p>}
      {state.profileReady && !state.profile && <p>No matching profile saved yet.</p>}
      {state.profileError && !preferences && <><p role="alert">{state.profileError}</p><button className="match-button match-button-secondary" disabled={state.profileLoading} onClick={() => void state.reloadProfile()}>Retry profile</button></>}
      <div className="pt-focus-secondary">
        <button className="pt-icon-button pt-quiet-icon" aria-label="Refresh status" title="Refresh status" disabled={state.busy} onClick={() => void state.queue('refresh')}><Icon name="refresh" size={24} /></button>
        {state.profileReady && <button ref={preferencesButton} className="pt-icon-button pt-quiet-icon" aria-label="Preferences" title="Preferences" disabled={state.profileLoading} onClick={() => setPreferences(true)}><Icon name="settings" size={24} /></button>}
      </div>
    </section>
    <details className="match-device-disclosure"><summary>On this device</summary><DeviceDisplayPreferences /></details>
    {preferences && <ProfileEditor initial={state.profile} busy={state.saving} error={state.profileError} save={async profile => { const saved = await state.save(profile); if (saved) await account?.reload(); return saved }} close={closePreferences} />}
  </>
}

function LocalQuickSignIn() {
  const [busy, setBusy] = useState(false)
  const requestPending = useRef(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  return <div className="match-focus-actions">
    <Button secondary disabled={!supabase || busy} onClick={async () => {
      if (!import.meta.env.DEV || !isLocalDevelopment(getLocalDevelopmentEnvironment()) || !supabase || requestPending.current) return
      requestPending.current = true
      setBusy(true); setFailed(false); setMessage('Signing in locally…')
      try {
        const { error } = await supabase.auth.signInAnonymously()
        if (error) throw error
        setMessage('Signed in with a disposable local development session.')
      } catch { setFailed(true); setMessage('Could not complete local quick sign-in. Check that anonymous Auth is enabled locally, or use the Sign in link.') }
      finally { requestPending.current = false; setBusy(false) }
    }}>{busy ? 'Signing in locally…' : 'Quick sign in (local only)'}</Button>
    <small>Local development only: a disposable anonymous Supabase session, not a permanent email account.</small>
    {message && <p className="match-error" role={failed ? 'alert' : 'status'}>{message}</p>}
  </div>
}
export function MatchingScreen({ mode }: { mode: MatchingMode }) {
  const { session, ready } = useSession()
  const localDevelopment = import.meta.env.DEV && isLocalDevelopment(getLocalDevelopmentEnvironment())
  return <div className="match-home match-live match-calm"><header className="match-calm-toolbar"><h1 tabIndex={-1} className="pt-sr-only">{mode === 'active' ? 'Active matchmaking' : 'Downtime matchmaking'}</h1><Link className="pt-icon-button pt-quiet-icon" to={mode === 'active' ? '/downtime-matchmaking' : '/matchmaking'} aria-label={mode === 'active' ? 'Downtime matchmaking' : 'Active matchmaking'} title={mode === 'active' ? 'Downtime matchmaking' : 'Active matchmaking'}><Icon name={mode === 'active' ? 'time' : 'matchmaking'} size={24} /></Link></header>{!ready ? <section className="match-focus"><div className="pt-mascot-scene" aria-hidden="true"><PixelPebble thinking /></div><p role="status">Loading…</p></section> : !session ? <section className="match-focus"><div className="pt-mascot-scene" aria-hidden="true"><PixelPebble /></div><h2>Sign in to match</h2>{supabase ? <Link className="pt-button pt-discovery-action" to={`/login?returnTo=${mode === 'active' ? '/matchmaking' : '/downtime-matchmaking'}`}>Sign in</Link> : <><button className="pt-button pt-discovery-action" disabled>Sign in</button><small role="status">Sign-in unavailable</small></>}{localDevelopment && <LocalQuickSignIn />}
  </section> : <AuthenticatedMatching key={session.access_token} mode={mode} token={session.access_token} />}</div>
}
