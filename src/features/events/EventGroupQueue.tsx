import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useSession } from '../../auth/useSession'
import { centralSignInPath } from '../../auth/returnTo'
import { EventGroupQueueSchema, type EventGroupQueue as QueueSnapshot } from '../../../shared/matchmaking'
import { matchmakingClient } from '../matchmaking/client'
import { matchingErrorText } from '../matchmaking/useMatchmaking'
import { useVisiblePolling } from '../matchmaking/useVisiblePolling'
import { eventDetailPath } from './routes'
import { Button } from './ui'

function SignedInQueue({ listingId, token, actorId }: { listingId: string; token: string; actorId: string }) {
  const client = useMemo(() => matchmakingClient(token), [token])
  const live = useRef(false), pending = useRef(false), profilePending = useRef(false), generation = useRef(0)
  const [snapshot, setSnapshot] = useState<QueueSnapshot | null>(null)
  const [profileReady, setProfileReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState('')
  const [profileError, setProfileError] = useState('')
  const [review, setReview] = useState(false)
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])
  const validate = useCallback((data: QueueSnapshot) => {
    const parsed = EventGroupQueueSchema.parse(data)
    if (parsed.proposal && (parsed.proposal.eventId !== listingId || !parsed.proposal.members.some(member => member.id === actorId))) throw new Error('Invalid proposal')
    return parsed
  }, [listingId, actorId])
  const refreshProfile = useCallback(async () => {
    if (profilePending.current) return
    profilePending.current = true
    setProfileReady(false)
    try {
      const data = await client.profile()
      if (live.current) { setProfileReady(data.profile !== null); setProfileError('') }
    } catch (failure) {
      if (live.current) { setProfileReady(false); setProfileError(matchingErrorText(failure)) }
    } finally { profilePending.current = false }
  }, [client])
  const refresh = useCallback(async () => {
    if (pending.current) return
    // Profile loading never locks status/leave. Its own request is bounded and
    // deduplicated; enrollment stays gated until that read succeeds.
    void refreshProfile()
    pending.current = true
    setReading(true)
    const version = ++generation.current
    try {
      const data = await client.groupQueue(listingId)
      if (live.current && version === generation.current) { setSnapshot(validate(data)); setError('') }
    } catch (failure) {
      if (live.current && version === generation.current) setError(matchingErrorText(failure))
    } finally { pending.current = false; if (live.current) setReading(false) }
  }, [client, listingId, validate, refreshProfile])
  useVisiblePolling(refresh)
  async function act(leave: boolean) {
    if (pending.current || !snapshot || (!leave && !profileReady)) return
    pending.current = true
    const version = ++generation.current
    setBusy(true); setReview(false); setError('')
    try {
      const data = await (leave ? client.groupLeave(listingId) : client.groupJoin(listingId))
      if (live.current && version === generation.current) setSnapshot(validate(data))
    } catch (failure) {
      if (live.current && version === generation.current) {
        setError(matchingErrorText(failure))
        try {
          const data = await client.groupQueue(listingId)
          if (live.current && version === generation.current) setSnapshot(validate(data))
        } catch { /* Preserve the last confirmed queue; never invent successful leave. */ }
      }
    } finally { pending.current = false; if (live.current && version === generation.current) setBusy(false) }
  }
  const queued = snapshot?.state === 'waiting' || snapshot?.state === 'proposal'
  return <>
    <p role="status" className="ev-queue-status">{!snapshot ? 'Queue status unavailable or loading.' : snapshot.state === 'idle' ? 'Not in this event queue.' : snapshot.state === 'waiting' ? 'You are in this event queue.' : 'A group proposal is available to review.'}</p>
    {(error || profileError) && <p role="alert">{error || profileError} Last confirmed queue state is shown.</p>}
    {!profileReady && <p>Load and save your <Link to="/matchmaking">matching profile</Link> before joining.</p>}
    <div className="ev-queue-actions">
      <Button disabled={busy || reading || !snapshot || (!queued && !profileReady)} onClick={() => void act(Boolean(queued))}>{queued ? 'Leave queue' : 'Find a group to go with'}</Button>
      <Button secondary disabled={busy || reading} onClick={() => void refresh()}>Refresh queue</Button>
    </div>
    {snapshot?.proposal && <><Button secondary onClick={() => setReview(value => !value)}>Review proposal</Button>{review && <div><h3>Suggested group · {snapshot.proposal.members.length} people</h3><ul>{snapshot.proposal.members.map(member => <li key={member.id}>{member.avatar && <img src={member.avatar} width={48} height={48} alt="" referrerPolicy="no-referrer" />}<strong>{member.name}</strong></li>)}</ul><p>A suggestion, not a confirmed group, invitation, RSVP or chat.</p></div>}</>}
    <p className="ev-small-note">Your queue is saved on the server. Background processing is not enabled by this page; joining does not mean a group has been found. No email or push delivery.</p>
  </>
}
export function EventGroupQueue({ listingId }: { listingId: string }) {
  const { session, ready } = useSession()
  const navigate = useNavigate()
  // Purpose and status lead; actions share one wrapping row; service limits stay quiet below.
  return <section aria-label="Event group queue" className="ev-group-queue"><h2>Go together</h2><p>Join this event’s separate group queue for a suggestion of 2–4 people.</p>
    {!ready ? <p role="status" className="ev-queue-status">Loading session…</p> : !session ? <div className="ev-queue-actions"><Button onClick={() => navigate(centralSignInPath(eventDetailPath(listingId)))}>Find a group to go with</Button></div> : <SignedInQueue key={`${listingId}:${session.user.id}:${session.access_token}`} listingId={listingId} token={session.access_token} actorId={session.user.id} />}
    <p className="ev-small-note">Old Company interest and compatibility opt-in do not enroll you.</p>
  </section>
}
