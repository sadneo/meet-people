import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { Brand, Button } from '../features/prototype/ui'
import { supabase } from '../supabase'
import { useSession } from './useSession'
import { useAccount } from './account-context'
import { safeReturnTo } from './returnTo'
import { getLocalDevelopmentEnvironment, isLocalDevelopment } from './localDevelopment'
import { apiUrl, authRedirect, isNative } from '../platform/native'
import { Browser } from '@capacitor/browser'

type Mode = 'login' | 'register' | 'forgot' | 'reset' | 'callback'
type Step = 'email' | 'password' | 'register' | 'confirmation'
class AuthMessage extends Error {}

async function emailExists(email: string) {
  const response = await fetch(apiUrl('/api/auth/email'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }), cache: 'no-store', signal: AbortSignal.timeout(10_000),
  })
  if (response.status === 429) throw new AuthMessage('Too many attempts. Please wait a few minutes and try again.')
  if (!response.ok) throw new AuthMessage('Email sign-in is temporarily unavailable. Please try again.')
  const data: unknown = await response.json()
  if (!data || typeof data !== 'object' || !('exists' in data) || typeof data.exists !== 'boolean') throw new AuthMessage('Email sign-in is temporarily unavailable. Please try again.')
  return data.exists
}

function authError(error: { code?: string }, fallback: string) {
  switch (error.code) {
    case 'invalid_credentials': return 'Incorrect email or password. Please try again.'
    case 'email_not_confirmed': return 'Confirm your email before signing in. Check your inbox or resend the confirmation below.'
    case 'user_already_exists': case 'email_exists': return 'An account already uses this email. Return to sign in, or reset your password.'
    case 'weak_password': return 'Choose a stronger password with at least 8 characters.'
    case 'over_email_send_rate_limit': case 'over_request_rate_limit': return 'Too many attempts. Please wait a few minutes and try again.'
    case 'same_password': return 'Choose a password different from your current password.'
    case 'session_not_found': case 'refresh_token_not_found': return 'Your session has expired. Request a new password-reset link.'
    default: return fallback
  }
}

