import { useState } from 'react'
import { Link } from 'react-router'
import type { Account } from '../../shared/account'
import { orderInterests, type DetailAudience, type ProfileCustomizationValue } from '../../shared/profile-customization'
import type { ProfileDetails } from '../../shared/profile-details'
import { useProfileCustomization } from '../features/account/profile-customization-client'
import { ArtPreview } from '../features/garden/ArtPreview'
import { gardenItemName, showcaseChoices } from '../features/garden/showcase'
import { useGarden } from '../features/garden/state'
import { Icon } from './common'
import { haptic } from './feedback'
import { DiscoverPhotos } from './PhotoGallery'
import './profile-customization.css'

// Reorder saved and newly chosen interests. The first one is the top interest.
export function InterestOrderEditor({ interests, order, change, disabled }: {
  interests: string[]; order: string[]; change: (order: string[]) => void; disabled?: boolean
}) {
  const ordered = orderInterests(interests, order)
  if (ordered.length < 2) return null
  function move(index: number, to: number) {
    // A new top interest gets a firmer tap than an ordinary move.
    haptic(to === 0 ? 'medium' : 'light')
    const next = [...ordered]
    const [item] = next.splice(index, 1)
    next.splice(to, 0, item)
    change(next)
  }
  return <section className="interest-order" aria-labelledby="interest-order-title">
    <h3 id="interest-order-title" className="account-section-label">Order on your profile</h3>
    <p className="account-note">Your top interest shows first on your card. This only changes how your profile looks, not who you match with.</p>
    <ol>
      {ordered.map((label, index) => <li key={label} className={index === 0 ? 'is-top' : ''}>
        <span className="interest-order-label">{index === 0 && <span className="interest-top-badge"><Icon name="Star"/>Top</span>}{label}</span>
        <span className="interest-order-actions">
          {index > 0 && <button type="button" className="round" disabled={disabled} aria-label={`Make ${label} your top interest`} title="Make top" onClick={() => move(index, 0)}><Icon name="Star"/></button>}
          <button type="button" className="round" disabled={disabled || index === 0} aria-label={`Move ${label} up`} onClick={() => move(index, index - 1)}><Icon name="ChevronUp"/></button>
          <button type="button" className="round" disabled={disabled || index === ordered.length - 1} aria-label={`Move ${label} down`} onClick={() => move(index, index + 1)}><Icon name="ChevronDown"/></button>
        </span>
      </li>)}
    </ol>
  </section>
}

const audienceLabels: Record<DetailAudience, string> = { both: 'Friends and Dating', friends: 'Friends only', dating: 'Dating only' }
export function AudienceSelect({ field, value, change, disabled }: {
  field: string; value: DetailAudience; change: (value: DetailAudience) => void; disabled?: boolean
}) {
  return <label className="audience-select">
    <span>Show {field} to</span>
    <select value={value} disabled={disabled} onChange={event => { haptic('light'); change(event.target.value as DetailAudience) }}>
      {(Object.keys(audienceLabels) as DetailAudience[]).map(option => <option key={option} value={option}>{audienceLabels[option]}</option>)}
    </select>
  </label>
}

// Pick one Garden item to appear on your card, or none.
export function GardenShowcasePicker({ value, change, disabled }: { value: string | null; change: (value: string | null) => void; disabled?: boolean }) {
  const garden = useGarden()
  const choices = showcaseChoices(garden.state.community.owned)
  return <fieldset className="garden-showcase-picker" disabled={disabled}>
    <legend>From your Garden</legend>
    <p className="account-note">Show one item from your Garden on your card. Buy more in the Garden.</p>
    <div className="garden-showcase-options">
      <label className={value === null ? 'is-selected' : ''}>
        <input type="radio" name="garden-showcase" checked={value === null} onChange={() => { haptic('light'); change(null) }}/>
        <span className="garden-showcase-art garden-showcase-none" aria-hidden="true">—</span>
        <span>None</span>
      </label>
      {choices.map(id => <label key={id} className={value === id ? 'is-selected' : ''}>
        <input type="radio" name="garden-showcase" checked={value === id} onChange={() => { haptic('light'); change(id) }}/>
        <span className="garden-showcase-art"><ArtPreview id={id} size={48}/></span>
        <span>{gardenItemName(id)}</span>
      </label>)}
    </div>
    {value !== null && !choices.includes(value) && <p className="account-note">That item is no longer in your Garden, so it isn’t shown.</p>}
  </fieldset>
}

