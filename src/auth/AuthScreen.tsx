import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router'
import { Brand, Button } from '../features/prototype/ui'
import { supabase } from '../supabase'
import { useSession } from './useSession'
import { useAccount } from './account-context'
import { safeReturnTo } from './returnTo'

export function AuthScreen({ mode = 'login' }: { mode?: 'login' | 'register' | 'forgot' | 'reset' | 'callback' }) {
  const location = useLocation()
  return <AuthForm key={mode} mode={mode} search={location.search} />
}

function AuthForm({ mode, search }: { mode: 'login' | 'register' | 'forgot' | 'reset' | 'callback'; search: string }) {
  const { session, ready } = useSession()
  const account = useAccount()
  const returnTo = safeReturnTo(new URLSearchParams(search).get('returnTo')) ?? '/'
  const link = (path: string) => `${path}?${new URLSearchParams({ returnTo })}`
  const redirectTo = `${window.location.origin}${link('/auth/callback')}`
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState(false)
  const [resetDone, setResetDone] = useState(false)
  const [callbackError] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('error_description') ?? new URLSearchParams(search).get('error_description'))
  useEffect(() => {
    if (callbackError) window.history.replaceState(null, '', window.location.pathname + search)
  }, [callbackError, search])
  if (session && ready && account?.loaded && !callbackError && (mode === 'login' || mode === 'register' || mode === 'callback')) {
    return <Navigate replace to={account.account.completed.length < 4 ? link('/onboarding') : returnTo} />
  }
  const run = async (operation: () => Promise<void>) => {
    if (busy || !supabase) return
    setBusy(true); setFailed(false); setMessage('')
    try { await operation() }
    catch (failure) { setFailed(true); setMessage(failure instanceof Error ? failure.message : 'Sign-in service is unavailable. Try again.') }
    finally { setBusy(false) }
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    void run(async () => {
      if (mode === 'forgot') {
        const { error } = await supabase!.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` })
        if (error) throw error
        setMessage('If this email has an account, a password-reset link is on its way. Local development emails appear in the mail viewer.')
      } else if (mode === 'reset') {
        if (password !== confirmation) throw new Error('Passwords do not match.')
        const { error } = await supabase!.auth.updateUser({ password })
        if (error) throw error
        setResetDone(true); setPassword(''); setConfirmation(''); setMessage('Your password has been updated.')
      } else if (mode === 'register') {
        if (password !== confirmation) throw new Error('Passwords do not match.')
        const { data, error } = await supabase!.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: redirectTo } })
        if (error) throw error
        if (!data.session) { setConfirmEmail(true); setMessage('Check your email to confirm your account. Local development emails appear in the mail viewer.') }
      } else {
        const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password })
        if (error) { if (error.code === 'email_not_confirmed') setConfirmEmail(true); throw error }
      }
    })
  }
  const title = { login: 'Sign in', register: 'Create an account', forgot: 'Reset your password', reset: 'Choose a new password', callback: 'Completing sign-in' }[mode]
  return <section className="pt-auth"><Brand /><div className="pt-auth-form"><h1>{title}</h1>
    {!supabase ? <p role="alert">Sign-in service is not configured.</p> : !ready ? <p role="status">Loading session…</p> : callbackError ? <p role="alert">{callbackError}</p> : mode === 'callback' && !session ? <p role="alert">Sign-in did not complete. The link may be invalid or expired. Try signing in again.</p> : mode === 'callback' || (session && mode !== 'reset' && mode !== 'forgot') ? <><p role="status">{account?.error || 'Loading your account…'}</p>{account?.error && <Button secondary onClick={() => void account.reload()}>Retry account</Button>}</> : mode === 'reset' && !session ? <><p role="alert">This recovery link is invalid or expired.</p><Link to="/forgot-password">Request another link</Link></> : resetDone ? <><p role="status">{message}</p><Link to="/">Continue to Pebble</Link></> : <>
      <form onSubmit={submit}><fieldset disabled={busy || account?.busy}>
        {mode !== 'reset' && <label>Email<input type="email" required maxLength={254} autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} /></label>}
        {mode !== 'forgot' && <label>Password<input type="password" required minLength={mode === 'login' ? undefined : 8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={event => setPassword(event.target.value)} /></label>}
        {(mode === 'register' || mode === 'reset') && <label>Confirm password<input type="password" required minLength={8} autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>}
        <Button type="submit" secondary className="pt-wide" disabled={busy}>{busy ? 'Please wait…' : mode === 'register' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : mode === 'reset' ? 'Save password' : 'Sign in'}</Button>
      </fieldset></form>
      {message && <p role={failed ? 'alert' : 'status'}>{message}</p>}
      {confirmEmail && <Button secondary disabled={busy} onClick={() => void run(async () => { const { error } = await supabase!.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: redirectTo } }); if (error) throw error; setMessage('Confirmation email sent.'); })}>Resend confirmation</Button>}
      {(mode === 'login' || mode === 'register') && <><Button secondary className="pt-wide" disabled={busy} onClick={() => void run(async () => { const { error } = await supabase!.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } }); if (error) throw error; })}>Continue with Google</Button><Link to={link(mode === 'login' ? '/register' : '/login')}>{mode === 'login' ? 'Create an account' : 'Already have an account? Sign in'}</Link></>}
      {mode === 'login' && <Link to="/forgot-password">Forgot your password?</Link>}
    </>}
    {import.meta.env.DEV && supabase && <p className="pt-hint">Using local Supabase? <a href="http://127.0.0.1:54324" target="_blank" rel="noreferrer">Open the email viewer</a>.</p>}
    <Link to="/">Back to home preview</Link>{mode === 'callback' && <Link to={link('/login')}>Back to sign in</Link>}
  </div></section>
}
