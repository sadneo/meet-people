import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { z } from 'zod'
import { DatingScoringSettingsResponseSchema } from '../../shared/dating-scoring'
import { matchingClient } from './matching-client'
import { deviceTimezone, timezoneOptions } from '../features/account/timezones'

type Settings = z.infer<typeof DatingScoringSettingsResponseSchema>

export function MatchingSchedule({ token, disabled, onSaved, compact = false, onBusyChange, autoDetectTimezone = false, onReadyChange }: { token: string; disabled: boolean; onSaved: () => void; compact?: boolean; onBusyChange?: (busy: boolean) => void; autoDetectTimezone?: boolean; onReadyChange?: (ready: boolean) => void }) {
  const client = useMemo(() => matchingClient(token), [token]), id = useId()
  const [saved, setSaved] = useState<Settings | null>(null), [zone, setZone] = useState('')
  const [visible,setVisible]=useState(false)
  const [expanded, setExpanded] = useState(compact)
  const zones = useMemo(() => timezoneOptions(zone), [zone])
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
  useEffect(() => { onBusyChange?.(busy) }, [busy, onBusyChange])
  useEffect(() => { onReadyChange?.(!!saved && !busy) }, [saved, busy, onReadyChange])
  const controller = useRef<AbortController | null>(null), active = useRef(true), locked = useRef(false)
  const detectionAttempted = useRef(false)
  // A closed disclosure makes no request and never writes a guessed browser zone.
  const load = useCallback(async () => {
    if (locked.current || disabled) return
    locked.current = true; setBusy(true); setError(''); setMessage('')
    const abort = new AbortController(); controller.current = abort
    try {
      let next = await client.schedule(abort.signal)
      if (!active.current || abort.signal.aborted) return
      if (autoDetectTimezone && !next.timeZone && !detectionAttempted.current) {
        detectionAttempted.current = true
        const detected = deviceTimezone()
        if (detected) {
          setZone(detected)
          const written = await client.saveSchedule({ expectedRevision: next.revision, timeZone: detected, showAvailability: next.showAvailability }, abort.signal)
          if (!active.current || abort.signal.aborted) return
          const confirmed = await client.schedule(abort.signal)
          if (!active.current || abort.signal.aborted) return
          if (written.timeZone !== detected || confirmed.timeZone !== detected || confirmed.revision !== written.revision || confirmed.showAvailability !== next.showAvailability) throw new Error('Timezone save could not be confirmed. Reload timezone before trying again.')
          next = confirmed
          setMessage('Device timezone saved. You can change it below.')
        }
      }
      setSaved(next); setZone(next.timeZone ?? ''); setVisible(next.showAvailability)
    } catch { if (active.current && !abort.signal.aborted) { setSaved(null); setError('Availability settings could not be confirmed. Reload timezone before trying again.') } }
    finally { if (active.current && !abort.signal.aborted) { locked.current = false; setBusy(false) } }
  }, [client, disabled, autoDetectTimezone])
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
      setSaved(next); setZone(next.timeZone ?? ''); setVisible(next.showAvailability); setMessage('Timezone and sharing preference saved.'); onSaved()
    } catch (failure) {
      if (active.current && !abort.signal.aborted) {
        setSaved(null); setError(failure instanceof Error ? failure.message : 'Reload Schedule settings before trying again.')
      }
    } finally { if (active.current && !abort.signal.aborted) { locked.current = false; setBusy(false) } }
  }
  return <details className="matching-schedule" open={expanded} onToggle={event => { setExpanded(event.currentTarget.open); if (!compact && event.currentTarget.open && !saved && !busy) void load() }}>
    <summary hidden={compact}>Timezone & shared availability</summary>
    {autoDetectTimezone && <p className="account-note">We use your device timezone when you haven’t saved one yet. Check it below or choose a different timezone.</p>}
    <p className="account-note">{compact ? 'Timezone and sharing changes save immediately. Weekly time windows save with the rest of this form. ' : 'Choose the timezone for your saved weekly availability. '}Discovery shows only a coarse shared-time summary when both people allow it. Group proposals can show a common time when everyone allows it, never your full weekly schedule.</p>
    {busy && <p role="status">Loading or saving Schedule settings…</p>}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <label htmlFor={id}>Timezone</label>
    {compact ? <select id={id} disabled={!saved || busy || disabled} value={zone} onChange={event => { const nextZone = event.target.value; setZone(nextZone); void save(nextZone); }}>
      <option value="" disabled>Select a timezone</option>
      {zones.map(option => <option key={option.value} value={option.value}>{option.label}{option.device ? ' · Your device' : ''}</option>)}
    </select> : <input id={id} disabled={!saved || busy || disabled} value={zone} placeholder="America/New_York" onChange={event => setZone(event.target.value)} />}
    <label className="check"><input type="checkbox" checked={visible} disabled={!saved || busy || disabled} onChange={event=>{setVisible(event.target.checked);if(compact)void save(zone,event.target.checked)}}/>Allow shared-time explanations</label>
    <div className="row">
      {(!compact || error) && <button type="button" className="btn light" disabled={busy || disabled} onClick={() => void load()}>Reload timezone</button>}
      {!compact && <button type="button" className="btn light" disabled={!saved || busy || disabled} onClick={() => void save()}>Save timezone & sharing</button>}
    </div>
  </details>
}
