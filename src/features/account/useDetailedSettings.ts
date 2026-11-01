import { useCallback, useEffect, useInsertionEffect, useMemo, useRef, useState } from 'react'
import { SaveDetailedSettingsSchema, sameDetailedSettings, type DetailedSettings, type SaveDetailedSettings } from '../../../shared/detailed-settings'
import { detailedSettingsClient, DetailedSettingsClientError } from './detailed-settings-client'

type Phase = 'loading' | 'ready' | 'saving' | 'unavailable' | 'error' | 'conflict' | 'uncertain'
type State = { owner: string | null; snapshot: DetailedSettings | null; phase: Phase; error: string; reconcileRequired: boolean }
const empty = (owner: string | null): State => ({ owner, snapshot: null, phase: owner ? 'loading' : 'unavailable', error: owner ? '' : 'Sign in to load detailed preferences.', reconcileRequired: false })

// Domain-specific resource, deliberately following the repaired facts pattern.
// No preview/device cache, master writes, notifications, safety or queue mutation.
export function useDetailedSettings(owner: string | null, token: string | null, accountBusy = false) {
  const client = useMemo(() => owner && token ? detailedSettingsClient(token) : null, [owner, token])
  // Commit the callback fence before descendant layout effects can invoke a
  // retained save/reload, without mutating refs during an abandoned render.
  const binding = useRef({ client, accountBusy })
  useInsertionEffect(() => {
    binding.current = { client, accountBusy }
    return () => { binding.current = { client: null, accountBusy: true } }
  }, [client, accountBusy])
  const [state, setState] = useState(() => ({ value: empty(owner), client }))
  const authority = useRef<State>(empty(owner))
  const publish = useCallback((next: State) => { authority.current = next; setState({ value: next, client }) }, [client])
  const generation = useRef(0), locked = useRef(false)
  const operation = useRef<AbortController | null>(null), active = useRef<typeof client>(null)
  const current = state.value.owner === owner ? state.value : empty(owner)
  const valid = useCallback((epoch: number) => generation.current === epoch && binding.current.client === client && active.current === client && authority.current.owner === owner, [client, owner])
  const read = useCallback(async (explicit: boolean) => {
    if (!client || !owner || binding.current.client !== client || active.current !== client || authority.current.owner !== owner || locked.current || (!explicit && authority.current.reconcileRequired)) return null
    locked.current = true
    const epoch = generation.current, controller = new AbortController(); operation.current = controller
    publish({ ...authority.current, phase: 'loading', error: '' })
    try {
      const snapshot = await client.read(controller.signal)
      if (!valid(epoch)) return null
      publish({ owner, snapshot, phase: 'ready', error: '', reconcileRequired: explicit ? false : authority.current.reconcileRequired })
      return snapshot
    } catch {
      if (valid(epoch)) publish({ ...authority.current, phase: 'unavailable', error: 'Detailed preferences are unavailable. Last confirmed values, if any, are kept. Reload saved preferences before saving.' })
      return null
    } finally { if (valid(epoch)) { locked.current = false; operation.current = null } }
  }, [client, owner, valid, publish])
  const reload = useCallback(() => read(true), [read])
  const refresh = useCallback(() => read(false), [read])
  useEffect(() => {
    const previous = authority.current, ownerChanged = previous.owner !== owner
    const next = ownerChanged ? empty(owner) : previous
    const interruptedWrite = !ownerChanged && previous.phase === 'saving'
    const epoch = ++generation.current
    active.current = client; locked.current = false
    if (!client) publish({ ...empty(owner), phase: 'unavailable', error: 'Sign in to load detailed preferences.', reconcileRequired: next.reconcileRequired || interruptedWrite })
    else if (interruptedWrite) publish({ ...next, phase: 'uncertain', reconcileRequired: true, error: 'Session changed while saving. Reload saved preferences to reconcile before saving again.' })
    else if (next.reconcileRequired) publish({ ...next, phase: next.phase === 'loading' || next.phase === 'ready' ? 'uncertain' : next.phase, error: next.error || 'Reload saved preferences to reconcile before saving again.' })
    else { if (ownerChanged) publish(next); void read(false) }
    return () => { generation.current = epoch + 1; active.current = null; operation.current?.abort() }
  }, [client, owner, read, publish])

  async function save(draft: SaveDetailedSettings): Promise<DetailedSettings | null> {
    const before = authority.current
    if (!client || !owner || binding.current.client !== client || binding.current.accountBusy || active.current !== client || before.owner !== owner || locked.current || before.reconcileRequired || before.phase !== 'ready' || !before.snapshot) return null
    const parsed = SaveDetailedSettingsSchema.safeParse(draft)
    if (!parsed.success) { publish({ ...before, error: 'Check your detailed preferences before saving.' }); return null }
    if (parsed.data.expectedRevision !== before.snapshot.revision) {
      publish({ ...before, phase: 'conflict', reconcileRequired: true, error: 'Saved preferences changed. Reload saved preferences to replace this draft before saving.' }); return null
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
      // Masters may change independently. Both snapshots validate their masks;
      // only our choice values/revision must agree across PUT and canonical GET.
      if (confirmed.revision !== saved.revision || !sameDetailedSettings(confirmed.settings, saved.settings)) throw new Error('Readback changed')
      publish({ ...authority.current, owner, snapshot: confirmed, phase: 'ready', error: '' })
      return confirmed
    } catch (failure) {
      if (valid(epoch)) {
        const code = failure instanceof DetailedSettingsClientError ? failure.code : 'provider'
        const phase: Phase = accepted ? 'uncertain' : code === 'conflict' ? 'conflict' : code === 'invalid' ? 'ready' : code === 'unavailable' ? 'unavailable' : code === 'auth' ? 'error' : 'uncertain'
        const error = phase === 'conflict' ? 'Saved preferences changed. Reload saved preferences to replace this draft before saving.'
          : phase === 'uncertain' ? 'Detailed preferences save could not be confirmed. Reload saved preferences to reconcile before saving again.'
          : phase === 'ready' && failure instanceof Error ? failure.message : 'Detailed preferences are unavailable. Reload saved preferences before saving.'
        publish({ ...authority.current, phase, error, reconcileRequired: authority.current.reconcileRequired || phase !== 'ready' })
      }
      return null
    } finally { if (valid(epoch)) { locked.current = false; operation.current = null } }
  }
  return { ...current, busy: current.phase === 'saving', loading: current.phase === 'loading', canWrite: !!client && state.client === client && !accountBusy && !current.reconcileRequired && current.phase === 'ready' && !!current.snapshot, reload, refresh, save }
}
