import { useEffect, useMemo, useRef, useState } from 'react'
import { AccountProfileSchema, withAccountIdentity, type AccountProfile } from '../../../shared/account-profile'
import type { MatchingProfile } from '../../../shared/matchmaking'
import { matchmakingClient, MatchmakingClientError } from '../matchmaking/client'
import { ReadyPreferencesSchema, readinessMessage } from '../../../shared/profile-readiness'

type IdentityDraft = Pick<AccountProfile, 'display_name' | 'bio'> & { username?: string }
type Snapshot = { actor: string | null; profile: MatchingProfile | null; profileKnown: boolean; account: AccountProfile | null; loading: boolean; busy: boolean; available: boolean; error: string }
const empty = (actor: string | null): Snapshot => ({ actor, profile: null, profileKnown: false, account: null, loading: !!actor, busy: false, available: false, error: '' })
const message = (failure: unknown) => failure instanceof MatchmakingClientError ? failure.message : 'Profile service unavailable. Reload before editing.'

// No device cache or prototype-state copy. Each route entry reads authenticated
// server data; writes are followed by GET readback before reporting completion.
export function useSharedUserProfile(token: string | null) {
  const client = useMemo(() => token ? matchmakingClient(token) : null, [token])
  const [snapshot, setSnapshot] = useState<Snapshot>(() => empty(token))
  const [revision, setRevision] = useState(0)
  const generation = useRef(0)
  const locked = useRef(false)
  const activeClient = useRef<ReturnType<typeof matchmakingClient> | null>(null)
  const writable = useRef(false)
  useEffect(() => {
    const version = ++generation.current
    activeClient.current = client
    writable.current = false
    locked.current = false
    if (client) void Promise.allSettled([client.profile(), client.accountProfile()]).then(([preferences, identity]) => {
      if (version !== generation.current) return
      const profile = preferences.status === 'fulfilled' ? preferences.value.profile : null
      const account = identity.status === 'fulfilled' ? identity.value.profile : null
      const error = preferences.status === 'rejected' ? message(preferences.reason) : identity.status === 'rejected' ? message(identity.reason) : ''
      writable.current = preferences.status === 'fulfilled' && identity.status === 'fulfilled'
      setSnapshot(previous => ({ actor: token, profile: preferences.status === 'fulfilled' ? profile : previous.actor === token ? previous.profile : null, profileKnown: preferences.status === 'fulfilled' || (previous.actor === token && previous.profileKnown), account: identity.status === 'fulfilled' ? account : previous.actor === token ? previous.account : null, loading: false, busy: false, available: preferences.status === 'fulfilled' && identity.status === 'fulfilled', error }))
    })
    return () => { generation.current = version + 1; activeClient.current = null; writable.current = false }
  }, [client, token, revision])
  const current = snapshot.actor === token ? snapshot : empty(token)
  const canSaveIdentity = !!client && !current.loading && !current.busy && current.available
  const canWrite = canSaveIdentity && !!current.account

  async function write(kind: 'shared' | 'identity', draft: MatchingProfile | IdentityDraft) {
    if (!client || activeClient.current !== client || !writable.current || !(kind === 'identity' ? canSaveIdentity : canWrite) || locked.current) return false
    locked.current = true
    const version = generation.current
    let accepted = false
    let attempted = false
    let verified = false
    setSnapshot(value => ({ ...value, busy: true, error: '' }))
    try {
      const { profile: identity } = await client.accountProfile()
      if (version !== generation.current) return false
      verified = true
      if (kind === 'shared') {
        if (!identity) { verified = false; throw new MatchmakingClientError('unavailable', 503, 'Your saved identity is no longer available. Reload Profile before saving preferences.') }
        const parsed = ReadyPreferencesSchema.safeParse(withAccountIdentity(draft as MatchingProfile, identity))
        if (!parsed.success) throw new MatchmakingClientError('invalid', 400, readinessMessage)
        attempted = true
        await client.save(parsed.data)
        accepted = true
        if (version !== generation.current) return false
        const { profile } = await client.profile()
        if (!profile || !ReadyPreferencesSchema.safeParse(profile).success) throw new Error('Complete preferences readback unavailable')
        if (version !== generation.current) return false
        setSnapshot(value => ({ ...value, profile, account: identity, busy: false, error: '' }))
      } else {
        const fields = draft as IdentityDraft
        if (!current.account && identity) { verified = false; throw new MatchmakingClientError('unavailable', 409, 'An account identity now exists. Reload before editing; no identity was overwritten.') }
        if (current.account && !identity) { verified = false; throw new MatchmakingClientError('unavailable', 409, 'Your saved identity is no longer available. Reload before editing.') }
        const parsed = AccountProfileSchema.parse({ ...(identity ?? { username: fields.username, avatar_url: null }), display_name: fields.display_name, bio: fields.bio })
        attempted = true
        await client.saveAccountProfile(parsed)
        accepted = true
        if (version !== generation.current) return false
        const { profile: account } = await client.accountProfile()
        if (!account) throw new Error('Readback unavailable')
        if (version !== generation.current) return false
        setSnapshot(value => ({ ...value, account, busy: false, error: '' }))
      }
      return true
    } catch (failure) {
      if (version === generation.current) {
        writable.current = verified && !attempted
        setSnapshot(value => ({ ...value, busy: false, available: verified && !attempted && value.available, error: accepted ? 'Profile update accepted, but authoritative readback is unavailable. Reload before editing.' : message(failure) }))
      }
      return false
    } finally { if (version === generation.current) locked.current = false }
  }
  function reload() {
    if (!client || activeClient.current !== client || current.busy || locked.current) return
    locked.current = true
    writable.current = false
    setSnapshot(previous => ({ ...(previous.actor === token ? previous : empty(token)), loading: !!token, error: '' }))
    setRevision(value => value + 1)
  }
  return { ...current, canWrite, canSaveIdentity, reload, saveShared: (draft: MatchingProfile) => write('shared', draft), saveIdentity: (draft: IdentityDraft) => write('identity', draft) }
}
