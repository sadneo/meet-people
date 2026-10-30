import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { z } from 'zod'
import { DatingScoringSettingsResponseSchema } from '../../shared/dating-scoring'
import { matchingClient } from './matching-client'

type Settings = z.infer<typeof DatingScoringSettingsResponseSchema>

export function MatchingSchedule({ token, disabled, onSaved, compact = false }: { token: string; disabled: boolean; onSaved: () => void; compact?: boolean }) {
  const client = useMemo(() => matchingClient(token), [token]), id = useId()
  const [saved, setSaved] = useState<Settings | null>(null), [zone, setZone] = useState('')
  const [visible,setVisible]=useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
  const controller = useRef<AbortController | null>(null), active = useRef(true), locked = useRef(false)
  useEffect(() => {
    active.current = true
    return () => { active.current = false; controller.current?.abort() }
  }, [])
  // A closed disclosure makes no request and never writes a guessed browser zone.
  async function load() {
    if (locked.current || disabled) return
    locked.current = true; setBusy(true); setError(''); setMessage('')
    const abort = new AbortController(); controller.current = abort
    try {
      const next = await client.schedule(abort.signal)
      if (!active.current || abort.signal.aborted) return
      setSaved(next); setZone(next.timeZone ?? ''); setVisible(next.showAvailability)
    } catch { if (active.current && !abort.signal.aborted) { setSaved(null); setError('Availability settings are unavailable. Reload to try again.') } }
    finally { if (active.current && !abort.signal.aborted) { locked.current = false; setBusy(false) } }
  }
  async function save() {
    if (!saved || locked.current || disabled) return
    locked.current = true; setBusy(true); setError(''); setMessage('')
    const abort = new AbortController(); controller.current = abort
    try {
      const next = await client.saveSchedule({ expectedRevision: saved.revision, timeZone: zone || null, showAvailability: visible }, abort.signal)
      if (!active.current || abort.signal.aborted) return
      setSaved(next); setZone(next.timeZone ?? ''); setVisible(next.showAvailability); setMessage('Weekly timezone saved.'); onSaved()
    } catch (failure) {
      if (active.current && !abort.signal.aborted) {
        setSaved(null); setError(failure instanceof Error ? failure.message : 'Reload Schedule settings before trying again.')
      }
    } finally { if (active.current && !abort.signal.aborted) { locked.current = false; setBusy(false) } }
  }
  return <details className="matching-schedule" onToggle={event => { if (event.currentTarget.open && !saved && !busy) void load() }}>
    <summary className={compact ? 'account-area' : undefined}>{compact ? 'Timezone & shared availability' : 'Availability timezone'}</summary>
    <p>Choose the timezone for your saved weekly availability so we can calculate shared time. Your exact schedule stays private. Shared-time explanations require everyone’s permission.</p>
    {busy && <p role="status">Loading or saving Schedule settings…</p>}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <label htmlFor={id}>Timezone</label>
    <input id={id} disabled={!saved || busy || disabled} value={zone} placeholder="America/New_York" onChange={event => setZone(event.target.value)} />
    <label className="check"><input type="checkbox" checked={visible} disabled={!saved || busy || disabled} onChange={event=>setVisible(event.target.checked)}/>Allow shared-time explanations</label>
    <div className="row">
      <button type="button" className="btn light" disabled={busy || disabled} onClick={() => void load()}>Reload timezone</button>
      <button type="button" className="btn light" disabled={!saved || busy || disabled} onClick={() => void save()}>Save timezone</button>
    </div>
  </details>
}
