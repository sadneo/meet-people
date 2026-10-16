import { Link } from 'react-router'
import { supabase } from '../../supabase'
import { centralSignInPath } from '../../auth/returnTo'

export function EventSignIn() {
  return <section className="ev-event-signin"><p>Sign in to see interested people and find company.</p>{supabase ? <Link className="pt-button pt-secondary" to={centralSignInPath(window.location.pathname + window.location.search)}>Sign in</Link> : <p>Sign-in is currently unavailable.</p>}</section>
}
