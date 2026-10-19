import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../supabase'
import { authCallbackUrl, credentialError, validPassword } from './credential-policy'

// Keying on actor identity removes every credential draft on logout/account switch.
// Passwords/nonces exist only in this mounted form, never in prototype state/storage.
export function AccountCredentials({ session, ready }: { session: Session | null; ready: boolean }) {
  return <div className="pt-account-credentials" role="group" aria-label="Email & password">
    <p>Manage the email address you use to sign in and your password.</p>
    {!ready ? <p>Loading account…</p> : !session ? <p>Sign in from Settings to manage your credentials.</p> : !supabase ? <p role="status">Account credentials are unavailable because sign-in is not configured.</p> : <CredentialForm key={session.user.id} session={session} />}
  </div>
}

function CredentialForm({ session }: { session: Session }) {
  const id = useId()
  const [user, setUser] = useState<User | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [nonce, setNonce] = useState('')
  const [reauth, setReauth] = useState(false)
  const [pendingEmail, setPendingEmail] = useState('')
  const [busy, setBusy] = useState('read')
  const [error, setError] = useState('')
  const [emailMessage, setEmailMessage] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')
  const live = useRef(false)
  const locked = useRef(true)
  const dirtyEmail = useRef(false)
  const requestedEmail = useRef('')

  const readUser = useCallback(async () => {
    const { data, error } = await supabase!.auth.getUser()
    if (error || !data.user || data.user.id !== session.user.id) throw new Error('Account readback unavailable')
    if (!live.current) return
    const next = data.user
    setUser(next)
    if (requestedEmail.current && next.email === requestedEmail.current && next.email_confirmed_at && !next.is_anonymous) {
      requestedEmail.current = ''; dirtyEmail.current = false
      setEmailMessage('Email confirmed by Auth.')
    }
    setPendingEmail(next.new_email && next.new_email !== next.email ? next.new_email : requestedEmail.current)
    if (!dirtyEmail.current) setEmail(next.email ?? '')
  }, [session.user.id])
  useEffect(() => {
    live.current = true
    void readUser().catch(() => { if (live.current) setError('Could not read your account. Close and reopen Manage to try again before editing.') })
      .finally(() => { if (live.current) { locked.current = false; setBusy('') } })
    return () => { live.current = false }
    // This component is remounted for every actor change. Updates are explicitly
    // read back on opening and after writes, not inferred from mutable session metadata.
  }, [readUser])

  async function run(action: string, work: () => Promise<void>) {
    if (locked.current || !live.current) return
    locked.current = true; setBusy(action); setError('')
    try { await work() } catch (failure) { if (live.current) setError(credentialError(failure)) }
    finally { if (live.current) { locked.current = false; setBusy('') } }
  }
  const verified = !!user?.email && !!user.email_confirmed_at && !user.is_anonymous && !pendingEmail
  const disabled = !!busy || !user
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const mismatch = !!confirmation && confirmation !== password
  const passwordReady = validPassword(password) && !!confirmation && !mismatch
  return <>
    <form aria-label="Update email" onSubmit={event => {
      event.preventDefault()
      if (disabled || !validEmail || email.trim() === user?.email) return
      void run('email', async () => {
        const { error } = await supabase!.auth.updateUser({ email: email.trim() }, { emailRedirectTo: authCallbackUrl() })
        if (error) throw error
        if (!live.current) return
        requestedEmail.current = email.trim(); setPendingEmail(email.trim())
        setEmailMessage('Email confirmation pending. Follow the required confirmation links sent to your current and new email (or verify your first email for an anonymous account). Your current email is unchanged until Auth confirms it.')
        try { await readUser() } catch { if (live.current) setError('Email update requested, but account readback failed. Close and reopen Manage to confirm the result.') }
      })
    }}>
      <label htmlFor={`${id}-email`}>Sign-in email</label>
      <input id={`${id}-email`} type="email" name="email" autoComplete="username" required maxLength={254} disabled={disabled} value={email} onChange={event => { dirtyEmail.current = true; setEmail(event.target.value) }} />
      <button type="submit" className="pt-button pt-secondary" disabled={disabled || !validEmail || email.trim() === user?.email}>{busy === 'email' ? 'Requesting email change…' : 'Save email'}</button>
    </form>
    {pendingEmail && !emailMessage && <p role="status">Email confirmation pending. Follow the required email confirmation links, then close and reopen Manage.</p>}
    {emailMessage && <p role="status">{emailMessage}</p>}
    {pendingEmail && <p>Current verified email: {user?.email_confirmed_at && !user.is_anonymous ? user.email : 'None yet'}. Close and reopen Manage after completing verification.</p>}
    <form aria-label="Update password" onSubmit={event => {
      event.preventDefault()
      if (disabled || !verified || !passwordReady || (reauth && !nonce.trim())) return
      // Clear on every submitted attempt, including rejected/uncertain writes.
      const nextPassword = password, code = nonce.trim()
      void run('password', async () => {
        setPassword(''); setConfirmation(''); setNonce(''); setPasswordMessage('')
        const { error } = await supabase!.auth.updateUser({ password: nextPassword, ...(reauth ? { nonce: code } : {}) })
        if (!live.current) return
        if (error) {
          if (error.code === 'reauthentication_needed' || error.code === 'reauthentication_not_valid') setReauth(true)
          if (error.code === 'reauthentication_needed') { setError('Verify it is you before changing your password. Request a verification code.'); return }
          throw error
        }
        setReauth(false)
        try {
          await readUser()
          if (live.current) setPasswordMessage('Password updated. Use the new password next time you sign in.')
        } catch { if (live.current) setPasswordMessage('Password update accepted, but account readback failed. Sign in again to confirm the result.') }
      })
    }}>
      <label htmlFor={`${id}-password`}>New password</label>
      <input id={`${id}-password`} name="new-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} disabled={disabled || !verified} value={password} aria-describedby={`${id}-password-help`} onChange={event => setPassword(event.target.value)} />
      <p id={`${id}-password-help`}>Use 8–128 characters.{user && !verified && ' Verify your email, then close and reopen Manage to set a password.'}</p>
      <label htmlFor={`${id}-confirmation`}>Confirm new password</label>
      <input id={`${id}-confirmation`} name="confirm-new-password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} disabled={disabled || !verified} value={confirmation} aria-invalid={mismatch} aria-describedby={`${id}-password-help${mismatch ? ` ${id}-password-mismatch` : ''}`} onChange={event => setConfirmation(event.target.value)} />
      {mismatch && <p id={`${id}-password-mismatch`} role="status">Passwords do not match.</p>}
      {reauth && <div><button type="button" className="pt-button pt-secondary" disabled={disabled || !verified} onClick={() => void run('reauth', async () => {
        setNonce('')
        const { error } = await supabase!.auth.reauthenticate()
        if (error) throw error
        if (live.current) setPasswordMessage('Verification code sent. Check your confirmed email.')
      })}>{busy === 'reauth' ? 'Sending verification code…' : 'Send verification code'}</button><label htmlFor={`${id}-nonce`}>Verification code</label><input id={`${id}-nonce`} autoComplete="one-time-code" required maxLength={128} disabled={disabled} value={nonce} onChange={event => setNonce(event.target.value)} /></div>}
      <button type="submit" className="pt-button pt-secondary" disabled={disabled || !verified || !passwordReady || (reauth && !nonce.trim())}>{busy === 'password' ? 'Saving password…' : 'Save password'}</button>
    </form>
    {passwordMessage && <p role="status">{passwordMessage}</p>}
    {error && <p role="alert">{error}</p>}
  </>
}
