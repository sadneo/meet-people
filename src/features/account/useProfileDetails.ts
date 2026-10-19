import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SaveProfileDetailsSchema, type ProfileDetails, type SaveProfileDetails } from '../../../shared/profile-details'
import { profileDetailsClient, ProfileDetailsClientError, sameProfileFacts } from './profile-details-client'

type Phase = 'loading' | 'ready' | 'saving' | 'unavailable' | 'error' | 'conflict' | 'uncertain'
type State = { owner: string | null; details: ProfileDetails | null; phase: Phase; error: string; reconcileRequired: boolean }
const empty = (owner: string | null): State => ({ owner, details: null, phase: owner ? 'loading' : 'unavailable', error: owner ? '' : 'Sign in to load optional profile details.', reconcileRequired: false })

export function useProfileDetails(owner: string | null, token: string | null) {
  const client = useMemo(() => owner && token ? profileDetailsClient(token) : null, [owner, token])
  const [state, setState] = useState<State>(() => empty(owner))
  // Mutation entry never trusts a render-captured snapshot. Publish capability
  // changes synchronously, including before PUT and before releasing any lock.
  const authority = useRef<State>(empty(owner))
  const publish = useCallback((next: State) => { authority.current = next; setState(next) }, [])
  const generation = useRef(0), locked = useRef(false)
  const operation = useRef<AbortController | null>(null)
  const active = useRef<typeof client>(null)
  const current = state.owner === owner ? state : empty(owner)
  const valid = useCallback((epoch: number) => generation.current === epoch && active.current === client && authority.current.owner === owner, [client, owner])
  const read = useCallback(async (explicit: boolean) => {
    if (!client || !owner || active.current !== client || authority.current.owner !== owner || locked.current || (!explicit && authority.current.reconcileRequired)) return null
    locked.current = true
    const epoch = generation.current, controller = new AbortController(); operation.current = controller
    publish({ ...authority.current, phase: 'loading', error: '' })
    try {
      const details = await client.read(controller.signal)
      if (!valid(epoch)) return null
      // An automatic/session read must never clear an established requirement.
      publish({ owner, details, phase: 'ready', error: '', reconcileRequired: explicit ? false : authority.current.reconcileRequired })
      return details
    } catch {
      if (valid(epoch)) publish({ ...authority.current, phase: 'unavailable', error: 'Optional profile details are unavailable. Your last confirmed details, if any, are kept. Reload saved details before editing.' })
      return null
    } finally { if (valid(epoch)) { locked.current = false; operation.current = null } }
  }, [client, owner, valid, publish])
  const reload = useCallback(() => read(true), [read])
  useEffect(() => {
    const previous = authority.current
    const ownerChanged = previous.owner !== owner
    const next = ownerChanged ? empty(owner) : previous
    const interruptedWrite = !ownerChanged && previous.phase === 'saving'
    const epoch = ++generation.current
    active.current = client; locked.current = false
    if (!client) publish({ ...empty(owner), phase: 'unavailable', error: 'Sign in to load optional profile details.', reconcileRequired: next.reconcileRequired || interruptedWrite })
    else if (interruptedWrite) publish({ ...next, phase: 'uncertain', reconcileRequired: true, error: 'Session changed while saving. The outcome is uncertain. Reload saved details before editing.' })
    else if (next.reconcileRequired) publish({ ...next,
      phase: next.phase === 'loading' || next.phase === 'ready' ? 'uncertain' : next.phase,
      error: next.error || 'Reload saved details to reconcile before saving again.',
    })
    else {
      if (ownerChanged) publish(next)
      void read(false)
    }
    return () => { generation.current = epoch + 1; active.current = null; operation.current?.abort() }
  }, [client, owner, read, publish])

  async function save(draft: SaveProfileDetails) {
    const before = authority.current
    if (!client || !owner || active.current !== client || before.owner !== owner || locked.current || before.reconcileRequired || before.phase !== 'ready' || !before.details) return false
    const parsed = SaveProfileDetailsSchema.safeParse(draft)
    if (!parsed.success) { publish({ ...before, error: 'Check your profile details before saving.' }); return false }
    if (parsed.data.expectedRevision !== before.details.revision) {
      publish({ ...before, phase: 'conflict', reconcileRequired: true, error: 'Saved details changed. Reload saved details to replace this draft before saving.' }); return false
    }
    locked.current = true
    const epoch = generation.current, controller = new AbortController(); operation.current = controller
    publish({ ...before, phase: 'saving', error: '' })
    let accepted = false
    try {
      const saved = await client.save(parsed.data, controller.signal)
      accepted = true
      if (!valid(epoch)) return false
      const confirmed = await client.read(controller.signal)
      if (!valid(epoch)) return false
      if (confirmed.revision !== saved.revision || !sameProfileFacts(confirmed.facts, saved.facts)) throw new Error('Readback changed')
      publish({ ...authority.current, owner, details: confirmed, phase: 'ready', error: '' })
      return true
    } catch (failure) {
      if (valid(epoch)) {
        const code = failure instanceof ProfileDetailsClientError ? failure.code : 'provider'
        const phase: Phase = accepted ? 'uncertain' : code === 'conflict' ? 'conflict' : code === 'invalid' ? 'ready' : code === 'unavailable' ? 'unavailable' : code === 'auth' ? 'error' : 'uncertain'
        const error = phase === 'conflict' ? 'Saved details changed. Reload saved details to replace this draft before saving.'
          : phase === 'uncertain' ? 'Profile details save could not be confirmed. Your draft is kept. Reload saved details to reconcile before saving again.'
          : phase === 'ready' && failure instanceof Error ? failure.message : 'Optional profile details are unavailable. Reload saved details before editing.'
        publish({ ...authority.current, phase, error, reconcileRequired: authority.current.reconcileRequired || phase !== 'ready' })
      }
      return false
    } finally { if (valid(epoch)) { locked.current = false; operation.current = null } }
  }
  return { ...current, busy: current.phase === 'saving', loading: current.phase === 'loading', canWrite: !!client && !current.reconcileRequired && current.phase === 'ready' && !!current.details, reload, save }
}
