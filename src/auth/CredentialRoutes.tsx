import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { supabase } from '../supabase'
import { AuthScreen } from './AuthScreen'
import { safeReturnTo } from './returnTo'
import { parseCallbackGrant } from './callback-grant'
import { Brand } from '../features/prototype/ui'

export function ForgotPassword() {
  const location = useLocation()
  return <AuthScreen key={location.key} mode="forgot" />
}

export function AuthCallback() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<'pending' | 'failure' | 'information' | 'recovery'>('pending')
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
      return { information: false, destination: recovery ? 'recovery' : safeReturnTo(incoming.searchParams.get('returnTo')) ?? '/settings' }
    })()
    void completion.current.then(result => {
      if (!live) return
      if (result.information) setStatus('information')
      else if (result.destination === 'recovery') setStatus('recovery')
      else navigate(result.destination, { replace: true })
    }).catch(() => { if (live) setStatus('failure') })
    return () => { live = false }
  }, [incoming, navigate])
  if (status === 'recovery') return <AuthScreen mode="reset" />
  return <section className="pt-auth pt-auth-email-first"><Brand /><div className="pt-auth-form"><h1>Account verification</h1>{status === 'failure' ? <><p role="alert">This sign-in or verification link could not be confirmed. Request a new link.</p><Link className="pt-button pt-wide" to="/auth/forgot-password">Request recovery link</Link><Link to="/login">Back to sign in</Link></> : status === 'information' ? <><p role="status">Finish confirming the email change from the other inbox, then check your account in Settings.</p><Link to="/settings">Settings</Link></> : <p role="status">Verifying your account…</p>}</div></section>
}
