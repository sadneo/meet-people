import { useEffect, useMemo, useRef, useState } from 'react'
import type { MatchingMode, MatchingProfile, MatchResult } from '../../../shared/matchmaking'
import { matchmakingClient, MatchmakingClientError } from './client'

export const matchingErrorText = (error: unknown) => error instanceof MatchmakingClientError ? error.message : 'Matching service is unavailable. Please try again.'

// Mounted with a session-token key: identity changes never reuse another user's state.
export function useMatchmaking(token: string) {
  const client = useMemo(() => matchmakingClient(token), [token])
  const live = useRef(false)
  const statusVersion = useRef(0)
  const resultVersion = useRef(0)
  const profileVersion = useRef(0)
  const savePending = useRef(false)
  const [mode, setMode] = useState<MatchingMode | null>(null)
  const [known, setKnown] = useState(false)
  const [busy, setBusy] = useState(true)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<MatchResult | null>(null)
  const [profile, setProfile] = useState<MatchingProfile | null>(null)
  const [profileReady, setProfileReady] = useState(false)
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileError, setProfileError] = useState('')
  const [saving, setSaving] = useState(false)
  const canJoin = profileReady && !profileLoading && profile !== null && !saving
  useEffect(() => {
    live.current = true
    const statusId = ++statusVersion.current, profileId = ++profileVersion.current
    void client.status().then(data => {
      if (live.current && statusId === statusVersion.current) { setMode(data.mode); setKnown(true) }
    }).catch(error => { if (live.current && statusId === statusVersion.current) setError(matchingErrorText(error)) })
      .finally(() => { if (live.current && statusId === statusVersion.current) setBusy(false) })
    void client.profile().then(data => { if (live.current && profileId === profileVersion.current) { setProfile(data.profile); setProfileReady(true) } })
      .catch(error => { if (live.current && profileId === profileVersion.current) setProfileError(matchingErrorText(error)) })
      .finally(() => { if (live.current && profileId === profileVersion.current) setProfileLoading(false) })
    return () => { live.current = false }
  }, [client])

  async function queue(action: 'refresh' | 'join' | 'leave', selected?: MatchingMode) {
    if (action === 'join' && (!canJoin || savePending.current)) {
      setError('Load and save a matching profile before joining a queue.')
      return
    }
    const version = ++statusVersion.current
    ++resultVersion.current
    setBusy(true); setChecking(false); setError(''); setResult(null)
    try {
      const data = action === 'refresh' ? await client.status() : action === 'leave' ? await client.leave() : await client.join(selected!)
      if (live.current && version === statusVersion.current) { setMode(data.mode); setKnown(true) }
    } catch (error) {
      if (live.current && version === statusVersion.current) setError(matchingErrorText(error))
      // A failed mutation may already have reached SQL. Reconcile without inventing a cancellation.
      if (action !== 'refresh') {
        try {
          const data = await client.status()
          if (live.current && version === statusVersion.current) { setMode(data.mode); setKnown(true) }
        } catch { /* Retain last confirmed state and the visible error. */ }
      }
    } finally { if (live.current && version === statusVersion.current) setBusy(false) }
  }
  async function check() {
    if (savePending.current) return
    const version = ++resultVersion.current
    setChecking(true); setError(''); setResult(null)
    try {
      const data = await client.result()
      if (live.current && version === resultVersion.current) setResult(data)
    } catch (error) { if (live.current && version === resultVersion.current) setError(matchingErrorText(error)) }
    finally { if (live.current && version === resultVersion.current) setChecking(false) }
  }
  async function save(next: MatchingProfile) {
    if (savePending.current) return false
    savePending.current = true
    const version = ++profileVersion.current
    ++resultVersion.current
    setResult(null); setChecking(false)
    setSaving(true); setProfileError('')
    try {
      const data = await client.save(next)
      if (live.current && version === profileVersion.current) { setProfile(data.profile); setProfileReady(true); return true }
    } catch (error) { if (live.current && version === profileVersion.current) setProfileError(matchingErrorText(error)) }
    finally {
      savePending.current = false
      if (live.current && version === profileVersion.current) setSaving(false)
    }
    return false
  }
  async function reloadProfile() {
    const version = ++profileVersion.current
    setProfileReady(false); setProfileLoading(true); setProfileError('')
    try {
      const data = await client.profile()
      if (live.current && version === profileVersion.current) { setProfile(data.profile); setProfileReady(true) }
    } catch (error) { if (live.current && version === profileVersion.current) setProfileError(matchingErrorText(error)) }
    finally { if (live.current && version === profileVersion.current) setProfileLoading(false) }
  }
  return { mode, known, busy, error, result, checking, profile, profileReady, profileLoading, profileError, saving, canJoin, queue, check, save, reloadProfile }
}
