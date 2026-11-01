import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { completedAccountChapters, SaveAccountSchema, type Account } from '../../shared/account'
import type { MatchingProfile } from '../../shared/matchmaking'
import { interestSelectionProblem } from '../../shared/interests'
import { safeReturnTo } from '../auth/returnTo'
import { ActionButton, Brand, ErrorMessage, Icon } from './common'
import { useCurrent } from './current'
import { useAction } from './hooks'
import { Availability, Interests } from './Profile'
import { MatchingSchedule } from './MatchingSchedule'
import { matchingClient } from './matching-client'
import './onboarding.css'

// Adapted from dev's original four-stone onboarding (0e2a469). Progress here is
// confirmed account data; the old prototype's rewards and fixtures are omitted.
const chapters = [
  { label: 'About you', title: 'Start with you.', description: 'A name, a little introduction, and the place you call home.' },
  { label: 'Your interests', title: 'Your kind of things.', description: 'Pick 1–5 interests from the list or your own. You can add up to 2 custom interests.' },
  { label: 'Your people', title: 'What brings you here?', description: 'Choose what you’d enjoy doing with someone new.' },
  { label: 'Your week', title: 'Make room for a hello.', description: 'Choose the times and kinds of plans that work for you.' },
]
const intentions = [
  { value: 'Make friends', label: 'Make friends', detail: 'Find someone you’d like to get to know.', icon: 'Friends' },
  { value: 'Find study buddies', label: 'Find study buddies', detail: 'A little company for your next study session.', icon: 'Profile' },
  { value: 'Meet activity partners', label: 'Meet activity partners', detail: 'Coffee, a walk, a workout, or a shared hobby.', icon: 'Garden' },
  { value: 'Go to events together', label: 'Go to events together', detail: 'Find company for something on your calendar.', icon: 'Events' },
  { value: 'Date', label: 'Explore Dating', detail: 'Set up your Dating preferences in Discover when you’re ready.', icon: 'Dating' },
]

export function Onboarding() {
  const current = useCurrent(), [search] = useSearchParams()
  const completed = completedAccountChapters(current.account!).length
  const [started, setStarted] = useState(completed > 0)
  const [selected, setSelected] = useState<number | null>(null), [editing, setEditing] = useState(false)
  const chapter = selected ?? Math.min(completed, 3)
  const ready = completed === 4
  const destination = safeReturnTo(search.get('returnTo')) ?? '/'
  return <main className={`onboarding-journey ${ready ? 'is-ready' : ''}`}>
    <header className="onboarding-header"><Brand /><Link className="text-link" to="/logout">Save for later & sign out</Link></header>
    {ready ? <section className="onboarding-ending" aria-labelledby="onboarding-ready">
      <div className="onboarding-seed"><img src="/pebble/pebble.png" alt="" width="220" height="166"/><span><Icon name="Check"/></span></div>
      <p className="onboarding-step">All four pieces saved</p><h1 id="onboarding-ready">Your Pebble is ready.</h1>
      <p>Your profile is saved. Discover people, browse events, and make room for a new hello.</p>
      <Link className="btn" to={destination}>Enter Pebble <Icon name="ArrowRight"/></Link>
    </section> : !started ? <section className="onboarding-opening" aria-labelledby="onboarding-welcome">
      <div><p className="onboarding-step">Your first little step</p><h1 id="onboarding-welcome">A little beginning.</h1><p>Tell us a little about you.<br/>We’ll make room for your kind of people.</p>
        <button className="btn" onClick={() => setStarted(true)}>Start my profile <Icon name="ArrowRight"/></button><p className="muted onboarding-save-note">Four short chapters. Pick up where you leave off.</p></div>
      <div className="onboarding-opening-art" aria-hidden="true"><img src="/pebble/pebble.png" alt="" width="455" height="342"/><span className="onboarding-art-caption">A place to start.</span></div>
    </section> : <>
      <div className="onboarding-intro"><h1>A little about you.</h1><p>Four pieces. A place to start.</p></div>
      <div className="onboarding-layout">
        <aside className="onboarding-progress">
          <ol className="onboarding-stones" aria-label="Onboarding progress">{chapters.map((item, index) => <li key={item.label} className={`stone-${index} ${chapter === index ? 'is-current' : ''} ${index < completed ? 'is-saved' : ''}`} aria-current={chapter === index ? 'step' : undefined}>
            <button type="button" disabled={editing || current.busy || index > completed} aria-label={`${item.label}${index < completed ? ', saved' : ''}`} onClick={() => setSelected(index)}><span>{index < completed ? <Icon name="Check"/> : `0${index + 1}`}</span><strong>{item.label}</strong><svg className="onboarding-stone-crack" viewBox="0 0 200 180" aria-hidden="true"><path d="m95 0-10 45 20 26-20 35 15 23-18 51m23-109 40-7 22 15m-62 27-50 12-31-15"/></svg></button>
          </li>)}</ol>
          <p role="status">{completed} of 4 pieces saved</p><p className="muted">One small step at a time.</p>
        </aside>
        <Chapter key={chapter} initial={current.account!} chapter={chapter} onBusyChange={setEditing} advance={() => setSelected(null)}/>
      </div>
    </>}
  </main>
}

