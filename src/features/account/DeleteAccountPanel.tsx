import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { supabase } from '../../supabase'
import { ActionButton } from '../../ui/common'
import { deleteMyAccount } from './account-deletion-client'
import './delete-account.css'

export const DELETE_CONFIRM_WORD = 'DELETE'

// Content for a modal: explains what deletion does and requires the user to type DELETE.
export function DeleteAccountPanel({ close }: { close: () => void }) {
  const navigate = useNavigate()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const live = useRef(true)
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])
  const ready = typed.trim() === DELETE_CONFIRM_WORD && !busy

  async function submit() {
    if (!ready) return
    setBusy(true); setError('')
    try {
      await deleteMyAccount()
      // The account is gone; drop the stale local session, then leave the signed-in app.
      await supabase?.auth.signOut({ scope: 'local' }).catch(() => undefined)
      navigate('/welcome', { replace: true })
    } catch (caught) {
      if (live.current) setError(caught instanceof Error ? caught.message : 'Your account could not be deleted. Try again.')
    } finally {
      if (live.current) setBusy(false)
    }
  }

  return <div className="pt-delete-account">
    <p><strong>This permanently deletes your Pebble account and signs you out everywhere.</strong> It cannot be undone.</p>
    <p>Your profile, photos, preferences, matches and connections are removed. Messages you already sent may remain visible to other people, and some copies can persist in logs or backups for a limited time.</p>
    <label>Type <strong>{DELETE_CONFIRM_WORD}</strong> to confirm
      <input value={typed} onChange={event => setTyped(event.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} aria-label={`Type ${DELETE_CONFIRM_WORD} to confirm`} disabled={busy} />
    </label>
    {error && <p role="alert">{error}</p>}
    <div className="pt-delete-account-actions">
      <ActionButton secondary disabled={busy} onClick={close}>Keep my account</ActionButton>
      <ActionButton disabled={!ready} onClick={() => void submit()}>{busy ? 'Deleting…' : 'Delete my account'}</ActionButton>
    </div>
  </div>
}
