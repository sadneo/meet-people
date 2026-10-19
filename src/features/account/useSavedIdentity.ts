import { useEffect, useMemo, useState } from 'react'
import type { AccountProfile } from '../../../shared/account-profile'
import { matchmakingClient } from '../matchmaking/client'
import { matchingErrorText } from '../matchmaking/useMatchmaking'

// Retry only the authenticated read. Never derive identity from Auth or demo data.
export function useSavedIdentity(token: string | null) {
  const client = useMemo(() => token ? matchmakingClient(token) : null, [token])
  const [revision, setRevision] = useState(0)
  const [snapshot, setSnapshot] = useState<{ token: string; revision: number; account: AccountProfile | null; error: string } | null>(null)
  useEffect(() => {
    let current = true
    if (client && token) void client.accountProfile().then(({ profile }) => { if (current) setSnapshot({ token, revision, account: profile, error: '' }) })
      .catch(failure => { if (current) setSnapshot({ token, revision, account: null, error: matchingErrorText(failure) }) })
    return () => { current = false }
  }, [client, token, revision])
  const current = snapshot?.token === token && snapshot.revision === revision ? snapshot : null
  return { account: current?.account ?? null, loading: !!token && !current, error: current?.error ?? '', retry: () => setRevision(value => value + 1) }
}