function Chapter({ initial, chapter, advance, onBusyChange }: { initial: Account; chapter: number; advance: () => void; onBusyChange: (busy: boolean) => void }) {
  const current = useCurrent(), action = useAction()
  const [source, setSource] = useState(initial), [draft, setDraft] = useState(() => structuredClone(initial))
  const [scheduleBusy, setScheduleBusy] = useState(false)
  const [timezoneError, setTimezoneError] = useState('')
  const title = useRef<HTMLHeadingElement>(null)
  if (source !== initial) { setSource(initial); setDraft(structuredClone(initial)) }
  useEffect(() => { title.current?.focus() }, [])
  useEffect(() => { onBusyChange(action.busy || scheduleBusy); return () => onBusyChange(false) }, [action.busy, scheduleBusy, onBusyChange])
  const profile: MatchingProfile = draft.profile ?? { username: '', display_name: '', bio: null, birthdate: null, location_city: null, avatar_url: null, interests: [], availability: [] }
  const update = (value: Partial<MatchingProfile>) => setDraft(before => ({ ...before, profile: { ...profile, ...value } }))
  const preference = (value: Partial<Account['preferences']>) => setDraft(before => ({ ...before, preferences: { ...before.preferences, ...value } }))
  const disabled = action.busy || current.busy || current.loading
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (scheduleBusy) return
    setTimezoneError('')
    await action.run(async () => {
      if ((chapter === 0 || chapter === 3) && (!profile.birthdate || profile.birthdate > new Date().toISOString().slice(0, 10))) throw new Error('Enter a valid birthdate in the past.')
      if ((chapter === 0 || chapter === 3) && !profile.location_city?.trim()) throw new Error('Enter your city or campus area.')
      if (chapter === 1) {
        const problem = interestSelectionProblem(profile.interests)
        if (problem) throw new Error(problem)
      }
      if (chapter === 2 && !draft.preferences.intents.length) throw new Error('Choose at least one thing you’d like to do.')
      if (chapter === 3 && !profile.availability.length) throw new Error('Add at least one time window for your usual week.')
      const next = SaveAccountSchema.safeParse({ ...draft, profile, completed: Array.from({ length: Math.max(initial.completed.length, chapter + 1) }, (_, i) => i) })
      if (!next.success) throw new Error(next.error.issues[0]?.message ?? 'Complete the required fields.')
      if (chapter === 3) {
        const schedule = await matchingClient(current.session.access_token).schedule()
        if (!schedule.timeZone) { setTimezoneError('Choose a timezone for your weekly availability before finishing.'); return }
      }
      if (await current.save(next.data)) advance()
    })
  }
  return <form className="onboarding-chapter account-form" onSubmit={event => void submit(event)}>
    <p className="onboarding-step">Chapter {chapter + 1} of 4</p>
    <h2 ref={title} tabIndex={-1}>{chapters[chapter].title}</h2><p className="onboarding-description">{chapters[chapter].description}</p>
    <fieldset disabled={disabled || scheduleBusy}>
      {chapter === 0 && <>
        <div className="formgrid"><label>Display name<input autoComplete="name" required maxLength={120} value={profile.display_name} onChange={event => update({ display_name: event.target.value })}/></label><label>Username<input autoComplete="username" required maxLength={80} value={profile.username} onChange={event => update({ username: event.target.value })}/></label></div>
        <label>A little about you <span className="muted">(optional)</span><textarea maxLength={1000} value={profile.bio ?? ''} placeholder="A favourite thing, a small obsession, a good conversation starter…" onChange={event => update({ bio: event.target.value || null })}/></label>
        <HomeAndBirthday profile={profile} update={update}/>
      </>}
      {chapter === 1 && <Interests value={profile.interests} change={interests => update({ interests })}/>}
      {chapter === 2 && <fieldset className="onboarding-intentions"><legend className="sr-only">What would you like to do?</legend>{[...intentions, ...draft.preferences.intents.filter(value => !intentions.some(item => item.value === value)).map(value => ({ value, label: value, detail: 'Your saved choice.', icon: 'Friends' }))].map(item => <label className={`onboarding-choice ${draft.preferences.intents.includes(item.value) ? 'is-selected' : ''}`} key={item.value}>
        <input type="checkbox" aria-label={item.label} aria-description={item.detail} checked={draft.preferences.intents.includes(item.value)} onChange={event => preference({ intents: event.target.checked ? [...draft.preferences.intents, item.value] : draft.preferences.intents.filter(value => value !== item.value) })}/><Icon name={item.icon}/><span><b>{item.label}</b><small>{item.detail}</small></span>
      </label>)}</fieldset>}
      {chapter === 3 && <>
        {(!initial.profile?.birthdate || !initial.profile.location_city?.trim()) && <HomeAndBirthday profile={profile} update={update}/>}
        <div className="formgrid"><label>Comfortable distance<select required value={draft.preferences.distance} onChange={event => preference({ distance: event.target.value as Account['preferences']['distance'] })}><option value="">Choose a distance</option>{['Nearby', '5 miles', '10 miles'].map(label => <option key={label}>{label}</option>)}</select></label><label>Group preference<select required value={draft.preferences.group} onChange={event => preference({ group: event.target.value as Account['preferences']['group'] })}><option value="">Choose a group size</option>{['One-on-one', 'Small groups', 'Either'].map(label => <option key={label}>{label}</option>)}</select></label></div>
        <p className="muted">Set each discovery mode’s search area and distance in Discover.</p>
        <Availability value={profile.availability} change={availability => update({ availability })}/>
      </>}
    </fieldset>
    {chapter === 3 && <section className="onboarding-timezone"><h3>Which timezone is your week in?</h3><MatchingSchedule token={current.session.access_token} disabled={disabled} onSaved={() => setTimezoneError('')} onBusyChange={setScheduleBusy} compact/></section>}
    <ErrorMessage>{timezoneError || action.error || current.error}</ErrorMessage>
    {current.error && <ActionButton secondary disabled={disabled} onClick={current.reload}>Reload account and replace draft before saving again</ActionButton>}
    <button className="btn onboarding-continue" disabled={disabled || scheduleBusy || !current.available}>{disabled ? 'Saving…' : chapter === 3 ? 'Finish setup' : 'Save & continue'}<Icon name="ArrowRight"/></button>
    {chapter === 2 && <p className="muted onboarding-save-note">Dating participation and each group or event queue have their own opt-in.</p>}
  </form>
}

function HomeAndBirthday({ profile, update }: { profile: MatchingProfile; update: (value: Partial<MatchingProfile>) => void }) {
  return <div className="formgrid"><label>Birthdate · private<input type="date" required max={new Date().toISOString().slice(0, 10)} value={profile.birthdate ?? ''} onChange={event => update({ birthdate: event.target.value || null })}/></label><label>City or campus area<input autoComplete="address-level2" required maxLength={120} value={profile.location_city ?? ''} placeholder="e.g. Stony Brook" onChange={event => update({ location_city: event.target.value || null })}/></label></div>
}
