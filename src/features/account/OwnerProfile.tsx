import { globalInterestChoices, interestAdditionProblem } from './global-interests'
import { ProfileDetails } from './ProfileDetails'
import { useAccountUiPreview } from './account-ui-preview-context'
import { calculatedAge } from './profile-rules'
import { useId, useState } from 'react'
import { Link } from 'react-router'
import type { MatchingProfile } from '../../../shared/matchmaking'
import { ReadyPreferencesSchema, readinessMessage } from '../../../shared/profile-readiness'
import { FriendsAvailability } from '../matchmaking/FriendsPresentation'
import { Button, Icon } from '../prototype/ui'
import type { useSharedUserProfile } from './useSharedUserProfile'
import { ProfileExactAvailability } from './ProfileExactAvailability'
import './profile-handoff.css'

const interestOptions = globalInterestChoices
const art = '/prototype/account/pebble-companion.png'

export function ProfilePebble({ className = '' }: { className?: string }) {
  return <img className={`account-pixel ${className}`} src={art} alt="" aria-hidden="true" />
}

function UsualPreferences({ data }: { data: ReturnType<typeof useSharedUserProfile> }) {
  const [interests, setInterests] = useState<string[] | null>(null)
  const [availability, setAvailability] = useState<MatchingProfile['availability'] | null>(null)
  const [adding, setAdding] = useState(false), [tag, setTag] = useState(''), [problem, setProblem] = useState('')
  const id = useId()
  const profile = data.profile
  if (!profile) return null
  const selected = interests ?? profile.interests
  const choices = [...new Set([...interestOptions, ...selected])]
  const disabled = !data.canWrite
  async function save(kind: 'interests' | 'availability') {
    if (!profile || disabled) return
    const draft = { ...profile, ...(kind === 'interests' ? { interests: selected } : { availability: availability ?? profile.availability }) }
    if (!ReadyPreferencesSchema.safeParse(draft).success) { setProblem(readinessMessage); return }
    setProblem('')
    if (await data.saveShared(draft)) {
      if (kind === 'interests') { setInterests(null); setAdding(false); setTag('') }
      else setAvailability(null)
    }
  }
  function add() {
    const value = tag.trim()
    const issue = interestAdditionProblem(value, selected)
    if (issue) { setProblem(issue); return }
    setInterests([...selected, value]); setTag(''); setProblem('')
  }
  return <>
    <section className="account-panel account-usual-interests" aria-labelledby={`${id}-interests`}>
      <header className="account-panel-head"><h2 id={`${id}-interests`}>Your kind of things.</h2><span className="account-scope">Shared</span></header>
      <p className="account-hint">Shared with matchmaking. Changes here update your interests there too.</p>
      <div className="account-chips" role="group" aria-label="Usual interests">{choices.map(option => {
        const on = selected.includes(option)
        return <button type="button" key={option} aria-label={option} disabled={disabled || (!on && selected.length >= 30)} aria-pressed={on} onClick={() => { setInterests(on ? selected.filter(item => item !== option) : [...selected, option]); setProblem('') }}>{option}{on && <span aria-hidden="true">✓</span>}</button>
      })}</div>
      <button className="account-secondary account-add" type="button" disabled={disabled} onClick={() => setAdding(true)}>+ Add an interest</button>
      {adding && <form className="account-custom-interest" onSubmit={event => { event.preventDefault(); add() }}><label htmlFor={`${id}-custom`}>Your own interest</label><div><input autoFocus id={`${id}-custom`} value={tag} maxLength={120} disabled={disabled} onChange={event => setTag(event.target.value)} /><button className="account-secondary" disabled={disabled} type="submit">Add interest</button></div></form>}
      {interests !== null && <div className="account-save-row"><span>Unsaved changes</span><button className="account-secondary" type="button" disabled={data.busy} onClick={() => { setInterests(null); setAdding(false); setProblem('') }}>Cancel interests</button><button className="account-primary" type="button" disabled={disabled} onClick={() => void save('interests')}>Save usual interests</button></div>}
    </section>
    <section className="account-panel account-usual-week" aria-label="Your usual week">
      <header className="account-panel-head"><h2>Make a little time.</h2><div className="account-week-tools"><span className="account-scope">Your usual week</span><button className="account-text-action" type="button" aria-label="Clear usual availability" disabled={disabled || !(availability ?? profile.availability).length} onClick={() => { setAvailability([]); setProblem('') }}>Clear</button></div></header>
      <p className="account-hint">Your shared week for Profile and Friends. Changes here update matchmaking too.</p>
      <FriendsAvailability values={availability ?? profile.availability} onChange={value => { setAvailability(value); setProblem('') }} disabled={disabled} />
      {availability !== null && <div className="account-save-row"><span>Unsaved changes</span><button className="account-secondary" type="button" disabled={data.busy} onClick={() => { setAvailability(null); setProblem('') }}>Cancel availability</button><button className="account-primary" type="button" disabled={disabled} onClick={() => void save('availability')}>Save usual availability</button></div>}
      <ProfileExactAvailability values={availability ?? profile.availability} disabled={disabled} onChange={value => { setAvailability(value); setProblem('') }} />
      <p className="account-caption">{(availability ?? profile.availability).length} {availability === null ? 'saved' : 'draft'} time {(availability ?? profile.availability).length === 1 ? 'window' : 'windows'} · New York time · Striped = partial. Expand exact time windows to edit custom times.</p>
    </section>
    {problem && <p className="account-inline-error" role="alert">{problem}</p>}
  </>
}

