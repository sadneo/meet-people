import { useEffect, useMemo, useRef, useState } from 'react'
import type { MatchingMode, MatchingProfile, MatchResult } from '../../../shared/matchmaking'
import { matchmakingClient, MatchmakingClientError } from './client'
import { withAccountIdentity } from '../../../shared/account-profile'
import { MatchingProfileSchema } from '../../../shared/matchmaking'

export const matchingErrorText = (error: unknown) => error instanceof MatchmakingClientError ? error.message : 'Matching service is unavailable. Please try again.'

// Mounted with a session-token key: identity changes never reuse another user's state.
export function useMatchmaking(token: string) {
  const client = useMemo(() => matchmakingClient(token), [token])
  const live = useRef(false)
  const statusVersion = useRef(0)
  const resultVersion = useRef(0)
  const profileVersion = useRef(0)
  const savePending = useRef(false)
  const searchPending = useRef(false)
  const lifecycle = useRef(0)
  const pendingDraft = useRef<MatchingProfile | undefined>(undefined)
  const [confirmReplacement, setConfirmReplacement] = useState(false)
  const [searchStage, setSearchStage] = useState<'saving' | 'searching' | null>(null)
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
    const epoch = ++lifecycle.current
    live.current = true
    const statusId = ++statusVersion.current, profileId = ++profileVersion.current
    void client.status().then(data => {
      if (live.current && statusId === statusVersion.current) { setMode(data.mode); setKnown(true) }
    }).catch(error => { if (live.current && statusId === statusVersion.current) setError(matchingErrorText(error)) })
      .finally(() => { if (live.current && statusId === statusVersion.current) setBusy(false) })
    void client.profile().then(data => { if (live.current && profileId === profileVersion.current) { setProfile(data.profile); setProfileReady(true) } })
      .catch(error => { if (live.current && profileId === profileVersion.current) setProfileError(matchingErrorText(error)) })
      .finally(() => { if (live.current && profileId === profileVersion.current) setProfileLoading(false) })
    return () => { live.current = false; lifecycle.current = epoch + 1 }
  }, [client])

  async function queue(action: 'refresh' | 'join' | 'leave', selected?: MatchingMode) {
    if (searchPending.current) return
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
    if (savePending.current || searchPending.current) return
    const version = ++resultVersion.current
    setChecking(true); setError(''); setResult(null)
    try {
      const data = await client.result()
      if (live.current && version === resultVersion.current) setResult(data)
    } catch (error) { if (live.current && version === resultVersion.current) setError(matchingErrorText(error)) }
    finally { if (live.current && version === resultVersion.current) setChecking(false) }
  }
  async function save(next: MatchingProfile) {
    if (savePending.current || searchPending.current) return false
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
    if (searchPending.current || savePending.current) return
    const version = ++profileVersion.current
    setProfileReady(false); setProfileLoading(true); setProfileError('')
    try {
      const data = await client.profile()
      if (live.current && version === profileVersion.current) { setProfile(data.profile); setProfileReady(true) }
    } catch (error) { if (live.current && version === profileVersion.current) setProfileError(matchingErrorText(error)) }
    finally { if (live.current && version === profileVersion.current) setProfileLoading(false) }
  }
  async function findFriends(next?: MatchingProfile, consented = false) {
    if (!live.current || searchPending.current || savePending.current || busy || profileLoading || !profileReady || (!next && !canJoin)) return false
    searchPending.current = true
    const epoch = lifecycle.current
    const current = () => live.current && epoch === lifecycle.current
    let joinAttempted = false
    setConfirmReplacement(false); setError(''); setProfileError(''); setSearchStage(next ? 'saving' : 'searching')
    ++resultVersion.current; setResult(null); setChecking(false)
    try {
      const status = await client.status()
      if (!current()) return false
      setMode(status.mode); setKnown(true)
      if (status.mode === 'downtime' && !consented) {
        pendingDraft.current = next
        setConfirmReplacement(true)
        return false
      }
      const { profile: identity } = await client.accountProfile()
      if (!current()) return false
      if (!identity) throw new MatchmakingClientError('unavailable', 503, 'A saved server identity is required before finding friends. Open Profile to check your identity.')
      let confirmed = profile
      if (next) {
        setSaving(true)
        ++profileVersion.current
        const response = await client.save(MatchingProfileSchema.parse(withAccountIdentity(next, identity)))
        if (!current()) return false
        confirmed = response.profile
        setProfile(confirmed); setProfileReady(true); setSaving(false)
      }
      if (!confirmed) return false
      // Use the validated persisted response above, not canJoin from the old render.
      setSearchStage('searching')
      const latest = await client.status()
      if (!current()) return false
      setMode(latest.mode); setKnown(true)
      if (latest.mode === 'downtime' && !consented) {
        pendingDraft.current = undefined // Any setup save above is already confirmed.
        setConfirmReplacement(true)
        return false
      }
      if (latest.mode === 'active') return true
      joinAttempted = true
      ++statusVersion.current
      const joined = await client.join('active')
      if (!current()) return false
      setMode(joined.mode); setKnown(true)
      if (joined.mode !== 'active') throw new Error('Active queue was not confirmed')
      pendingDraft.current = undefined
      return true
    } catch (failure) {
      if (!current()) return false
      setError(matchingErrorText(failure))
      if (joinAttempted) {
        try { const status = await client.status(); if (current()) { setMode(status.mode); setKnown(true) } } catch { /* Retain last confirmed status. */ }
      }
      return false
    } finally {
      if (current()) { searchPending.current = false; setSearchStage(null); setSaving(false) }
    }
  }
  const cancelReplacement = () => { pendingDraft.current = undefined; setConfirmReplacement(false) }
  return { mode, known, busy, error, result, checking, profile, profileReady, profileLoading, profileError, saving, canJoin, queue, check, save, reloadProfile, findFriends, searchStage, confirmReplacement, cancelReplacement, confirmSearch: () => findFriends(pendingDraft.current, true) }
}
