import { useRef, useState } from 'react'
import { supabase } from '../supabase'
import { Button } from '../features/prototype/ui'
import { centralSignInPath, safeReturnTo } from './returnTo'
import { getLocalDevelopmentEnvironment, isLocalDevelopment } from './localDevelopment'

export function EmailLinkSignIn() {
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState<'email' | 'local' | null>(null)
  const requestPending = useRef(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  return <section className="match-record-card"><h2>Sign in to match</h2><p>Use an email sign-in link. Demo accounts cannot join the queue.</p>{!supabase ? <p role="alert">Sign-in service is not configured.</p> : <form onSubmit={async event => {
    event.preventDefault()
    if (requestPending.current) return
    requestPending.current = true
    setPending('email'); setMessage(''); setFailed(false)
    try {
      const returnTo = safeReturnTo(new URLSearchParams(window.location.search).get('returnTo'))
      const callback = returnTo ? centralSignInPath(returnTo) : window.location.pathname
      const { error } = await supabase!.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: `${window.location.origin}${callback}` } })
      if (error) throw error
      setMessage('Check your email for a sign-in link.')
    } catch { setFailed(true); setMessage('Could not send a sign-in link. Please try again.') }
    finally { requestPending.current = false; setPending(null) }
  }}><label>Email<input autoComplete="email" type="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} /></label><Button secondary disabled={pending !== null} type="submit">{pending === 'email' ? 'Sending…' : 'Send sign-in link'}</Button></form>}
    {import.meta.env.DEV && isLocalDevelopment(getLocalDevelopmentEnvironment()) && <div>
      <p>Local development only: create a disposable anonymous Supabase session. This is not a permanent email account.</p>
      <Button secondary disabled={!supabase || pending !== null} onClick={async () => {
        if (!import.meta.env.DEV || !isLocalDevelopment(getLocalDevelopmentEnvironment()) || !supabase || requestPending.current) return
        requestPending.current = true
        setPending('local'); setMessage('Signing in locally…'); setFailed(false)
        try {
          const { error } = await supabase.auth.signInAnonymously()
          if (error) throw error
          setMessage('Signed in with a disposable local development session.')
        } catch { setFailed(true); setMessage('Could not complete local quick sign-in. Check that anonymous Auth is enabled locally, or use an email sign-in link.') }
        finally { requestPending.current = false; setPending(null) }
      }}>{pending === 'local' ? 'Signing in locally…' : 'Quick sign in (local only)'}</Button>
    </div>}
    {message && <p role={failed ? 'alert' : 'status'}>{message}</p>}</section>
}
