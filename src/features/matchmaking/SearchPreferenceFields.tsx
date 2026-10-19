import { Link } from 'react-router'
import { friendshipGoals, type SearchOptions } from './search-preferences'
import { useState, type ReactNode } from 'react'
import { FriendsLabelSchema } from '../../../shared/friends-search-preferences'

export function SearchPreferenceFields({ mode, value, change, home, disabled, canonical = false, existingGoals = [], locationControls }: { mode: 'Friends' | 'Dating'; value: SearchOptions; change: (value: SearchOptions) => void; home: string | null; disabled: boolean; canonical?: boolean; existingGoals?: string[]; locationControls?: ReactNode }) {
  const [customGoal, setCustomGoal] = useState(''), [goalError, setGoalError] = useState('')
  const addGoal = () => {
    if (disabled) return
    const parsed = FriendsLabelSchema.safeParse(customGoal)
    if (!parsed.success || value.goals.length >= 20) { setGoalError('Choose up to 20 nonblank goals of at most 120 valid characters.'); return }
    if (value.goals.includes(parsed.data)) { setGoalError('That exact goal is already selected.'); return }
    change({ ...value, goals: [...value.goals, parsed.data] }); setCustomGoal(''); setGoalError('')
  }
  return <fieldset className="mfs-search-options" disabled={disabled}><legend>Where to look</legend><p>{canonical ? 'Your home stays the same. Choose a search area below to use distance; typing a name alone does not locate it.' : 'Your home stays the same. Area text is a preview, not a measured location.'}</p><label className="mfs-location-choice"><input type="radio" name={`location-${mode}`} checked={value.source === 'home'} onChange={() => change({ ...value, source: 'home', area: '' })} />Home area{home ? ` · ${home}` : ' · not added yet'}</label><label className="mfs-location-choice"><input type="radio" name={`location-${mode}`} checked={value.source === 'temporary'} onChange={() => change({ ...value, source: 'temporary' })} />Temporary search area</label>{value.source === 'temporary' && <label className="mfs-area-field">City or campus for this search<input aria-label="Temporary city or campus" maxLength={120} value={value.area} onChange={event => change({ ...value, area: event.target.value })} /></label>}<Link to="/profile">Edit your home area on Profile</Link>
    {locationControls}
    {mode === 'Friends' && <div className="mfs-friendship-goals"><h3>Friendship goals</h3><p>What would you like to find? Choose more than one.</p><div role="group" aria-label="Friendship goals">{[...new Set([...friendshipGoals, ...existingGoals, ...value.goals])].map(goal => <button key={goal} type="button" aria-pressed={value.goals.includes(goal)} disabled={!value.goals.includes(goal) && value.goals.length >= 20} onClick={() => change({ ...value, goals: value.goals.includes(goal) ? value.goals.filter(item => item !== goal) : [...value.goals, goal] })}>{goal}</button>)}</div>
      {canonical && <div className="mfs-area-field"><label>Custom friendship goal<input aria-label="Custom friendship goal" maxLength={240} value={customGoal} onChange={event => { setCustomGoal(event.target.value); setGoalError('') }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addGoal() } }} /></label><button type="button" className="mfs-reset" disabled={value.goals.length >= 20} onClick={addGoal}>Add goal</button><small>Exact labels are preserved. Add the goal before saving the filter draft.</small>{goalError && <p role="alert">{goalError}</p>}</div>}
    </div>}
  </fieldset>
}
