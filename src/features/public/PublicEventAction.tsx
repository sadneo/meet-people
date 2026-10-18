import { Link } from 'react-router'
import { useSession } from '../../auth/useSession'
import { EventGroupQueue } from '../events/EventGroupQueue'
import { eventDetailPath } from '../events/routes'
import { publicAuthPath } from './links'

export function PublicEventAction({ listingId }: { listingId: string }) {
  const { session, ready } = useSession()
  if (!ready) return <p role="status">Loading session…</p>
  if (session) return <EventGroupQueue listingId={listingId} />
  const destination = eventDetailPath(listingId)
  return <section className="public-event-action" aria-label="Find company">
    <h2>Better with company.</h2><p>Create an account to look for people to go with. You’ll come back to this event after signing in.</p>
    <Link className="ev-button ev-wide" to={publicAuthPath('register', destination)}>Sign up to find company</Link>
    <p>Already on Pebble? <Link className="ev-text-button" to={publicAuthPath('login', destination)}>Sign in</Link></p>
  </section>
}
