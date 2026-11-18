import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { interestSelectionProblem } from '../../shared/interests'
import type { MatchingSetupStatus } from '../../shared/friends-discovery'
import { datingDiscoveryBlocker } from '../../shared/dating-live'
import { datingLiveClient } from '../features/matchmaking/dating-live-client'
import { useProfilePhoto } from '../features/account/useProfilePhoto'
import { ActionButton, ErrorMessage, Modal, ResourceState } from './common'
import { useCurrent } from './current'
import { useAction, useLoad } from './hooks'
import { matchingClient } from './matching-client'
import { useMatchingSetupStatus } from './useMatchingSetupStatus'
import { MatchingSchedule } from './MatchingSchedule'
import { DatingPreferencesPanel, FriendsPreferencesPanel } from './Preferences'
import { Availability, Interests, PhotoEditor, type PhotoEditorHandle } from './Profile'
import './matching-setup.css'

type Mode = 'friends' | 'dating' | 'event' | 'group'
const names = { friends: 'Friends matchmaking', dating: 'Dating', event: 'event matching', group: 'group matching' }

export function MatchingSetup({ mode, close, done }: { mode: Mode; close: () => void; done: () => void }) {
  const [busy, setBusy] = useState(false)
  return <Modal className="matching-setup-modal" title={`Set up ${names[mode]}`} close={() => { if (!busy) close() }}>
    <MatchingSetupContent mode={mode} done={done} onBusyChange={setBusy}/>
  </Modal>
}

export function MatchingSetupContent({ mode, done, onBusyChange }: {
  mode: Mode; done: () => void; onBusyChange: (busy: boolean) => void
}) {
  const status = useMatchingSetupStatus()
  return <div className="matching-setup">
    <ResourceState loading={status.loading} error={status.error} reload={status.reload}/>
    {status.value && <MatchingSetupSteps mode={mode} status={status.value} done={done} onBusyChange={onBusyChange}/>}
  </div>
}

function MatchingSetupSteps({ mode, status, done, onBusyChange }: {
  mode: Mode; status: MatchingSetupStatus; done: () => void; onBusyChange: (busy: boolean) => void
}) {
  const [profileSaved, setProfileSaved] = useState(status.profileReady)
  const [scheduleSaved, setScheduleSaved] = useState(status.groupScheduleReady)
  const current = useCurrent()
  const token = current.session.access_token
  const client = useMemo(() => matchingClient(token), [token])

  const steps = mode === 'group' ? ['Profile', 'Schedule', 'Area'] : mode === 'dating' ? ['Profile', 'Preferences'] : ['Profile', 'Area']
  const step = !profileSaved ? 0 : mode === 'group' && !scheduleSaved ? 1 : mode === 'group' ? 2 : 1
  const progress = <SetupProgress steps={steps} step={step}/>
  if (!profileSaved) return <>{progress}<div className="setup-step" key="profile"><SharedProfileStep onBusyChange={onBusyChange} done={() => setProfileSaved(true)}/></div></>
  if (mode === 'group' && !scheduleSaved) return <>{progress}<div className="setup-step" key="schedule"><GroupScheduleStep onBusyChange={onBusyChange} done={() => setScheduleSaved(true)}/></div></>

  async function finishFriends() {
    if (mode === 'friends') {
      // The POST is idempotent. Confirm the owner state first on every attempt.
      const before = await client.friendsStatus()
      if (!before.eligible && before.reason === 'discovery_off') return 'Turn on Friends discovery in your privacy settings first.'
      if (!before.eligible) await client.startFriends()
      return (await client.friendsStatus()).eligible ? '' : 'Friends setup could not be confirmed.'
    }
    const saved = await client.matchingSetup()
    if (!saved.profileReady) return 'Add a profile photo and at least one interest before matching.'
    if (!saved.friendsAreaReady) return 'Confirm your search area again before matching.'
    if (mode === 'group' && !saved.groupScheduleReady) return 'Choose at least one hour of availability and save your timezone.'
    return ''
  }

  async function finishDating() {
    const dating = datingLiveClient(token)
    const saved = await dating.status()
    const blocker = datingDiscoveryBlocker(saved)
    if (blocker === 'profile' || blocker === 'location' || blocker === 'preferences') {
      return 'Review your Dating details and search area.'
    }
    if (blocker === 'discovery_off') return 'Turn on Dating discovery in your privacy settings first.'
    if (blocker && blocker !== 'paused') return 'Dating setup could not be confirmed. Check your photo, interests, and search area.'
    if (!saved.aggregate.profile.enabled) {
      await dating.enable({ enabled: true, expectedProfileRevision: saved.aggregate.profileRevision, expectedSearchRevision: saved.aggregate.searchRevision })
    }
    return ''
  }

  if (mode === 'dating') return <>
    {progress}
    <div className="setup-step" key="preferences">
    <DatingSetupPreferences done={done} finishSetup={finishDating} onBusyChange={onBusyChange}/>
    </div>
  </>

  if (mode !== 'friends' && status.friendsAreaReady) return <>
    <ConfirmMatchingReadiness mode={mode} done={done} onBusyChange={onBusyChange}/>
  </>

  return <>
    {progress}
    <div className="setup-step" key="area">
    <h3>Choose your search area</h3>
    <p>{mode === 'friends' ? 'When you save, your profile can appear in Friends. You can pause in your discovery settings.' : 'Event and group matching use the Friends search area.'}</p>
    <FriendsPreferencesPanel done={done} onSavingChange={onBusyChange} finishSetup={finishFriends}
      submitLabel={mode === 'friends' ? 'Save and start Friends' : 'Finish setup'}/>
    </div>
  </>
}

