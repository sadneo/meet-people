import { useState } from 'react'
import { Link } from 'react-router'
import type { Account } from '../../shared/account'
import { orderInterests, type DetailAudience, type ProfileCustomizationValue } from '../../shared/profile-customization'
import { contactDetailsHint, profilePrompts, promptAnswerLimit, promptAudience, promptCount, promptLimit, promptShowsIn, promptText, promptsForMode, type ProfilePrompt, type PromptAudience } from '../../shared/profile-prompts'
import type { ProfileDetails } from '../../shared/profile-details'
import { useProfileCustomization } from '../features/account/profile-customization-client'
import { ArtPreview } from '../features/garden/ArtPreview'
import { gardenItemName, showcaseChoices } from '../features/garden/showcase'
import { useGarden } from '../features/garden/state'
import { Icon } from './common'
import { haptic } from './feedback'
import { DiscoverPhotos } from './PhotoGallery'
import { DiscoverModes } from './DiscoverModes'
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
    {adult && <DiscoverModes adult showFood={false} label="Preview as" mode={mode === 'friends' ? 'Friends' : 'Dating'}
      onModeChange={option => { const next = option === 'Friends' ? 'friends' : 'dating'; if (mode !== next) haptic('light'); setMode(next) }}/>}
    <article className="own-preview-card">
      <div className="photo discovery-photo own-preview-photo">
        <DiscoverPhotos id={ownerId} name={profile.display_name} revision={photoRevision} fallback={null} active/>
        <div className="phototext"><h2>{profile.display_name}</h2>{profile.location_city && <p>{profile.location_city}</p>}</div>
        {value.gardenItem && <span className="card-garden-item" title={gardenItemName(value.gardenItem)}><ArtPreview id={value.gardenItem} size={40}/></span>}
      </div>
      <div className="own-preview-body">
        {/* Dating shows the Dating bio when one is set. */}
        {(mode === 'dating' && value.datingBio ? value.datingBio : profile.bio) && <section><h3>About {profile.display_name}</h3><p>{mode === 'dating' && value.datingBio ? value.datingBio : profile.bio}</p></section>}
        <PromptCards prompts={promptsForMode(value.prompts ?? [], mode)}/>
        {!!interests.length && <section><h3>Interests</h3><div className="dating-interest-list">{interests.map((interest, index) =>
          <span key={interest} className={`dating-interest ${index === 0 && value.interestOrder[0] === interest ? 'is-top' : ''}`}>{index === 0 && value.interestOrder[0] === interest && <Icon name="Star"/>}{interest}</span>)}</div></section>}
        {!!shown.length && <dl className="own-profile-facts">{shown.map(key => <div key={key}><dt>{key[0].toUpperCase() + key.slice(1)}</dt><dd>{Array.isArray(facts![key]) ? (facts![key] as string[]).join(', ') : facts![key]}</dd></div>)}</dl>}
      </div>
    </article>
  </section>
}

