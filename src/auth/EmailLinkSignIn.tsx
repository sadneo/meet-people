import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { supabase } from '../supabase'
import { Button } from '../features/prototype/ui'
import { safeReturnTo } from './returnTo'
import { authCallbackUrl } from './credential-policy'
import { getLocalDevelopmentEnvironment, isLocalDevelopment } from './localDevelopment'
import { useAuthRequest } from './useAuthRequest'

export function EmailLinkSignIn() {
  const location = useLocation()
  return <SignInForm key={location.key} />
}

function SignInForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordMode, setPasswordMode] = useState(false)
  const navigate = useNavigate()
  const [pending, setPending] = useState<'email' | 'development' | null>(null)
  const request = useAuthRequest()
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const local = () => import.meta.env.DEV && isLocalDevelopment(getLocalDevelopmentEnvironment())
  return <section className="match-record-card"><h2>Sign in to match</h2><p>Use an email sign-in link or your password. Demo accounts cannot join the queue.</p>{!supabase ? <p role="alert">Sign-in service is not configured.</p> : <form onSubmit={async event => {
    event.preventDefault()
    const id = request.begin()
    if (id === null) return
    setPending('email'); setMessage(''); setFailed(false)
    try {
      const returnTo = safeReturnTo(new URLSearchParams(window.location.search).get('returnTo'))
      if (passwordMode) {
        const secret = password
        setPassword('')
        const result = await supabase!.auth.signInWithPassword({ email: email.trim(), password: secret })
        if (!request.current(id)) return
        if (result.error) throw result.error
        const verified = await supabase!.auth.getUser()
        if (!request.current(id)) return
        if (verified.error || !verified.data.user) throw new Error('Readback unavailable')
        navigate(returnTo ?? '/settings', { replace: true })
      } else {
        const { error } = await supabase!.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: authCallbackUrl(returnTo ?? '/settings') } })
        if (!request.current(id)) return
        if (error) throw error
        setMessage('Check your email for a sign-in link.')
      }
    } catch { if (request.current(id)) { setFailed(true); setMessage(passwordMode ? 'Could not sign in. Check your credentials or request a recovery link.' : 'Could not send a sign-in link. Please try again.') } }
    finally { if (request.finish(id)) setPending(null) }
  }}><label>Email<input name="email" autoComplete={passwordMode ? 'username' : 'email'} type="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} /></label>{passwordMode && <label>Password<input name="password" type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={event => setPassword(event.target.value)} /></label>}<Button secondary disabled={pending !== null} type="submit">{pending === 'email' ? passwordMode ? 'Signing in…' : 'Sending…' : passwordMode ? 'Sign in with password' : 'Send sign-in link'}</Button><Button secondary disabled={pending !== null} onClick={() => { setPassword(''); setPasswordMode(!passwordMode); setMessage('') }}>{passwordMode ? 'Use email link' : 'Use password'}</Button><Link to="/auth/forgot-password">Forgot password?</Link></form>}
    {import.meta.env.DEV && isLocalDevelopment(getLocalDevelopmentEnvironment()) && <div>
      <p>Use the operator-provisioned local development account. No account or example data is created here.</p>
      <Button secondary disabled={!supabase || pending !== null} onClick={async () => {
        if (!local() || !supabase) return
        const id = request.begin()
        if (id === null) return
        setPending('development'); setMessage('Signing in as development user…'); setFailed(false)
        try {
          if (!import.meta.env.DEV) return
          const { signInDevelopmentUser } = await import('./developmentLogin')
          await signInDevelopmentUser(supabase, () => request.current(id) && local())
          if (request.current(id) && local()) navigate(safeReturnTo(new URLSearchParams(window.location.search).get('returnTo')) ?? '/settings', { replace: true })
        } catch { if (request.current(id)) { setFailed(true); setMessage('The development account is not ready or sign-in could not be verified. Ask the operator to finish provisioning, then retry.') } }
        finally { if (request.finish(id)) setPending(null) }
      }}>{pending === 'development' ? 'Signing in as development user…' : 'Sign in as development user'}</Button>
    </div>}
    {message && <p role={failed ? 'alert' : 'status'}>{message}</p>}</section>
}
