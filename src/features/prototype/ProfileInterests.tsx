import { useId, useState } from 'react'
import { globalInterestChoices as interests, interestLimit, interestLabelLimit } from '../account/global-interests'
import { Button, Icon } from './ui'

export const PROFILE_INTEREST_LIMIT = interestLimit
const LABEL_LIMIT = interestLabelLimit

export function ProfileInterests({ values, onChange, disabled = false }: { values: string[]; onChange: (values: string[]) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState('')
  const id = useId()
  const label = draft.trim()
  const selected = (option: string) => values.includes(option)
  const atCap = values.length >= PROFILE_INTEREST_LIMIT
  const error = draft && !label ? 'Enter an interest, not just spaces.'
    : label.length > LABEL_LIMIT ? `Use ${LABEL_LIMIT} characters or fewer.`
    : label && selected(label) ? 'That interest is already selected.' : ''
  const options = [...interests, ...values.filter(value => !interests.includes(value))]
  const add = () => {
    if (disabled || !label || error || atCap) return
    onChange([...values, label])
    setDraft('')
  }
  return <section className="pt-profile-interests" role="group" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`}>Interests</h3>
    <p id={`${id}-count`} role="status">{values.length}/{PROFILE_INTEREST_LIMIT} selected</p>
    <p className="pt-hint" id={`${id}-limit`}>{values.length > PROFILE_INTEREST_LIMIT
      ? `Your existing interests are kept. Remove ${values.length - PROFILE_INTEREST_LIMIT} interests before saving (maximum 30).`
      : atCap ? '30 selected. Remove one to add another.' : 'Choose interests or add your own.'}</p>
    <div className="pt-chips" role="group" aria-label="Edit interests" aria-describedby={`${id}-count ${id}-limit`}>
      {options.map((option, index) => <button key={`${option}-${index}`} type="button" aria-pressed={selected(option)} disabled={disabled || (atCap && !selected(option))} onClick={() => onChange(selected(option) ? values.filter(value => value !== option) : [...values, option])}>
        {option}{selected(option) && <Icon name="close" size={16} />}
      </button>)}
    </div>
    <label htmlFor={`${id}-custom`}>Add a matching interest</label>
    <p className="pt-hint" id={`${id}-help`}>120 characters per label. Custom and multiline labels are kept.</p>
    <div className="pt-profile-interest-entry">
      <input id={`${id}-custom`} value={draft} maxLength={120} disabled={disabled} aria-describedby={`${id}-help ${id}-error ${id}-limit`} aria-invalid={!!error} autoComplete="off" onChange={event => setDraft(event.target.value)} onKeyDown={event => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); add() }
      }} />
      <Button secondary disabled={disabled || !label || !!error || atCap} onClick={add}>Add interest</Button>
    </div>
    <p id={`${id}-error`} className="pt-hint" aria-live="polite">{error}</p>
  </section>
}