export function AuthScreen({ mode = 'login' }: { mode?: Mode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { session, ready } = useSession()
  const account = useAccount()
  const returnTo = safeReturnTo(new URLSearchParams(location.search).get('returnTo')) ?? '/'
  const link = (path: string) => `${path}?${new URLSearchParams({ returnTo })}`
  const redirectTo = authRedirect(link('/auth/callback'))
  const routeState = location.state as { authStep?: Step; email?: string } | null
  const step: Step = ['password', 'register', 'confirmation'].includes(routeState?.authStep ?? '') ? routeState!.authStep! : 'email'
  const [email, setEmail] = useState(routeState?.email ?? '')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [pending, setPending] = useState('')
  const working = useRef(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState(false)
  const [recoverySent, setRecoverySent] = useState(false)
  const [resetDone, setResetDone] = useState(false)
  const [callbackFailed, setCallbackFailed] = useState(() => {
    const params = new URLSearchParams(window.location.hash.slice(1))
    const query = new URLSearchParams(location.search)
    return params.has('error') || params.has('error_description') || query.has('error') || query.has('error_description')
  })
  const form = useRef<HTMLDivElement>(null)
  const busy = Boolean(pending) || Boolean(account?.busy)
  const authMode = mode === 'login' || mode === 'register' || mode === 'callback'
  const passwordStep = authMode && step === 'password'
  const registerStep = authMode && step === 'register'
  const emailStep = authMode && step === 'email'
  const [previousPage, setPreviousPage] = useState(`${location.key}:${mode}`)
  const page = `${location.key}:${mode}`
  const currentPage = useRef<string | null>(page)
  if (previousPage !== page) {
    setPreviousPage(page)
    if (routeState?.email !== undefined) setEmail(routeState.email)
    setMessage(''); setFailed(false); setConfirmEmail(false); setRecoverySent(false)
    if (mode !== 'callback' && mode !== 'reset') setCallbackFailed(false)
  }

  useEffect(() => {
    currentPage.current = page
    form.current?.querySelector<HTMLElement>('h1')?.focus()
    // History contains only the email and step, never passwords or tokens.
    return () => { currentPage.current = null }
  }, [page])
  useEffect(() => {
    if (!callbackFailed) return
    const params = new URLSearchParams(location.search)
    for (const key of ['error', 'error_description', 'error_code']) params.delete(key)
    window.history.replaceState(window.history.state, '', window.location.pathname + (params.size ? `?${params}` : ''))
  }, [callbackFailed, location.search])

  const go = (next: Step, path = '/login', replace = false) => {
    if (currentPage.current !== page) return
    navigate(link(path), { replace, state: { authStep: next, email: email.trim() } })
  }
  const changeEmail = (value: string) => {
    if (value !== email) { setPassword(''); setConfirmation(''); setShowPassword(false) }
    setEmail(value)
  }
  const run = async (label: string, operation: () => Promise<void>) => {
    if (working.current || account?.busy || !supabase) return
    working.current = true; setPending(label); setFailed(false); setMessage('')
    try { await operation() }
    catch (failure) {
      if (currentPage.current !== page) return
      setFailed(true)
      setMessage(failure instanceof AuthMessage ? failure.message : 'Could not connect to sign-in. Please try again.')
    } finally { working.current = false; setPending('') }
  }
  const oauth = () => void run('google', async () => {
    const native = isNative()
    const { data, error } = await supabase!.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, ...(native ? { skipBrowserRedirect: true } : {}) } })
    if (error) throw new AuthMessage('Google sign-in did not complete. Please try again or continue with email.')
    if (native && data.url) await Browser.open({ url: data.url })
  })
  const resend = () => void run('resend', async () => {
    const { error } = await supabase!.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: redirectTo } })
    if (currentPage.current !== page) return
    if (error) throw new AuthMessage(authError(error, 'Could not send confirmation. Please try again.'))
    setMessage('Confirmation email sent. Check your inbox.')
  })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    void run('submit', async () => {
      if (emailStep) {
        const exists = await emailExists(email.trim())
        go(exists ? 'password' : 'register')
      } else if (mode === 'forgot') {
        const { error } = await supabase!.auth.resetPasswordForEmail(email.trim(), { redirectTo: authRedirect(link('/reset-password')) })
        if (currentPage.current !== page) return
        if (error) throw new AuthMessage(authError(error, 'Could not send the reset link. Please try again.'))
        setRecoverySent(true)
      } else if (mode === 'reset' || registerStep) {
        if (password.length < 8) throw new AuthMessage('Use at least 8 characters for your password.')
        if (password !== confirmation) throw new AuthMessage('Passwords do not match. Please check both fields.')
        if (mode === 'reset') {
          const { error } = await supabase!.auth.updateUser({ password })
          if (currentPage.current !== page) return
          if (error) throw new AuthMessage(authError(error, 'Could not update your password. Request a new reset link and try again.'))
          setResetDone(true); setPassword(''); setConfirmation('')
        } else {
          const { data, error } = await supabase!.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: redirectTo } })
          if (currentPage.current !== page) return
          if (error) throw new AuthMessage(authError(error, 'Could not create your account. Please try again, or return to sign in.'))
          if (!data.session && data.user?.identities?.length === 0) throw new AuthMessage('An account already uses this email. Return to sign in, or reset your password.')
          // Supabase may deliberately obscure duplicate accounts; do not claim a session.
          if (!data.session) { go('confirmation', '/login', true); setPassword(''); setConfirmation('') }
        }
      } else {
        const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password })
        if (currentPage.current !== page) return
        if (error) {
          if (error.code === 'email_not_confirmed') setConfirmEmail(true)
          throw new AuthMessage(authError(error, 'Could not sign in. Please try again, or use Google if that is how you created your account.'))
        }
      }
    })
  }

  if (session && ready && account?.loaded && !callbackFailed && authMode) {
    return <Navigate replace to={account.account.completed.length < 4 ? link('/onboarding') : returnTo} />
  }
  const title = mode === 'forgot' ? recoverySent ? 'Check your email' : 'Reset your password'
    : mode === 'reset' ? resetDone ? 'Password updated' : 'Choose a new password'
    : step === 'confirmation' ? 'Check your email' : passwordStep ? 'Welcome back' : registerStep ? 'Create your account' : 'Welcome to Pebble'
  const status = message && <p id="auth-message" className={failed ? 'pt-auth-error' : 'pt-auth-message'} role="status">{failed && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v6m0 3v1" /></svg>}{message}</p>
  const passwordFields = <>
    <div className="pt-password-field"><div className="pt-password-heading"><label htmlFor="auth-password">Password</label>{passwordStep && <Link to={link('/forgot-password')} state={{ email }}>Forgot password?</Link>}</div>
      <div className="pt-password-input"><input id="auth-password" name="password" type={showPassword ? 'text' : 'password'} required minLength={passwordStep ? undefined : 8} autoComplete={passwordStep ? 'current-password' : 'new-password'} value={password} aria-describedby={failed ? 'auth-message' : registerStep || mode === 'reset' ? 'auth-password-hint' : undefined} onChange={event => setPassword(event.target.value)} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide' : 'Show'}</button></div>
    </div>
    {(registerStep || mode === 'reset') && <><p className="pt-hint pt-auth-message" id="auth-password-hint">Use at least 8 characters.</p><label htmlFor="auth-confirmation">Confirm password<input id="auth-confirmation" type={showPassword ? 'text' : 'password'} required minLength={8} autoComplete="new-password" value={confirmation} aria-describedby={failed ? 'auth-message' : undefined} onChange={event => setConfirmation(event.target.value)} /></label></>}
  </>
  const google = <><div className="pt-auth-divider">or</div><Button secondary className="pt-wide" disabled={busy} onClick={oauth}>{pending === 'google' ? <><span className="pt-auth-spinner" aria-hidden="true" />Connecting to Google…</> : 'Continue with Google'}</Button></>

  return <section className="pt-auth"><Brand /><div ref={form} className="pt-auth-form"><h1 tabIndex={-1}>{title}</h1>
    {!supabase ? <p role="status">Sign-in service is not configured.</p> : !ready ? <p role="status">Loading session…</p>
      : session && authMode && !callbackFailed ? <><p role="status">{account?.error ? 'Could not load your account. Please try again.' : 'Loading your account…'}</p>{account?.error && <Button secondary onClick={() => void account.reload()}>Retry account</Button>}</>
      : mode === 'reset' && (!session || callbackFailed) ? <><p role="status">This recovery link is invalid or expired. Request a new link to reset your password.</p><Link to={link('/forgot-password')} state={{ email }}>Request another link</Link></>
      : resetDone ? <><p role="status">Your password has been updated.</p><Link to={returnTo}>Continue to Pebble</Link></>
      : recoverySent ? <><p role="status">If {email} has an account, a password-reset link is on its way. Check your inbox and follow the link to choose a new password.</p><Button secondary onClick={() => { setRecoverySent(false); setMessage(''); form.current?.querySelector<HTMLElement>('h1')?.focus() }}>Change email</Button><Link to={link('/login')} state={{ email, authStep: 'password' }}>Back to sign in</Link></>
      : authMode && step === 'confirmation' ? <><p role="status">Check your email to confirm your account. Follow the link sent to {email}, then return to sign in. If you already have an account, sign in instead.</p>{status}<Button secondary disabled={busy} onClick={resend}>{pending === 'resend' ? 'Sending…' : 'Resend confirmation'}</Button><Button secondary disabled={busy} onClick={() => go('password')}>Back to sign in</Button><Button secondary disabled={busy} onClick={() => go('email')}>Change email</Button></>
      : <>
        {(callbackFailed || (mode === 'callback' && !session)) && <p className="pt-auth-error" role="status">Sign-in did not complete. The request may have been canceled or the link expired. Please try again.</p>}
        <form onSubmit={submit} aria-busy={busy}><fieldset disabled={busy}>
          {(emailStep || mode === 'forgot') ? <label htmlFor="auth-email">Email<input id="auth-email" name="email" type="email" required maxLength={254} autoComplete="email" value={email} aria-describedby={failed ? 'auth-message' : undefined} onChange={event => changeEmail(event.target.value)} /></label>
            : mode !== 'reset' && <><div className="pt-auth-email"><span>{email}</span><button type="button" className="pt-text-button" onClick={() => go('email')}>Change</button></div><input type="text" name="email" autoComplete="username" value={email} readOnly hidden /></>}
          {!emailStep && mode !== 'forgot' && passwordFields}
          {status}
          <Button type="submit" className="pt-wide" disabled={busy}>{pending === 'submit' ? <><span className="pt-auth-spinner" aria-hidden="true" />{emailStep ? 'Continuing…' : passwordStep ? 'Signing in…' : registerStep ? 'Creating account…' : 'Please wait…'}</> : emailStep ? 'Continue with email' : mode === 'forgot' ? 'Send reset link' : mode === 'reset' ? 'Save password' : registerStep ? 'Create account' : 'Sign in'}</Button>
        </fieldset></form>
        {confirmEmail && <Button secondary disabled={busy} onClick={resend}>{pending === 'resend' ? 'Sending…' : 'Resend confirmation'}</Button>}
        {authMode && google}
        {emailStep && <p className="pt-auth-account">New to Pebble? <Link to={link('/register')} state={{ email }}>Create an account</Link></p>}
        {registerStep && <Button secondary disabled={busy} onClick={() => go('password')}>Back to sign in</Button>}
        {mode === 'forgot' && <Link to={link('/login')} state={{ email, authStep: email ? 'password' : 'email' }}>Back to sign in</Link>}
      </>}
    <Link className="pt-auth-home" to="/">Back to home</Link>
    {import.meta.env.DEV && isLocalDevelopment(getLocalDevelopmentEnvironment()) && supabase && <aside className="pt-auth-dev"><span>Local development</span><a href="http://127.0.0.1:54324" target="_blank" rel="noreferrer">Open Supabase email viewer</a></aside>}
  </div></section>
}
