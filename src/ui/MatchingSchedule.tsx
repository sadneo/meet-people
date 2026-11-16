import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { z } from 'zod'
import { DatingScoringSettingsResponseSchema } from '../../shared/dating-scoring'
import { matchingClient } from './matching-client'
import { timezoneOptions } from '../features/account/timezones'

type Settings = z.infer<typeof DatingScoringSettingsResponseSchema>

export function MatchingSchedule({ token, disabled, onSaved, compact = false, onBusyChange }: { token: string; disabled: boolean; onSaved: () => void; compact?: boolean; onBusyChange?: (busy: boolean) => void }) {
  const client = useMemo(() => matchingClient(token), [token]), id = useId()
  const [saved, setSaved] = useState<Settings | null>(null), [zone, setZone] = useState('')
  const [visible,setVisible]=useState(false)
  const [expanded, setExpanded] = useState(compact)
  const [choosing, setChoosing] = useState(false), [search, setSearch] = useState('')
  const zones = useMemo(() => timezoneOptions(zone), [zone])
  const device = zones.find(option => option.device)
  const selected = zones.find(option => option.value === zone)
  const terms = search.trim().toLowerCase().split(/\s+/)
  const results = search.trim() ? zones.filter(option => terms.every(term =>
    (option.label + ' ' + option.value.replaceAll('_', ' ')).toLowerCase().includes(term))) : []
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
  useEffect(() => { onBusyChange?.(busy) }, [busy, onBusyChange])
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
      setSaved(next); setZone(next.timeZone ?? ''); setVisible(next.showAvailability); setMessage('Timezone and sharing preference saved.'); onSaved()
    } catch (failure) {
      if (active.current && !abort.signal.aborted) {
        setSaved(null); setError(failure instanceof Error ? failure.message : 'Reload Schedule settings before trying again.')
      }
    } finally { if (active.current && !abort.signal.aborted) { locked.current = false; setBusy(false) } }
  }
  function choose(nextZone: string) {
    setChoosing(false); setSearch(''); setZone(nextZone)
    picker.current?.focus()
    if (compact) void save(nextZone)
  }
  const picker = useRef<HTMLButtonElement>(null)
  const lockedOut = !saved || busy || disabled
  return <details className="matching-schedule" open={expanded} onToggle={event => { setExpanded(event.currentTarget.open); if (!compact && event.currentTarget.open && !saved && !busy) void load() }}>
    <summary hidden={compact}>Timezone & shared availability</summary>
    {busy && <p role="status">Loading or saving schedule settings…</p>}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <div className="schedule-timezone">
      <span className="schedule-timezone-label">Timezone</span>
      <button type="button" className="btn light schedule-timezone-trigger" ref={picker} aria-label={'Timezone: ' + (selected?.label ?? 'Choose a timezone')}
        aria-expanded={choosing} aria-controls={choosing ? id : undefined} disabled={lockedOut}
        onClick={() => { setChoosing(!choosing); setSearch('') }}>
        <span>{selected?.label ?? 'Choose a timezone'}</span><span>{zone ? 'Change' : 'Choose'}</span>
      </button>
      {device?.value === zone && <small>Matches this device</small>}
      {choosing && <div id={id} className="schedule-timezone-picker" role="group" aria-label="Choose a timezone" onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); setChoosing(false); picker.current?.focus() }
        if (event.key === 'Enter' && event.target instanceof HTMLInputElement) event.preventDefault()
      }}>
        {device && <button type="button" className="btn light" disabled={lockedOut} onClick={() => choose(device.value)}>Use device timezone</button>}
        <label>Search by city or timezone
          <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="e.g. Chicago or GMT+1" disabled={lockedOut}/>
        </label>
        {search.trim() && (results.length ? <ul aria-label="Timezone results">
          {results.map(option => <li key={option.value}><button type="button" disabled={lockedOut} onClick={() => choose(option.value)}>{option.label}</button></li>)}
        </ul> : <p role="status">No timezones found.</p>)}
      </div>}
    </div>
    <label className="check"><input type="checkbox" checked={visible} disabled={!saved || busy || disabled} onChange={event=>{setVisible(event.target.checked);if(compact)void save(zone,event.target.checked)}}/><span>Allow shared-time explanations</span></label>
    <p className="account-note">Group proposals can show a common time when everyone allows it. Your full weekly schedule stays private.</p>
    <div className="row">
      {(!compact || error) && <button type="button" className="btn light" disabled={busy || disabled} onClick={() => void load()}>Reload timezone</button>}
      {!compact && <button type="button" className="btn light" disabled={!saved || busy || disabled} onClick={() => void save()}>Save timezone & sharing</button>}
    </div>
  </details>
}