// Up to three prompts per mode. Each prompt shows in Friends, Dating or both;
// Dating-only questions show only in Dating.
export function PromptsEditor({ prompts, change, adult, disabled }: {
  prompts: ProfilePrompt[]; change: (prompts: ProfilePrompt[]) => void; adult: boolean; disabled?: boolean
}) {
  const [adding, setAdding] = useState('')
  const counts = { friends: promptCount(prompts, 'friends'), dating: promptCount(prompts, 'dating') }
  const room = (mode: 'friends' | 'dating') => counts[mode] < promptLimit
  // A new prompt goes everywhere it fits; Dating-only questions go to Dating.
  const placement = (id: string): PromptAudience | null => {
    if (promptAudience(id) === 'dating') return adult && room('dating') ? 'dating' : null
    if (!adult) return room('friends') ? 'both' : null
    return room('friends') && room('dating') ? 'both' : room('friends') ? 'friends' : room('dating') ? 'dating' : null
  }
  const available = profilePrompts.filter(prompt => (adult || prompt.audience === 'both') && !prompts.some(item => item.id === prompt.id))
  function update(index: number, value: Partial<ProfilePrompt>) {
    change(prompts.map((item, i) => i === index ? { ...item, ...value } : item))
  }
  function move(index: number, to: number) {
    haptic('light')
    const next = [...prompts]
    const [item] = next.splice(index, 1)
    next.splice(to, 0, item)
    change(next)
  }
  function toggle(index: number, mode: 'friends' | 'dating') {
    const shows = promptShowsIn(prompts[index])
    const on = { friends: shows !== 'dating', dating: shows !== 'friends' }
    on[mode] = !on[mode]
    haptic('light')
    update(index, { audience: on.friends && on.dating ? 'both' : on.friends ? 'friends' : 'dating' })
  }
  const full = adult ? !room('friends') && !room('dating') : !room('friends')
  return <section className="prompts-editor" aria-labelledby="prompts-title">
    <div className="prompts-editor-head">
      <h3 id="prompts-title" className="account-section-label">Prompts</h3>
      {adult
        ? <span className="prompt-counts"><span>Friends {counts.friends}/{promptLimit}</span><span>Dating {counts.dating}/{promptLimit}</span></span>
        : <span className="prompt-counts">{counts.friends}/{promptLimit}</span>}
    </div>
    {prompts.map((item, index) => {
      const hint = contactDetailsHint(item.answer)
      const shows = promptShowsIn(item)
      const datingOnly = promptAudience(item.id) === 'dating'
      return <div className="prompt-edit-card" key={item.id}>
        <div className="prompt-edit-head">
          <b className="prompt-edit-question">{promptText(item.id)}</b>
          <span className="prompt-edit-move">
            <button type="button" className="round" disabled={disabled || index === 0} aria-label={`Move “${promptText(item.id)}” up`} onClick={() => move(index, index - 1)}><Icon name="ChevronUp"/></button>
            <button type="button" className="round" disabled={disabled || index === prompts.length - 1} aria-label={`Move “${promptText(item.id)}” down`} onClick={() => move(index, index + 1)}><Icon name="ChevronDown"/></button>
            <button type="button" className="round prompt-remove" disabled={disabled} aria-label={`Remove “${promptText(item.id)}”`} onClick={() => { haptic('light'); change(prompts.filter((_, i) => i !== index)) }}><Icon name="Skip"/></button>
          </span>
        </div>
        <label className="sr-only" htmlFor={`prompt-${item.id}`}>Your answer to {promptText(item.id)}</label>
        <textarea id={`prompt-${item.id}`} rows={2} maxLength={promptAnswerLimit} disabled={disabled} placeholder="Your answer"
          value={item.answer} onChange={event => update(index, { answer: event.target.value })}/>
        <div className="prompt-edit-meta"><span className="prompt-hint">{hint}</span><span>{item.answer.length}/{promptAnswerLimit}</span></div>
        {adult && <div className="prompt-edit-actions">
          <div className="prompt-modes" role="group" aria-label={`Show “${promptText(item.id)}” in`}>
            {(['friends', 'dating'] as const).map(mode => {
              const pressed = shows === 'both' || shows === mode
              const locked = mode === 'friends' && datingOnly
              const last = pressed && shows !== 'both'
              const blocked = !pressed && !room(mode)
              return <button key={mode} type="button" data-mode={mode === 'friends' ? 'Friends' : 'Dating'} aria-pressed={pressed}
                disabled={disabled || locked || last || blocked}
                title={locked ? 'This question is only for Dating' : blocked ? `${mode === 'friends' ? 'Friends' : 'Dating'} already has ${promptLimit} prompts` : undefined}
                onClick={() => toggle(index, mode)}>
                <Icon name={mode === 'friends' ? 'Friends' : 'Dating'}/>{mode === 'friends' ? 'Friends' : 'Dating'}
              </button>
            })}
          </div>
        </div>}
      </div>
    })}
    {full
      ? <p className="account-note">{adult ? `Friends and Dating each have ${promptLimit} prompts.` : `You have ${promptLimit} prompts.`} Remove one to add another.</p>
      : <div className="prompt-add">
        <label htmlFor="prompt-add-select" className="sr-only">Choose a prompt</label>
        <select id="prompt-add-select" value={adding} disabled={disabled} onChange={event => setAdding(event.target.value)}>
          <option value="">{prompts.length ? 'Add another prompt' : 'Choose a prompt'}</option>
          {available.map(prompt => <option key={prompt.id} value={prompt.id} disabled={!placement(prompt.id)}>{prompt.text}{prompt.audience === 'dating' ? ' (Dating)' : ''}</option>)}
        </select>
        <button type="button" className="btn light" disabled={disabled || !adding || !placement(adding)} onClick={() => {
          const audience = placement(adding)
          if (!audience) return
          haptic('light')
          change([...prompts, { id: adding as ProfilePrompt['id'], answer: '', ...(audience === 'both' ? {} : { audience }) }])
          setAdding('')
        }}>Add prompt</button>
      </div>}
  </section>
}

// Prompt answers as they appear on a card.
export function PromptCards({ prompts }: { prompts: readonly ProfilePrompt[] }) {
  if (!prompts.length) return null
  return <section className="prompt-cards" aria-label="Prompts">
    {prompts.map(item => <figure className="prompt-card" key={item.id}>
      <figcaption>{promptText(item.id)}</figcaption>
      <blockquote>{item.answer}</blockquote>
    </figure>)}
  </section>
}