type FinishStep = { done: boolean; label: string; to: string }
// What's still missing, each with a direct way to fill it in.
export function ProfileFinishCard({ profile, hasPhoto, onAddPhoto }: { profile: Account['profile'] | undefined; hasPhoto: boolean; onAddPhoto: () => void }) {
  const steps: FinishStep[] = [
    { done: hasPhoto, label: 'Add a profile photo', to: '#profile-photos' },
    { done: !!profile?.bio?.trim(), label: 'Write a short bio', to: '/profile?section=basics' },
    { done: !!profile?.location_city?.trim(), label: 'Add your hometown', to: '/profile?section=basics' },
    { done: !!profile?.interests.length, label: 'Choose your interests', to: '/profile?section=interests' },
    { done: !!profile?.availability.length, label: 'Add when you’re free', to: '/profile?section=interests' },
  ]
  const missing = steps.filter(step => !step.done)
  if (!missing.length) return null
  return <section className="profile-finish" aria-labelledby="profile-finish-title">
    <div className="profile-finish-head">
      <h3 id="profile-finish-title">Finish your profile</h3>
      <span>{steps.length - missing.length} of {steps.length} done</span>
    </div>
    <ul>
      {missing.map(step => <li key={step.label}>
        {step.to.startsWith('#')
          ? <button type="button" onClick={onAddPhoto}><span className="profile-finish-dot" aria-hidden="true"/>{step.label}<Icon name="ChevronRight"/></button>
          : <Link to={step.to}><span className="profile-finish-dot" aria-hidden="true"/>{step.label}<Icon name="ChevronRight"/></Link>}
      </li>)}
    </ul>
  </section>
}

// How the saved profile looks to others, per mode, without leaving the page.
export function OwnProfilePreview({ ownerId, account, details, photoRevision, adult }: {
  ownerId: string; account: Account; details: ProfileDetails | null; photoRevision: number | undefined; adult: boolean
}) {
  const custom = useProfileCustomization()
  const [mode, setMode] = useState<'friends' | 'dating'>('friends')
  const profile = account.profile!
  const value: ProfileCustomizationValue = custom.value
  const interests = orderInterests(profile.interests, value.interestOrder)
  const facts = details?.facts
  const shown = (['education', 'occupation', 'languages'] as const).filter(key =>
    facts && facts.visibility[key] && facts[key].length > 0 && (value.audiences[key] === 'both' || value.audiences[key] === mode))
  return <section className="own-preview" aria-label="How others see your profile">
    {adult && <div className="own-preview-modes" role="group" aria-label="Preview as">
      {(['friends', 'dating'] as const).map(option => <button key={option} type="button" aria-pressed={mode === option} onClick={() => { if (mode !== option) haptic('light'); setMode(option) }}>{option === 'friends' ? 'In Friends' : 'In Dating'}</button>)}
    </div>}
    <article className="own-preview-card">
      <div className="photo discovery-photo own-preview-photo">
        <DiscoverPhotos id={ownerId} name={profile.display_name} revision={photoRevision} fallback={null} active/>
        <div className="phototext"><h2>{profile.display_name}</h2>{profile.location_city && <p>{profile.location_city}</p>}</div>
        {value.gardenItem && <span className="card-garden-item" title={gardenItemName(value.gardenItem)}><ArtPreview id={value.gardenItem} size={40}/></span>}
      </div>
      <div className="own-preview-body">
        {profile.bio && <section><h3>About {profile.display_name}</h3><p>{profile.bio}</p></section>}
        {!!interests.length && <section><h3>Interests</h3><div className="dating-interest-list">{interests.map((interest, index) =>
          <span key={interest} className={`dating-interest ${index === 0 && value.interestOrder[0] === interest ? 'is-top' : ''}`}>{index === 0 && value.interestOrder[0] === interest && <Icon name="Star"/>}{interest}</span>)}</div></section>}
        {!!shown.length && <dl className="own-profile-facts">{shown.map(key => <div key={key}><dt>{key[0].toUpperCase() + key.slice(1)}</dt><dd>{Array.isArray(facts![key]) ? (facts![key] as string[]).join(', ') : facts![key]}</dd></div>)}</dl>}
        <p className="account-note">Your birthday and full schedule stay private.</p>
      </div>
    </article>
  </section>
}
