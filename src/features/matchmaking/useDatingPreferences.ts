import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { SaveDatingAggregateSchema, sameDatingProfile, sameDatingSearch, validDatingTransition, type DatingAggregate, type SaveDatingAggregate } from '../../../shared/dating'
import { datingAggregateClient, DatingClientError } from './dating-aggregate-client'

type Phase = 'loading' | 'ready' | 'saving' | 'unavailable' | 'conflict' | 'uncertain'
type State = { owner: string | null; snapshot: DatingAggregate | null; phase: Phase; error: string; reconcileRequired: boolean }
const empty = (owner: string | null): State => ({ owner, snapshot: null, phase: owner ? 'loading' : 'unavailable', error: owner ? '' : 'Sign in to load saved Dating preferences.', reconcileRequired: false })
export function useDatingPreferences(owner: string | null, token: string | null, accountBusy = false) {
  const client = useMemo(() => owner && token ? datingAggregateClient(token) : null, [owner, token])
  const binding = useRef({ client, accountBusy }); binding.current = { client, accountBusy }
  const [state, setState] = useState<State>(() => empty(owner)), authority = useRef<State>(empty(owner))
  const publish = useCallback((next: State) => { authority.current = next; setState(next) }, [])
  const generation = useRef(0), locked = useRef(false), active = useRef<typeof client>(null), mounted = useRef(false)
  const operation = useRef<AbortController | null>(null)
  // Fence unmounts at layout cleanup too, before passive effect cleanup.
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; operation.current?.abort() } }, [])
  const valid = useCallback((epoch: number) => mounted.current && generation.current === epoch && binding.current.client === client && active.current === client && authority.current.owner === owner, [client, owner])
  const read = useCallback(async (explicit: boolean) => {
    if (!mounted.current || !owner || !client || binding.current.client !== client || active.current !== client || authority.current.owner !== owner || locked.current || (!explicit && authority.current.reconcileRequired)) return null
    locked.current = true
    const epoch = generation.current, controller = new AbortController(); operation.current = controller
    publish({ ...authority.current, phase: 'loading', error: '' })
    try {
      const snapshot = await client.read(controller.signal)
      if (!valid(epoch)) return null
      publish({ owner, snapshot, phase: 'ready', error: '', reconcileRequired: explicit ? false : authority.current.reconcileRequired })
      return snapshot
    } catch {
      if (valid(epoch)) publish({ ...authority.current, phase: 'unavailable', error: 'Dating preferences are unavailable. Reload saved preferences before saving.' })
      return null
    } finally { if (valid(epoch)) { locked.current = false; operation.current = null } }
  }, [client, owner, valid, publish])
  const reload = useCallback(() => read(true), [read])
  useEffect(() => {
    const previous = authority.current, changed = previous.owner !== owner, next = changed ? empty(owner) : previous
    const interrupted = !changed && previous.phase === 'saving', epoch = ++generation.current
    active.current = client; locked.current = false
    if (!client) publish({ ...empty(owner), phase: 'unavailable', error: 'Sign in to load saved Dating preferences.', reconcileRequired: next.reconcileRequired || interrupted })
    else if (interrupted) publish({ ...next, phase: 'uncertain', reconcileRequired: true, error: 'Session changed during save. Reload the whole Dating aggregate before saving again.' })
    else if (next.reconcileRequired) publish({ ...next, phase: 'uncertain', error: next.error || 'Reload saved Dating preferences before saving again.' })
    else { if (changed) publish(next); void read(false) }
    return () => { generation.current = epoch + 1; active.current = null; operation.current?.abort() }
  }, [client, owner, read, publish])
  async function save(value: SaveDatingAggregate): Promise<DatingAggregate | null> {
    const before = authority.current
    if (!mounted.current || !owner || !client || binding.current.client !== client || binding.current.accountBusy || active.current !== client || before.owner !== owner || locked.current || before.phase !== 'ready' || before.reconcileRequired || !before.snapshot) return null
    if (before.snapshot.profile.enabled) {
      publish({ ...before, error: 'Saved enabled consent is read-only here. No consent change or save was sent.' }); return null
    }
    const parsed = SaveDatingAggregateSchema.safeParse(value)
    if (!parsed.success || parsed.data.profile.enabled) { publish({ ...before, error: 'Check your disabled Dating draft before saving.' }); return null }
    if (parsed.data.expectedProfileRevision !== before.snapshot.profileRevision || parsed.data.expectedSearchRevision !== before.snapshot.searchRevision) {
      publish({ ...before, phase: 'conflict', reconcileRequired: true, error: 'Dating preferences changed. Reload the whole aggregate to replace this draft before saving.' }); return null
    }
    if (!validDatingTransition(before.snapshot.profile, parsed.data.profile)) {
      publish({ ...before, error: 'Your saved identity changed. Clear matching clarification and save the disabled identity draft first; then reopen to confirm new targets.' }); return null
    }
    locked.current = true
    const epoch = generation.current, controller = new AbortController(); operation.current = controller
    publish({ ...before, phase: 'saving', error: '' })
    let accepted = false
    try {
      const saved = await client.save(parsed.data, controller.signal); accepted = true
      if (!valid(epoch)) return null
      const confirmed = await client.read(controller.signal)
      if (!valid(epoch)) return null
      if (confirmed.profileRevision !== saved.profileRevision || confirmed.searchRevision !== saved.searchRevision || !sameDatingProfile(confirmed.profile, saved.profile) || !sameDatingSearch(confirmed.search, saved.search)) throw new Error('Changed readback')
      publish({ owner, snapshot: confirmed, phase: 'ready', error: '', reconcileRequired: false })
      return confirmed
    } catch (failure) {
      if (valid(epoch)) {
        const code = failure instanceof DatingClientError ? failure.code : 'provider'
        const invalid = !accepted && code === 'invalid', conflict = !accepted && code === 'conflict'
        publish({ ...authority.current, phase: invalid ? 'ready' : conflict ? 'conflict' : 'uncertain', reconcileRequired: !invalid,
          error: invalid ? 'Dating draft was rejected. Check fields and identity clarification before saving.' : conflict ? 'Dating preferences changed. Reload the whole aggregate to replace this draft before saving.' : 'Dating save could not be confirmed. Changes may already be saved. Reload the whole aggregate before saving again.' })
      }
      return null
    } finally { if (valid(epoch)) { locked.current = false; operation.current = null } }
  }
  const current = state.owner === owner ? state : empty(owner)
  return { ...current, accountBusy, busy: current.phase === 'saving', loading: current.phase === 'loading', canWrite: !!client && mounted.current && active.current === client && !accountBusy && current.phase === 'ready' && !current.reconcileRequired && !!current.snapshot && !current.snapshot.profile.enabled, reload, save }
}
