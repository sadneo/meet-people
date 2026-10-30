import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { z } from 'zod'
import { DatingScoringSettingsResponseSchema } from '../../shared/dating-scoring'
import { matchingClient } from './matching-client'
import { timezoneOptions } from '../features/account/timezones'

type Settings = z.infer<typeof DatingScoringSettingsResponseSchema>

export function MatchingSchedule({ token, disabled, onSaved, compact = false }: { token: string; disabled: boolean; onSaved: () => void; compact?: boolean }) {
  const client = useMemo(() => matchingClient(token), [token]), id = useId()
  const [saved, setSaved] = useState<Settings | null>(null), [zone, setZone] = useState('')
  const [visible,setVisible]=useState(false)
  const [expanded, setExpanded] = useState(compact)
  const zones = useMemo(() => timezoneOptions(zone), [zone])
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
  const controller = useRef<AbortController | null>(null), active = useRef(true), locked = useRef(false)
  // A closed disclosure makes no request and never writes a guessed browser zone.
  const load = useCallback(async () => {
    if (locked.current || disabled) return
    locked.current = true; setBusy(true); setError(''); setMessage('')
    const abort = new AbortController(); controller.current = abort
    try {
      const next = await client.schedule(abort.signal)
      if (!active.current || abort.signal.aborted) return
      setSaved(next); setZone(next.timeZone ?? ''); setVisible(next.showAvailability)
    } catch { if (active.current && !abort.signal.aborted) { setSaved(null); setError('Availability settings are unavailable. Reload to try again.') } }
    finally { if (active.current && !abort.signal.aborted) { locked.current = false; setBusy(false) } }
  }, [client, disabled])
  useEffect(() => {
    let cancelled = false
    active.current = true; locked.current = false
    queueMicrotask(() => { if (!cancelled && compact && !disabled) void load() })
    return () => { cancelled = true; active.current = false; locked.current = false; controller.current?.abort() }
  }, [compact, disabled, load])
  async function save(nextZone = zone, nextVisible = visible) {
    if (!saved || locked.current || disabled) return
    locked.current = true; setBusy(true); setError(''); setMessage('')
    const abort = new AbortController(); controller.current = abort
    try {
      const next = await client.saveSchedule({ expectedRevision: saved.revision, timeZone: nextZone || null, showAvailability: nextVisible }, abort.signal)
      if (!active.current || abort.signal.aborted) return
      setSaved(next); setZone(next.timeZone ?? ''); setVisible(next.showAvailability); setMessage('Weekly timezone saved.'); onSaved()
    } catch (failure) {
      if (active.current && !abort.signal.aborted) {
        setSaved(null); setError(failure instanceof Error ? failure.message : 'Reload Schedule settings before trying again.')
      }
    } finally { if (active.current && !abort.signal.aborted) { locked.current = false; setBusy(false) } }
  }
  return <details className="matching-schedule" open={expanded} onToggle={event => { setExpanded(event.currentTarget.open); if (!compact && event.currentTarget.open && !saved && !busy) void load() }}>
    <summary hidden={compact}>Availability timezone</summary>
    {!compact && <p>Choose the timezone for your saved weekly availability so we can calculate shared time. Your exact schedule stays private. Shared-time explanations require everyone’s permission.</p>}
    {busy && <p role="status">Loading or saving Schedule settings…</p>}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <label htmlFor={id}>Timezone</label>
    {compact ? <select id={id} disabled={!saved || busy || disabled} value={zone} onChange={event => { const nextZone = event.target.value; setZone(nextZone); void save(nextZone); }}>
      <option value="" disabled>Select a timezone</option>
      {zones.map(option => <option key={option.value} value={option.value}>{option.label}{option.device ? ' · Your device' : ''}</option>)}
    </select> : <input id={id} disabled={!saved || busy || disabled} value={zone} placeholder="America/New_York" onChange={event => setZone(event.target.value)} />}
    <label className="check"><input type="checkbox" checked={visible} disabled={!saved || busy || disabled} onChange={event=>{setVisible(event.target.checked);if(compact)void save(zone,event.target.checked)}}/>{compact ? 'Show shared availability' : 'Allow shared-time explanations'}</label>
    <div className="row">
      {(!compact || error) && <button type="button" className="btn light" disabled={busy || disabled} onClick={() => void load()}>Reload timezone</button>}
      {!compact && <button type="button" className="btn light" disabled={!saved || busy || disabled} onClick={() => void save()}>Save timezone</button>}
    </div>
  </details>
}