type Plan = { title: string; when: string; open: () => void } | null
export function OwnerProfile({ data, ready, signedIn, edit, plan, inactive = false }: { inactive?: boolean; data: ReturnType<typeof useSharedUserProfile>; ready: boolean; signedIn: boolean; edit: () => void; plan: Plan }) {
  const identity = data.account ?? data.profile
  const age = calculatedAge(data.profile?.birthdate)
  const preview = useAccountUiPreview()
  const picture = preview.picture === undefined ? identity?.avatar_url ?? null : preview.picture
  const completion = [
    { label: 'Basic profile', done: !!identity?.display_name.trim() },
    { label: 'Interests', done: (data.profile?.interests.length ?? 0) >= 3 },
    { label: 'Your story', done: !!identity?.bio?.trim() },
    { label: 'Availability', done: !!data.profile?.availability.length },
  ]
  return <div className="account-profile-page" aria-hidden={inactive || undefined}>
    <section className="account-identity" aria-label="Your profile">
      <img className="account-cover" src="/prototype/account/profile-cafe.jpg" alt="A warm, welcoming café" />
      <div className="account-identity-body">
        {picture ? <img className="account-portrait" src={picture} alt={identity?.display_name ?? 'Your picture'} referrerPolicy="no-referrer" /> : <span className="account-portrait account-avatar-placeholder" role="img" aria-label="Profile picture not set"><Icon name="profile" size={36} /></span>}
        <Button secondary className="account-edit" disabled={!ready || !signedIn || data.loading} onClick={edit}>Edit profile<Icon name="edit" size={13} /></Button>
        <h1 tabIndex={-1} aria-label={identity?.display_name ?? 'Your profile'}>{identity?.display_name ?? 'Your profile'}{age !== null && <span className="account-age" aria-label={`Age ${age}`}>{age}</span>}</h1>
        <p className="account-city"><Icon name="pin" size={12} />{data.profile?.location_city || 'Campus area not provided.'}</p>
        {identity?.bio && <p className="account-bio">{identity.bio}</p>}
      </div>
    </section>
    {!ready || data.loading ? <p role="status">Loading shared profile…</p> : !signedIn ? <p role="status">Sign in to read and edit your shared profile. <Link to="/login?returnTo=%2Fprofile">Sign in</Link></p> : data.error ? <div className="account-feedback"><p role="alert">{data.error}</p><Button secondary disabled={data.loading || data.busy} onClick={data.reload}>Reload shared profile</Button></div> : !data.account ? <p>No account identity saved yet. Use Edit profile to create your identity and preferences.</p> : !data.profile && <p>No shared preferences saved yet. Use Edit profile to add interests, free time and area.</p>}
    <div className="account-profile-grid">
      <section className="account-panel account-facts" aria-labelledby="account-about-title">
        <header className="account-panel-head"><h2 id="account-about-title">A little about you.</h2><button type="button" className="account-text-action" disabled={!data.canWrite} onClick={edit}>Edit</button></header>
        <p className="account-hint">The things that stay true across Friends and Dating.</p>
        <dl><div><dt>Home base</dt><dd>{data.profile?.location_city || 'Not added yet'}</dd></div><div><dt>Age</dt><dd>{age ?? 'Not added yet'}</dd></div><div><dt>Usual week</dt><dd>{data.profile ? `${data.profile.availability.length} saved ${data.profile.availability.length === 1 ? 'window' : 'windows'}` : 'Not added yet'}</dd></div><div><dt>Profile</dt><dd>{identity?.username ? `@${identity.username}` : 'Not added yet'}</dd></div></dl>
      </section>
      <UsualPreferences data={data} />
      {data.account && data.profile && <ProfileDetails name={data.account.display_name} bio={data.account.bio} city={data.profile.location_city} age={age} picture={picture} />}
      <section className="account-panel account-plans" aria-labelledby="account-plans-title">
        <header className="account-panel-head"><h2 id="account-plans-title">Something to look forward to.</h2></header>
        {plan ? <button type="button" className="account-plan" onClick={plan.open}><Icon name="events" /><span><strong>{plan.title}</strong><small>{plan.when} · local plan</small></span><Icon name="chevron" /></button> : <div className="account-plan-empty"><ProfilePebble /><div><h3>Room for a good plan.</h3><p>Your next shared coffee, walk, or little adventure starts with a hello.</p></div><Link className="account-secondary" to="/matchmaking">Find your people<Icon name="arrow" size={14} /></Link></div>}
      </section>
    </div>
    <section className="account-panel account-community" aria-labelledby="account-community-title">
      <header className="account-panel-head"><div className="account-community-title"><ProfilePebble /><div><h2 id="account-community-title">Your little community</h2><p>A small beginning, with room to grow.</p></div></div><span className="account-community-count">{completion.filter(item => item.done).length}/4 chapters</span></header>
      <div className="account-community-steps">{completion.map(item => <div key={item.label} className={item.done ? 'is-complete' : ''}><span aria-hidden="true">{item.done ? '✓' : '○'}</span><strong>{item.label}</strong><small>{item.done ? 'Added' : 'Add yours'}</small></div>)}</div>
      <p className="account-community-copy"><strong>Good things take time.</strong>Every conversation and shared plan helps your little community grow.</p>
    </section>
    <section className="account-spotlight" aria-labelledby="account-hello-title">
      <div className="account-reward-art" aria-hidden="true"><span /><ProfilePebble className="account-reward-main" /><ProfilePebble className="account-reward-friend" /><i>✦</i><i>✧</i></div>
      <div><span className="account-eyebrow">Little connections. New beginnings.</span><h2 id="account-hello-title">A little hello goes a long way.</h2><p>Find your people and make time for a little adventure.</p><Link className="account-green-action" to="/matchmaking">Find your people<Icon name="arrow" size={14} /></Link></div>
    </section>
    <Link className="account-settings-row" to="/settings"><span className="account-settings-icon"><Icon name="settings" size={19} /></span><span><strong>Settings &amp; privacy</strong><small>Make Pebble feel right for you.</small></span><Icon name="chevron" size={16} /></Link>
  </div>
}
