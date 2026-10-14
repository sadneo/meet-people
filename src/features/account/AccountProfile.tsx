import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useSession } from '../../auth/useSession'
import { AccountProfileSchema, type AccountProfile } from '../../../shared/account-profile'
import { matchmakingClient } from '../matchmaking/client'
import './account-profile.css'

const emptyAccount: AccountProfile = { username: '', display_name: '', bio: null, avatar_url: null }
function AccountEditor({ token }: { token: string }) {
  const [draft, setDraft] = useState<AccountProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let live = true
    void matchmakingClient(token).accountProfile().then(({ profile }) => { if (live) setDraft(profile ?? emptyAccount) })
      .catch(() => { if (live) setError('Account profile unavailable. The account-profile migration may not be installed. No changes were saved.') })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [token, attempt])
  const update = (patch: Partial<AccountProfile>) => { setDraft(current => current && { ...current, ...patch }); setNotice('') }
  return <>{loading ? <p role="status">Loading account profile…</p> : !draft ? <><p role="alert">{error}</p><button className="pt-button pt-secondary" onClick={() => { setLoading(true); setError(''); setAttempt(value => value + 1) }}>Retry account profile</button></> : <form onSubmit={async event => {
    event.preventDefault()
    const parsed = AccountProfileSchema.safeParse(draft)
    if (!parsed.success) { setError('Use a name, username and a valid HTTPS avatar URL.'); return }
    setBusy(true); setError(''); setNotice('')
    try { const { profile } = await matchmakingClient(token).saveAccountProfile(parsed.data); setDraft(profile); setNotice('Account profile saved.') }
    catch { setError('Account profile unavailable. No changes were saved. Retry when the account-profile backend is connected.') }
    finally { setBusy(false) }
  }}>
    <p>Your name, username, bio and avatar belong to your account. Matching preferences are separate.</p>
    <fieldset disabled={busy}><legend className="pt-sr-only">Account identity</legend>
      <label>Username<input required maxLength={80} autoComplete="username" value={draft.username} onChange={event => update({ username: event.target.value })} /></label>
      <label>Display name<input required maxLength={120} autoComplete="nickname" value={draft.display_name} onChange={event => update({ display_name: event.target.value })} /></label>
      <label>Bio<textarea maxLength={1000} value={draft.bio ?? ''} onChange={event => update({ bio: event.target.value || null })} /></label>
      <label>Avatar URL (HTTPS, optional)<input type="url" maxLength={2048} value={draft.avatar_url ?? ''} onChange={event => update({ avatar_url: event.target.value || null })} /></label>
    </fieldset>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <button className="pt-button" disabled={busy || !draft.username.trim() || !draft.display_name.trim()}>{busy ? 'Saving…' : 'Save account profile'}</button>
  </form>}</>
}
export function AccountProfileScreen() {
  const { session, ready } = useSession()
  return <section className="account-profile" aria-labelledby="account-profile-title"><Link to="/profile">Back to Profile</Link><h1 id="account-profile-title" tabIndex={-1}>Account profile</h1>
    {!ready ? <p role="status">Loading account…</p> : !session ? <><h2>Sign in to manage your account profile</h2><Link className="pt-button" to="/login?returnTo=/profile/account">Sign in</Link></> : <AccountEditor key={session.access_token} token={session.access_token} />}
    <Link to="/matchmaking">Matching preferences</Link>
  </section>
}