function ConfirmMatchingReadiness({ mode, done, onBusyChange }: { mode: 'event' | 'group'; done: () => void; onBusyChange: (busy: boolean) => void }) {
  const token = useCurrent().session.access_token
  const ready = useLoad(useCallback(async signal => {
    const saved = await matchingClient(token).matchingSetup(signal)
    if (!saved.profileReady || !saved.friendsAreaReady || (mode === 'group' && !saved.groupScheduleReady))
      throw new Error('Setup has changed. Close and reopen setup to review the missing details.')
    return true
  }, [mode, token]))
  const finished = useRef(false)
  useEffect(() => {
    onBusyChange(ready.loading)
    if (ready.value && !finished.current) { finished.current = true; done() }
  }, [ready.loading, ready.value, done, onBusyChange])
  return <ResourceState loading={ready.loading} error={ready.error} reload={ready.reload}/>
}

function SetupProgress({ steps, step }: { steps: string[]; step: number }) {
  return <div className="setup-progress">
    <p className="setup-progress-label">Step {step + 1} of {steps.length} · {steps[step]}</p>
    <ol aria-hidden="true">{steps.map((name, index) => <li key={name} className={index < step ? 'done' : index === step ? 'current' : ''}/>)}</ol>
  </div>
}

function DatingSetupPreferences({ done, finishSetup, onBusyChange }: { done: () => void; finishSetup: () => Promise<string>; onBusyChange: (busy: boolean) => void }) {
  const token = useCurrent().session.access_token
  const runtime = useLoad(useCallback(signal => datingLiveClient(token).status(signal), [token]))
  return <>
    <ResourceState loading={runtime.loading} error={runtime.error} reload={runtime.reload}/>
    {runtime.value?.aggregate.profile.enabled ? <>
      {runtime.value.aggregate.eligibility.locationResolved
        ? <ActionButton onClick={done}>Continue</ActionButton>
        : <p>Pause Dating from Discover to confirm your search area again.</p>}
    </> : runtime.value && <DatingPreferencesPanel view="setup" done={done} onSavingChange={onBusyChange} finishSetup={finishSetup}/>}
  </>
}

function SharedProfileStep({ done, onBusyChange }: { done: () => void; onBusyChange: (busy: boolean) => void }) {
  const current = useCurrent()
  const photo = useProfilePhoto()
  const action = useAction()
  const account = current.account!
  const profile = account.profile!
  const [interests, setInterests] = useState(profile.interests)
  const photoEditor = useRef<PhotoEditorHandle>(null)
  const saving = useRef(false)
  const busy = action.busy || current.busy || current.loading

  function submit(event: FormEvent) {
    event.preventDefault()
    if (saving.current || busy) return
    saving.current = true
    onBusyChange(true)
    void action.run(async () => {
      const problem = interestSelectionProblem(interests)
      if (problem) throw new Error(problem)
      if (!photoEditor.current) throw new Error('Your photo is still loading. Try again.')
      await photoEditor.current.save()
      if (JSON.stringify(interests) !== JSON.stringify(profile.interests) &&
          !await current.save({ ...account, profile: { ...profile, interests } })) return
      done()
    }).finally(() => { saving.current = false; onBusyChange(false) })
  }

  return <>
    <h3>Your matching profile</h3>
    <p>Your photo and interests carry across matching features.</p>
    <PhotoEditor ref={photoEditor} busy={busy}/>
    <form className="account-form" onSubmit={submit}>
      <fieldset disabled={busy}><Interests value={interests} change={setInterests}/></fieldset>
      <ErrorMessage>{action.error || current.error}</ErrorMessage>
      {current.error && <ActionButton secondary disabled={busy} onClick={current.reload}>Reload profile</ActionButton>}
      <button className="btn" disabled={busy || photo.loading || !current.available}>Save and continue</button>
    </form>
  </>
}

function GroupScheduleStep({ done, onBusyChange }: { done: () => void; onBusyChange: (busy: boolean) => void }) {
  const current = useCurrent()
  const account = current.account!
  const profile = account.profile!
  const [availability, setAvailability] = useState(profile.availability)
  const [scheduleBusy, setScheduleBusy] = useState(false)
  const action = useAction()
  const token = current.session.access_token
  const busy = action.busy || current.busy || current.loading
  const setScheduleState = useCallback((saving: boolean) => { setScheduleBusy(saving); onBusyChange(saving) }, [onBusyChange])

  function submit(event: FormEvent) {
    event.preventDefault()
    onBusyChange(true)
    void action.run(async () => {
      const client = matchingClient(token)
      if (!availability.length) throw new Error('Choose at least one hour when you can meet.')
      if (!(await client.schedule()).timeZone) throw new Error('Choose a timezone for your availability.')
      if (JSON.stringify(availability) !== JSON.stringify(profile.availability) &&
          !await current.save({ ...account, profile: { ...profile, availability } })) return
      if (!(await client.matchingSetup()).groupScheduleReady) throw new Error('Choose at least one continuous hour when you can meet.')
      done()
    }).finally(() => onBusyChange(false))
  }

  return <>
    <h3>When can you meet?</h3>
    <p>Groups need at least one shared hour. Choose a time in your usual week.</p>
    <form className="account-form" onSubmit={submit}>
      <fieldset disabled={busy || scheduleBusy}><Availability value={availability} change={setAvailability}/></fieldset>
      <MatchingSchedule token={token} disabled={busy} onSaved={() => action.clearError()} onBusyChange={setScheduleState} compact/>
      <ErrorMessage>{action.error || current.error}</ErrorMessage>
      {current.error && <ActionButton secondary disabled={busy} onClick={current.reload}>Reload profile</ActionButton>}
      <button className="btn" disabled={busy || scheduleBusy || !current.available}>Save and continue</button>
    </form>
  </>
}
