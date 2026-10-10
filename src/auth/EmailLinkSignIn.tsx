import { useState } from 'react'
import { supabase } from '../supabase'
import { Button } from '../features/prototype/ui'
import { centralSignInPath, safeReturnTo } from './returnTo'

export function EmailLinkSignIn() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  return <section className="match-record-card"><h2>Sign in to match</h2><p>Use an email sign-in link. Demo accounts cannot join the queue.</p>{!supabase ? <p role="alert">Sign-in service is not configured.</p> : <form onSubmit={async event => {
    event.preventDefault()
    if (busy) return
    setBusy(true); setMessage(''); setFailed(false)
    try {
      const returnTo = safeReturnTo(new URLSearchParams(window.location.search).get('returnTo'))
      const callback = returnTo ? centralSignInPath(returnTo) : window.location.pathname
      const { error } = await supabase!.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: `${window.location.origin}${callback}` } })
      if (error) throw error
      setMessage('Check your email for a sign-in link.')
    } catch { setFailed(true); setMessage('Could not send a sign-in link. Please try again.') }
    finally { setBusy(false) }
  }}><label>Email<input autoComplete="email" type="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} /></label><Button secondary disabled={busy} type="submit">{busy ? 'Sending…' : 'Send sign-in link'}</Button></form>}{message && <p role={failed ? 'alert' : 'status'}>{message}</p>}</section>
}
