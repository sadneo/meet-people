import { useId, useState } from 'react'
import { AccountProfileSchema, type AccountProfile } from '../../../shared/account-profile'

// Shared by ordinary Profile editing and mandatory first-account completion.
// No defaults from prototype state or Auth metadata; no navigation or auto-save.
export function ProfileIdentityForm({ account, enabled, busy, save, onSaved, submitLabel }: {
  account: AccountProfile | null; enabled: boolean; busy: boolean;
  save: (profile: AccountProfile) => Promise<boolean>; onSaved: (created: boolean) => void; submitLabel?: string;
}) {
  const id = useId()
  const [name, setName] = useState(account?.display_name ?? '')
  const [bio, setBio] = useState(account?.bio ?? '')
  const [username, setUsername] = useState('')
  const [validation, setValidation] = useState('')
  const creating = !account
  return <form aria-label="Profile identity" onSubmit={async event => {
    event.preventDefault()
    if (!enabled || busy) return
    const parsed = AccountProfileSchema.safeParse({ ...(account ?? { username, avatar_url: null }), display_name: name, bio: bio || null })
    if (!parsed.success) { setValidation('Use a username of 1–80 characters, display name of 1–120 characters and bio up to 1000 characters.'); return }
    setValidation('')
    if (await save(parsed.data)) onSaved(creating)
  }}>
    <h3>Display name &amp; bio</h3><p>Edited only on Profile. Shared preferences are saved separately.</p>
    {creating && <div><label htmlFor={`${id}-username`}>Username</label><input id={`${id}-username`} required maxLength={80} autoComplete="off" disabled={!enabled || busy} value={username} onChange={event => setUsername(event.target.value)} /></div>}
    <div><label htmlFor={`${id}-name`}>Display name</label><input id={`${id}-name`} required maxLength={120} disabled={!enabled || busy} value={name} onChange={event => setName(event.target.value)} /></div>
    <div><label htmlFor={`${id}-bio`}>Bio</label><textarea id={`${id}-bio`} maxLength={1000} disabled={!enabled || busy} value={bio} onChange={event => setBio(event.target.value)} /></div>
    {validation && <p role="alert">{validation}</p>}
    <button type="submit" className="pt-button pt-secondary" disabled={!enabled || busy || !name.trim() || (creating && !username.trim())}>{busy ? 'Saving identity…' : submitLabel ?? (creating ? 'Create identity' : 'Save identity')}</button>
  </form>
}
