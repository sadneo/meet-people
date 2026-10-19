import { useEffect, useId, useRef, useState } from 'react'
import { AccountProfileSchema } from '../../../shared/account-profile'
import { ReadyPreferencesSchema, readinessMessage } from '../../../shared/profile-readiness'
import { Icon } from '../prototype/ui'
import type { useSharedUserProfile } from './useSharedUserProfile'

export function ProfileEditDialog({ data, close }: { data: ReturnType<typeof useSharedUserProfile>; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), pending = useRef(false)
  const id = useId()
  const [name, setName] = useState(data.account?.display_name ?? '')
  const [bio, setBio] = useState(data.account?.bio ?? '')
  const [birthdate, setBirthdate] = useState(data.profile?.birthdate ?? '')
  const [city, setCity] = useState(data.profile?.location_city ?? '')
  const [saving, setSaving] = useState(false), [validation, setValidation] = useState('')
  const [identitySaved, setIdentitySaved] = useState(false)
  useEffect(() => {
    const element = dialog.current!, opener = document.activeElement
    element.showModal()
    return () => { element.close(); if (opener instanceof HTMLElement && opener.isConnected) opener.focus() }
  }, [])
  const blocked = saving || data.busy || !data.canWrite
  async function save() {
    if (blocked || pending.current || !data.account || !data.profile) return
    const identity = AccountProfileSchema.safeParse({ ...data.account, display_name: name.trim(), bio: bio || null })
    const profile = ReadyPreferencesSchema.safeParse({ ...data.profile, birthdate: birthdate || null, location_city: city.trim() || null })
    if (!identity.success || !profile.success) { setValidation(!identity.success ? 'Add a display name of up to 120 characters and a bio of up to 1000 characters.' : readinessMessage); return }
    pending.current = true; setSaving(true); setValidation('')
    try {
      // Existing endpoints save identity and usual profile facts separately.
      // Do not write either document unless its supported fields changed.
      const changedIdentity = identity.data.display_name !== data.account.display_name || identity.data.bio !== data.account.bio
      const changedFacts = profile.data.birthdate !== data.profile.birthdate || profile.data.location_city !== data.profile.location_city
      if (changedIdentity) {
        if (!await data.saveIdentity(identity.data)) return
        setIdentitySaved(true)
      }
      if (changedFacts && !await data.saveShared(profile.data)) return
      close()
    } finally { pending.current = false; setSaving(false) }
  }
  return <dialog ref={dialog} className="pt-dialog account-edit-dialog" aria-label="Edit your profile" onCancel={event => { event.preventDefault(); if (!pending.current) close() }}>
    <header className="account-edit-header"><h2>A little more you.</h2><button type="button" aria-label="Close dialog" disabled={saving || data.busy} onClick={close}><Icon name="close" size={18} /></button></header>
    <form aria-label="Edit profile details" onSubmit={event => { event.preventDefault(); void save() }}>
      <div className="account-edit-fields">
        <p className="account-edit-description">These details belong to your profile across all matching modes.</p>
        <label htmlFor={`${id}-name`}>Display name<input id={`${id}-name`} autoFocus required maxLength={120} disabled={blocked} value={name} onChange={event => setName(event.target.value)} /></label>
        <label htmlFor={`${id}-bio`}>Bio<textarea id={`${id}-bio`} aria-label="Bio" maxLength={1000} disabled={blocked} value={bio} onChange={event => setBio(event.target.value)} /></label>
        <div className="account-edit-fact-row"><label htmlFor={`${id}-birthdate`}>Birthdate · not public<input id={`${id}-birthdate`} aria-label="Birthdate" type="date" required disabled={blocked} value={birthdate} onChange={event => setBirthdate(event.target.value)} /></label><label htmlFor={`${id}-city`}>Home city / campus<input id={`${id}-city`} aria-label="City or campus area" required maxLength={120} disabled={blocked} value={city} onChange={event => setCity(event.target.value)} /></label></div>
        <p className="account-edit-note">Your birthdate stays private. Only your age appears on your profile.</p>
        {data.loading && <p role="status">Reloading shared profile… Your draft is kept.</p>}
        {saving && <p role="status">Saving profile…</p>}
        {validation && <p role="alert">{validation}</p>}
        {data.error && <div className="account-edit-error">{identitySaved && <p>Name and bio saved. The remaining details have not been confirmed.</p>}<p role="alert">{data.error}</p><button type="button" className="account-secondary" disabled={data.loading || saving || data.busy} onClick={data.reload}>Reload shared profile</button></div>}
      </div>
      <footer className="account-edit-actions"><button type="button" className="account-secondary" disabled={saving || data.busy} onClick={close}>Cancel</button><button type="submit" className="account-edit-save" disabled={blocked || !name.trim()}>{saving ? 'Saving profile…' : 'Save profile'}</button></footer>
    </form>
  </dialog>
}
