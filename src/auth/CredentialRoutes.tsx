import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { supabase } from '../supabase'
import { authCallbackUrl } from './credential-policy'
import { safeReturnTo } from './returnTo'
import { useAuthRequest } from './useAuthRequest'
import { parseCallbackGrant } from './callback-grant'

export function ForgotPassword() {
  const location = useLocation()
  return <RecoveryForm key={location.key} />
}

function RecoveryForm() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const request = useAuthRequest()
  return <section className="pt-auth"><h1>Recover your password</h1><form onSubmit={async event => {
    event.preventDefault()
    if (!supabase) return
    const id = request.begin()
    if (id === null) return
    setBusy(true); setMessage(''); setFailed(false)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: authCallbackUrl('/settings', true) })
      if (!request.current(id)) return
      if (error) throw error
      setMessage('If this email has an account, check its inbox for a recovery link.')
    } catch { if (request.current(id)) { setFailed(true); setMessage('Could not request recovery. Wait a moment and try again.') } }
    finally { if (request.finish(id)) setBusy(false) }
  }}><label>Email<input name="email" type="email" autoComplete="username" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} /></label><button className="pt-button pt-secondary" disabled={!supabase || busy}>{busy ? 'Sending recovery link…' : 'Send recovery link'}</button></form>{message && <p role={failed ? 'alert' : 'status'}>{message}</p>}<Link to="/login">Back to sign in</Link></section>
}

export function AuthCallback() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<'pending' | 'failure' | 'information'>('pending')
  const [incoming] = useState(() => new URL(window.location.href))
  const completion = useRef<Promise<{ information: boolean; destination: string }> | null>(null)
  useEffect(() => {
    let live = true
    // Automatic detection is disabled for this route in the singleton initializer.
    // Capture came from the original URL; remove all query/hash data before any
    // parsing result or SDK network operation can outlive it in browser history.
    window.history.replaceState(window.history.state, '', '/auth/callback')
    // React StrictMode may replay this effect; never exchange the same grant twice.
    completion.current ??= (async () => {
      const parsed = parseCallbackGrant(incoming)
      if (parsed.kind === 'information') return { information: true, destination: '/settings' }
      if (!supabase) throw new Error('Auth unavailable')
      const grant = parsed.grant
      const result = grant.kind === 'code' ? await supabase.auth.exchangeCodeForSession(grant.code)
        : grant.kind === 'otp' ? await supabase.auth.verifyOtp({ token_hash: grant.token, type: grant.type })
          : await supabase.auth.setSession({ access_token: grant.access, refresh_token: grant.refresh })
      if (result.error || !result.data.session?.user.id) throw new Error('Callback exchange failed')
      const verified = await supabase.auth.getUser()
      if (verified.error || !verified.data.user || verified.data.user.id !== result.data.session.user.id) throw new Error('Unverified callback')
      const recovery = parsed.recovery || decodeURIComponent(incoming.pathname).replace(/\/+$/, '').toLowerCase() === '/reset-password'
      return { information: false, destination: recovery ? '/settings?credentials=recovery' : safeReturnTo(incoming.searchParams.get('returnTo')) ?? '/settings' }
    })()
    void completion.current.then(result => {
      if (!live) return
      if (result.information) setStatus('information')
      else navigate(result.destination, { replace: true })
    }).catch(() => { if (live) setStatus('failure') })
    return () => { live = false }
  }, [incoming, navigate])
  return <section className="pt-auth"><h1>Account verification</h1>{status === 'failure' ? <><p role="alert">This sign-in or verification link could not be confirmed. Request a new link.</p><Link to="/login">Sign in</Link><Link to="/auth/forgot-password">Request recovery link</Link></> : status === 'information' ? <><p role="status">Finish confirming the email change from the other inbox, then check your account in Settings.</p><Link to="/settings">Settings</Link></> : <p role="status">Verifying your account…</p>}</section>
}
