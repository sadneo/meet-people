import { Navigate, useLocation, useParams } from 'react-router'
import { useSession } from '../../auth/useSession'
import { EventDetail, EventsScreen } from '../events/Browse'
import { eventDetailPath, eventsPath } from '../events/routes'
import './guest-events.css'

// Logged-out events browsing. Rendered inside PublicLayout (public header and footer, no
// member tabs, no prototype state). Signed-in members are sent to the in-app /events page.
export function GuestEvents() {
  const { session, ready } = useSession()
  const { search } = useLocation()
  if (!ready) return <p role="status">Loading events…</p>
  if (session) return <Navigate replace to={`${eventsPath}${search}`} />
  return <EventsScreen guest />
}

export function GuestEventDetail() {
  const { session, ready } = useSession()
  const { id = '' } = useParams()
  if (!ready) return <p role="status">Loading event…</p>
  if (session) return <Navigate replace to={eventDetailPath(id)} />
  return <EventDetail guest />
}