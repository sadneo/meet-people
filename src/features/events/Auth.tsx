import { useState } from 'react'
import { supabase } from '../../supabase'
import { Button } from './ui'

export function EventSignIn({ purpose = 'event' }: { purpose?: 'event' | 'messages' }) {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  return <form className="ev-event-signin" onSubmit={async event => {
    event.preventDefault()
    if (!supabase) return
    setBusy(true)
    try {
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}${window.location.search}` } })
      if (error) throw error
      setMessage(`Check your email for a sign-in link. Open it to return to ${purpose === 'messages' ? 'Messages' : 'this event'}.`)
    } catch { setMessage('Could not send a sign-in link. Check your email and try again.') }
    finally { setBusy(false) }
  }}>
    <p>{purpose === 'messages' ? 'Sign in to open your saved conversations.' : 'Sign in to see interested people and find company.'}</p>
    {supabase ? <><label>Email<input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} /></label><Button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Email me a sign-in link'}</Button></> : <p>Sign-in is currently unavailable.</p>}
    {message && <p role="status">{message}</p>}
  </form>
}
