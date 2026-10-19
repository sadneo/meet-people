import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Link } from 'react-router'
import { useSession } from '../../auth/useSession'
import type { MatchingMode } from '../../../shared/matchmaking'
import { matchmakingClient } from './client'
import { matchingErrorText } from './useMatchmaking'

function Replacement({ cancel, confirm, trigger }: { cancel: () => void; confirm: () => void; trigger: RefObject<HTMLButtonElement | null> }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current!, opener = trigger.current
    element.showModal()
    return () => { element.close(); opener?.focus() }
  }, [trigger])
  return <dialog ref={dialog} className="pt-dialog pt-downtime-confirm" aria-labelledby="downtime-replace-title" onCancel={event => { event.preventDefault(); cancel() }}><h2 id="downtime-replace-title">Replace active matching?</h2><p>There is one queue. Enabling downtime replaces your active search. Starting active matching later replaces downtime.</p><div><button type="button" className="pt-button pt-secondary" autoFocus onClick={cancel}>Cancel</button><button type="button" className="pt-button" onClick={confirm}>Replace with downtime</button></div></dialog>
}

function AuthenticatedDowntime({ token }: { token: string }) {
  const client = useMemo(() => matchmakingClient(token), [token])
  const live = useRef(false), locked = useRef(true)
  const readVersion = useRef(0)
  const restoreFocus = useRef(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const [state, setState] = useState<{ mode: MatchingMode | null; confirmed: boolean; known: boolean; eligible: boolean; problem: string }>({ mode: null, confirmed: false, known: false, eligible: false, problem: '' })
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(false)
  const read = useCallback(async () => {
    const version = ++readVersion.current
    const [status, profile, account] = await Promise.allSettled([client.status(), client.profile(), client.accountProfile()])
    const known = status.status === 'fulfilled'
    const eligible = profile.status === 'fulfilled' && !!profile.value.profile && account.status === 'fulfilled' && !!account.value.profile
    const failure = [status, profile, account].find(result => result.status === 'rejected')
    const problem = failure?.status === 'rejected' ? matchingErrorText(failure.reason) : profile.status === 'fulfilled' && !profile.value.profile ? 'Save shared preferences before enabling downtime.' : account.status === 'fulfilled' && !account.value.profile ? 'A saved server identity is required before enabling downtime.' : ''
    if (live.current && version === readVersion.current) setState(previous => ({ mode: known ? status.value.mode : previous.mode, confirmed: known || previous.confirmed, known, eligible, problem }))
    return { known, eligible, mode: known ? status.value.mode : null }
  }, [client])
  useEffect(() => {
    let current = true
    live.current = true
    void read().finally(() => { if (current && live.current) { locked.current = false; setBusy(false) } })
    return () => { current = false; live.current = false }
  }, [read])
  useEffect(() => {
    if (!busy && !confirm && restoreFocus.current) { restoreFocus.current = false; trigger.current?.focus() }
  }, [busy, confirm])
  const blocked = busy || !state.known || !state.eligible || confirm
  async function change(on: boolean, consented = false) {
    if (locked.current || !state.known || !state.eligible) return
    locked.current = true; setBusy(true); setError('')
    let attempted = false
    try {
      const current = await read()
      if (!live.current || !current.known || !current.eligible) return
      if (on) {
        if (current.mode === 'downtime') return
        if (current.mode === 'active' && !consented) { setConfirm(true); return }
        attempted = true
        await client.join('downtime')
      } else {
        // Never delete a queue that preflight identifies as active.
        if (current.mode !== 'downtime') return
        attempted = true
        await client.leave()
      }
      if (live.current) {
        const confirmed = await read()
        if (live.current && (!confirmed.known || (on ? confirmed.mode !== 'downtime' : confirmed.mode === 'downtime'))) setError('The requested queue change could not be confirmed. Last confirmed state is shown.')
      }
    } catch (failure) {
      if (!live.current) return
      setError(matchingErrorText(failure))
      if (attempted) await read()
    } finally { if (live.current) { locked.current = false; setBusy(false) } }
  }
  async function reload() {
    if (locked.current) return
    locked.current = true; setBusy(true); setError('')
    try { await read() } finally { if (live.current) { locked.current = false; setBusy(false) } }
  }
  return <div className="pt-downtime-optin">
    <div className="pt-settings-row"><span><strong>Allow downtime matching</strong><small id="downtime-queue-warning">There is one queue. Enabling downtime replaces active matching; starting active matching replaces downtime.</small></span>{state.known ? <button ref={trigger} type="button" className="pt-downtime-switch" role="switch" aria-label="Allow downtime matching" aria-checked={state.mode === 'downtime'} aria-describedby="downtime-queue-warning downtime-confirmed-status" disabled={blocked} onClick={() => { if (blocked) return; if (state.mode === 'active') setConfirm(true); else void change(state.mode !== 'downtime') }}><span aria-hidden="true" /></button> : <button type="button" className="pt-button pt-secondary" disabled aria-label="Allow downtime matching">{busy ? 'Checking…' : 'Unavailable'}</button>}</div>
    <div className="pt-downtime-status"><p id="downtime-confirmed-status" role="status">{state.confirmed ? `Last confirmed: ${state.mode === 'downtime' ? 'Downtime matching on' : state.mode === 'active' ? 'Active matching; downtime off' : 'Downtime matching off'}.` : 'Queue status not confirmed.'}{!state.known && !busy && ' Current queue status is unavailable.'}{busy && ' Checking…'}</p>
      {state.problem && <p role="alert">{state.problem} <Link to="/profile">Profile preferences</Link></p>}
      {error && <p role="alert">{error} Last confirmed state is shown.</p>}
      {(state.problem || error || !state.known) && <button type="button" className="pt-button pt-secondary" disabled={busy} onClick={() => void reload()}>Reload matchmaking status</button>}
    </div>
    {confirm && <Replacement trigger={trigger} cancel={() => setConfirm(false)} confirm={() => { restoreFocus.current = true; setConfirm(false); void change(true, true) }} />}
  </div>
}

export function DowntimeOptIn() {
  const { session, ready } = useSession()
  if (!ready || !session) return <div className="pt-settings-row"><span><strong>Allow downtime matching</strong><small>{ready ? 'Sign in to manage downtime matching.' : 'Loading account…'}</small></span><button type="button" className="pt-button pt-secondary" disabled>{ready ? 'Sign in required' : 'Loading…'}</button></div>
  return <AuthenticatedDowntime key={session.access_token} token={session.access_token} />
}
