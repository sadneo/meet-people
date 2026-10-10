import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useSession } from '../../auth/useSession'
import { type EventCompatibilityCandidate, type ListingMatchmakingStatus } from '../../../shared/matchmaking'
import { matchmakingClient } from '../matchmaking/client'
import { matchingErrorText } from '../matchmaking/useMatchmaking'
import { Button } from './ui'

function AuthenticatedCompatibility({ listingId, token }: { listingId: string; token: string }) {
  const client = useMemo(() => matchmakingClient(token), [token])
  const live = useRef(false)
  const generation = useRef(0)
  const resultVersion = useRef(0)
  const mutating = useRef(false)
  const [status, setStatus] = useState<ListingMatchmakingStatus | null>(null)
  const [savedProfile, setSavedProfile] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const [candidates, setCandidates] = useState<EventCompatibilityCandidate[] | null>(null)

  const refresh = useCallback(async () => {
    if (mutating.current) return
    const version = ++generation.current
    ++resultVersion.current
    setLoading(true); setSavedProfile(false); setCandidates(null); setChecking(false); setError('')
    const [current, profile] = await Promise.allSettled([client.eventStatus(listingId), client.profile()])
    if (!live.current || version !== generation.current) return
    setStatus(current.status === 'fulfilled' ? current.value : null)
    setSavedProfile(profile.status === 'fulfilled' && profile.value.profile !== null)
    setError(current.status === 'rejected' ? matchingErrorText(current.reason) : profile.status === 'rejected' ? matchingErrorText(profile.reason) : '')
    setLoading(false)
  }, [client, listingId])
  useEffect(() => {
    live.current = true
    void refresh()
    return () => { live.current = false }
    // Identity/listing changes remount this component; no timers or automatic scoring.
  }, [refresh])

  async function interest(withdraw: boolean) {
    if (mutating.current || !status || (!withdraw && (!savedProfile || !status.available || loading))) return
    mutating.current = true
    const version = ++generation.current
    ++resultVersion.current
    setBusy(true); setCandidates(null); setChecking(false); setError('')
    try {
      const next = await (withdraw ? client.eventWithdraw(listingId) : client.eventInterest(listingId))
      if (live.current && version === generation.current) setStatus(next)
    } catch (failure) {
      if (live.current && version === generation.current) setError(matchingErrorText(failure))
      // A failed write may have reached SQL; only a fresh read can confirm consent.
      try {
        const next = await client.eventStatus(listingId)
        if (live.current && version === generation.current) setStatus(next)
      } catch { /* Keep the last confirmed status and visible failure. */ }
    } finally {
      mutating.current = false
      if (live.current && version === generation.current) setBusy(false)
    }
  }
  async function check() {
    if (mutating.current || loading || !savedProfile || !status?.isInterested || !status.available) return
    const version = ++resultVersion.current
    setChecking(true); setCandidates(null); setError('')
    try {
      const result = await client.eventMatches(listingId)
      if (live.current && version === resultVersion.current) setCandidates(result.candidates)
    } catch (failure) { if (live.current && version === resultVersion.current) setError(matchingErrorText(failure)) }
    finally { if (live.current && version === resultVersion.current) setChecking(false) }
  }
  return <>
    <p role="status">{loading ? 'Loading compatibility status…' : !status ? 'Compatibility status unavailable.' : status.isInterested ? 'You opted in to compatibility for this event.' : 'You have not opted in to compatibility for this event.'}</p>
    {status && !status.available && <p>Compatibility is unavailable for this event. You can still withdraw your matching opt-in.</p>}
    {!savedProfile && !loading && <p>Load and save your <Link to="/matchmaking">matching profile</Link> before opting in or checking compatibility.</p>}
    {error && <p role="alert">{error}</p>}
    <Button secondary disabled={loading || busy || !status || (!status.isInterested && (!savedProfile || !status.available))} onClick={() => void interest(Boolean(status?.isInterested))}>{status?.isInterested ? 'Withdraw compatibility opt-in' : 'Opt in to event compatibility'}</Button>
    <Button secondary disabled={loading || busy} onClick={() => void refresh()}>Refresh compatibility status</Button>
    <Button secondary disabled={loading || busy || checking || !savedProfile || !status?.isInterested || !status.available} onClick={() => void check()}>{checking ? 'Checking compatibility…' : 'Check event compatibility'}</Button>
    {candidates && !candidates.length && <p>No compatible people returned yet.</p>}
    {candidates && candidates.length > 0 && <ol>{candidates.map(person => <li key={person.id}>{person.avatar && <img src={person.avatar} alt="" width={48} height={48} referrerPolicy="no-referrer" />}<strong>{person.name}</strong><p>Shared interests: {person.interests.join(', ') || 'No shared labels returned.'}</p></li>)}</ol>}
  </>
}

export function EventCompatibility({ listingId }: { listingId: string }) {
  const { session, ready } = useSession()
  return <section className="ev-event-compatibility" aria-label="Event compatibility"><h2>Event compatibility</h2>
    <p>Separate matching consent: Company interest and event groups do not opt you in here. Compatibility suggestions do not join a group, send invitations or create chats.</p>
    <p>Check manually after opting in. No background scoring or notifications.</p>
    {!ready ? <p role="status">Checking compatibility sign-in…</p> : !session ? <p><Link to="/login">Sign in</Link> to opt in to event compatibility.</p> : <AuthenticatedCompatibility key={`${listingId}:${session.access_token}`} listingId={listingId} token={session.access_token} />}
  </section>
}
