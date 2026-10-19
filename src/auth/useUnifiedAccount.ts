import { useEffect, useMemo, useRef, useState } from 'react'
import { AccountSchema, SaveAccountSchema, type Account } from '../../shared/account'
import { matchmakingClient, MatchmakingClientError } from '../features/matchmaking/client'

type State = { token: string | null; account: Account | null; loading: boolean; busy: boolean; available: boolean; error: string }
const empty = (token: string | null): State => ({ token, account: null, loading: !!token, busy: false, available: false, error: '' })
// SQL returns sets of interest labels and ordered window tuples, not UI insertion
// order. Do not deduplicate here: schema validation must still reject duplicates.
const normalizeField = (key: string, value: unknown): unknown => {
  if (key === 'interests' && Array.isArray(value)) return [...value].sort()
  if (key === 'availability' && Array.isArray(value)) return [...value].sort((a, b) => a.dow - b.dow || a.start_time.localeCompare(b.start_time) || a.end_time.localeCompare(b.end_time))
  return value
}
const stable = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)
const sameField = (key: string, a: unknown, b: unknown) => stable(normalizeField(key, a)) === stable(normalizeField(key, b))
const sameFields = (a: object, b: object) => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => sameField(key, a[key as keyof typeof a], b[key as keyof typeof b]))
export function useUnifiedAccount(token: string | null) {
  const client = useMemo(() => token ? matchmakingClient(token) : null, [token])
  const [state, setState] = useState(() => empty(token))
  const [revision, setRevision] = useState(0)
  const fence = useRef(0), pending = useRef(false), active = useRef<typeof client>(null)
  useEffect(() => {
    const epoch = ++fence.current
    active.current = client; pending.current = false
    if (client) void client.account().then(account => {
      if (epoch === fence.current) setState({ token, account, loading: false, busy: false, available: true, error: '' })
    }).catch(() => {
      if (epoch === fence.current) setState(previous => ({ ...previous, token, loading: false, busy: false, available: false, error: 'Your saved account could not be read. Retry before continuing.' }))
    })
    return () => { fence.current = epoch + 1; active.current = null }
  }, [client, token, revision])
  const current = state.token === token ? state : empty(token)
  async function save(next: Account) {
    if (!client || client !== active.current || pending.current || !current.available || current.loading) return false
    const parsed = SaveAccountSchema.safeParse(next)
    if (!parsed.success) { setState(value => ({ ...value, error: 'Check the required fields for this chapter.' })); return false }
    pending.current = true
    const epoch = fence.current
    let attempted = false
    setState(value => ({ ...value, busy: true, error: '' }))
    try {
      const fresh = await client.account()
      if (epoch !== fence.current) return false
      if (fresh.profile?.username !== current.account?.profile?.username) throw new Error('Another tab changed your identity. Retry account before editing; nothing was overwritten.')
      // Full-document saves carry only the caller's explicit changes over the
      // latest read. A settings edit must not restore stale matching preferences.
      const merge = <T extends object>(before: T, chosen: T, latest: T): T => Object.fromEntries(Object.keys(chosen).map(key => {
        const dirty = !sameField(key, chosen[key as keyof T], before[key as keyof T])
        if (dirty && !sameField(key, latest[key as keyof T], before[key as keyof T])) throw new Error('Another tab changed a field in your draft. Retry account before editing; nothing was overwritten.')
        return [key, dirty ? chosen[key as keyof T] : latest[key as keyof T]]
      })) as T
      const payload = SaveAccountSchema.parse({
        ...parsed.data,
        profile: current.account?.profile && parsed.data.profile && fresh.profile ? merge(current.account.profile, parsed.data.profile, fresh.profile) : parsed.data.profile,
        preferences: current.account ? merge(current.account.preferences, parsed.data.preferences, fresh.preferences) : parsed.data.preferences,
        settings: current.account ? merge(current.account.settings, parsed.data.settings, fresh.settings) : parsed.data.settings,
        completed: Array.from({ length: Math.max(parsed.data.completed.length, fresh.completed.length) }, (_, i) => i),
      })
      attempted = true
      await client.saveAccount(payload)
      if (epoch !== fence.current) return false
      const confirmed = AccountSchema.parse(await client.account())
      if (epoch !== fence.current) return false
      if (confirmed.completed.length < payload.completed.length || !confirmed.profile || !payload.profile || !sameFields(confirmed.profile, payload.profile) || !sameFields(confirmed.preferences, payload.preferences) || !sameFields(confirmed.settings, payload.settings)) throw new Error('Account completion readback missing')
      setState({ token, account: confirmed, loading: false, busy: false, available: true, error: '' })
      return true
    } catch (failure) {
      if (epoch === fence.current) setState(value => ({ ...value, busy: false, available: false, error: attempted ? 'Account save could not be confirmed. Your draft is kept. Retry account to reconcile before saving again.' : failure instanceof MatchmakingClientError ? failure.message : failure instanceof Error ? failure.message : 'Account unavailable.' }))
      return false
    } finally { if (epoch === fence.current) pending.current = false }
  }
  function reload() {
    if (pending.current || active.current !== client) return
    pending.current = true
    setState(value => ({ ...value, loading: true, available: false, error: '' }))
    setRevision(value => value + 1)
  }
  return { ...current, save, reload }
}
