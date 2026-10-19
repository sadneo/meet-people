import { useEffect, useRef, useState } from 'react'
import { AccountDialog } from './AccountDialog'
import { ProfilePhotoEditor } from './ProfilePhotoEditor'
import { validateFacts } from './profile-rules'
import { useAccount } from '../../auth/account-context'
import { profileLanguageKey, type ProfileDetails as Details } from '../../../shared/profile-details'
import { useProfileDetails } from './useProfileDetails'

type Props = { name: string; bio: string | null; city: string | null; age: number | null; picture: string | null }
export function ProfileDetails(props: Props) {
  const account = useAccount()
  const owner = account?.loaded ? account.session?.user.id ?? null : null
  return <ProfileDetailsResource key={owner ?? 'signed-out'} {...props} owner={owner} token={owner ? account?.session?.access_token ?? null : null} />
}
function ProfileDetailsResource({ name, bio, city, age, picture, owner, token }: Props & { owner: string | null; token: string | null }) {
  const resource = useProfileDetails(owner, token)
  const facts = resource.details?.facts
  const [editor, setEditor] = useState<'facts' | 'picture' | 'viewer' | null>(null)
  const [notice, setNotice] = useState('')
  return <section className="account-panel account-more-facts" aria-label="Profile details and visibility">
    <header className="account-panel-head"><h2>More about you.</h2><button type="button" className="account-text-action" disabled={!facts || resource.busy} onClick={() => { setNotice(''); setEditor('facts') }}>Edit details</button></header>
    <p className="account-hint">Optional details for Friends and Dating.</p>
    {facts && <dl className="account-extra-facts">{(['education', 'occupation', 'languages'] as const).map(field => <div key={field}><dt>{field[0].toUpperCase() + field.slice(1)}</dt><dd>{field === 'languages' ? facts.languages.join(', ') || 'Not added yet' : facts[field] || 'Not added yet'}</dd><small>Visibility preference: {facts.visibility[field] ? 'shown' : 'hidden'}</small></div>)}</dl>}
    {editor !== 'facts' && <><FactsFeedback resource={resource} />{notice && <p role="status">{notice}</p>}<button type="button" className="account-secondary" disabled={!token || resource.loading || resource.busy} onClick={() => { setNotice(''); void resource.reload() }}>Reload saved details</button></>}
    <div className="account-feature-actions"><button type="button" className="account-secondary" onClick={() => setEditor('picture')}>Profile picture</button><button type="button" className="account-secondary" onClick={() => setEditor('viewer')}>Preview public profile</button></div>
    <p className="account-feature-note">Facts and photo changes require server confirmation. Your uploaded photo is shared with Dating. Saved visibility preferences do not verify public sharing.</p>
    {editor === 'facts' && resource.details && <FactsEditor resource={resource} initial={resource.details} close={() => setEditor(null)} saved={() => { setEditor(null); setNotice('Profile details saved and reloaded.') }} />}
    {editor === 'picture' && <ProfilePhotoEditor close={() => setEditor(null)} />}
    {editor === 'viewer' && <AccountDialog title="Public profile preview" close={() => setEditor(null)}><div className="account-viewer-preview">{picture ? <img src={picture} alt={`${name}'s profile picture preview`} /> : <span className="account-photo-empty">No picture added</span>}<h3>{name}{age !== null ? `, ${age}` : ''}</h3>{city && <p>{city}</p>}{bio && <p>{bio}</p>}<dl>{(['education', 'occupation', 'languages'] as const).map(field => {
      const visible = facts?.visibility[field]
      const value = field === 'languages' ? facts?.languages.join(', ') : facts?.[field]
      return visible && value ? <div key={field}><dt>{field[0].toUpperCase() + field.slice(1)}</dt><dd>{value}</dd></div> : null
    })}</dl><p className="account-feature-note">Birthdate is never shown. This preview does not change discovery or confirm what a live service shares.</p></div></AccountDialog>}
  </section>
}
function FactsFeedback({ resource }: { resource: ReturnType<typeof useProfileDetails> }) {
  return <>{resource.loading && <p role="status">Loading saved profile details…</p>}{resource.busy && <p role="status">Saving and confirming profile details…</p>}{resource.error && <p role="alert">{resource.error}</p>}{resource.details && !resource.canWrite && !resource.busy && <p className="account-feature-note">Last confirmed details only. Reload before saving.</p>}</>
}
function FactsEditor({ close, saved, initial, resource }: { close: () => void; saved: () => void; initial: Details; resource: ReturnType<typeof useProfileDetails> }) {
  const [draft, setDraft] = useState(() => structuredClone(initial.facts)), [revision, setRevision] = useState(initial.revision)
  const [language, setLanguage] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState(''), [reloading, setReloading] = useState(false)
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const addLanguage = () => {
    const next = [...draft.languages, language]
    const issue = validateFacts(draft.education, draft.occupation, next)
    if (issue) { setError(issue); return }
    setDraft({ ...draft, languages: next }); setLanguage(''); setError('')
  }
  return <AccountDialog title="Education, work & languages" close={close} busy={resource.busy}><form className="account-feature-form" onSubmit={event => {
    event.preventDefault()
    if (language !== '') { setError('Add the language first, or clear the language box.'); return }
    const issue = validateFacts(draft.education, draft.occupation, draft.languages)
    if (issue) { setError(issue); return }
    setError(''); setNotice('')
    void resource.save({ expectedRevision: revision, facts: draft }).then(confirmed => { if (confirmed && active.current) saved() })
  }}>
    <p>Save optional facts and visibility together. Education and occupation: up to 120 characters each. Languages: up to 12, with 60 characters each. Public sharing is not verified here.</p>
    <FactsFeedback resource={resource} />
    <fieldset className="account-facts-fields" aria-label="Optional profile facts" disabled={resource.busy || reloading}>
      {(['education', 'occupation'] as const).map(field => <div key={field}><label className="account-feature-field">{field === 'education' ? 'Education' : 'Occupation'}<input autoComplete={field === 'occupation' ? 'organization-title' : 'off'} value={draft[field]} onChange={event => setDraft({ ...draft, [field]: event.target.value })} /></label><label className="account-feature-check"><input type="checkbox" checked={draft.visibility[field]} onChange={event => setDraft({ ...draft, visibility: { ...draft.visibility, [field]: event.target.checked } })} />Show my {field} on my profile</label></div>)}
      <div><label className="account-feature-field">Languages<input value={language} onChange={event => { setLanguage(event.target.value); setError('') }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addLanguage() } }} placeholder="Add a language" /></label><button type="button" className="account-secondary" disabled={!profileLanguageKey(language) || draft.languages.length >= 12} onClick={addLanguage}>Add language</button><ul className="account-language-list">{draft.languages.map(value => <li key={value}>{value}<button type="button" aria-label={`Remove ${value}`} onClick={() => setDraft({ ...draft, languages: draft.languages.filter(item => item !== value) })}>×</button></li>)}</ul><label className="account-feature-check"><input type="checkbox" checked={draft.visibility.languages} onChange={event => setDraft({ ...draft, visibility: { ...draft.visibility, languages: event.target.checked } })} />Show my languages on my profile</label></div>
    </fieldset>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <p className="account-feature-note">Reload saved details replaces this draft with the authoritative values. It never retries a save.</p>
    <button type="button" className="account-secondary" disabled={resource.busy || resource.loading} onClick={() => {
      setReloading(true); setError(''); setNotice('')
      void resource.reload().then(details => {
        if (!active.current) return
        if (details) { setDraft(structuredClone(details.facts)); setRevision(details.revision); setLanguage(''); setNotice('Saved details reloaded. Review them before editing.') }
        setReloading(false)
      })
    }}>Reload saved details</button>
    <div className="account-feature-actions"><button type="button" className="account-secondary" disabled={resource.busy} onClick={close}>Cancel</button><button type="submit" className="account-green-action" disabled={!resource.canWrite || resource.busy || reloading}>Save details</button></div>
  </form></AccountDialog>
}
