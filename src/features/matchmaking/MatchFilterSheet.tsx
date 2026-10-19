import { SearchPreferenceFields } from './SearchPreferenceFields'
import { emptySearchOptions, validateSearchOptions, type SearchOptions } from './search-preferences'
import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import './match-filter-sheet.css'
import { DatingPreferenceFields } from './DatingPreferenceFields'
import { emptyDatingPreferences, validateDatingPreferences, type DatingPreferenceDraft } from './dating-preferences'

export type MatchFilters = { distance: number; lower: number; upper: number }
// Preview defaults only: the host has no canonical numeric-distance/age filters.
export const filterDefaults: Record<'Friends' | 'Dating', MatchFilters> = {
  Friends: { distance: 15, lower: 18, upper: 35 },
  Dating: { distance: 15, lower: 23, upper: 30 },
}
export function normalizeFilters(value: MatchFilters): MatchFilters {
  const integer = (n: number, fallback: number, min: number, max: number) => Math.max(min, Math.min(max, Number.isFinite(n) ? Math.round(n) : fallback))
  const lower = integer(value.lower, 18, 18, 99)
  return { distance: integer(value.distance, 15, 1, 100), lower, upper: Math.max(lower, integer(value.upper, 99, 18, 99)) }
}

export function MatchFilterSheet({ mode, value, close, save, datingValue = emptyDatingPreferences, saveDating, searchValue, home = null, previewSearch }: {
  searchValue?: SearchOptions; home?: string | null
  previewSearch?: (filters: MatchFilters, options: SearchOptions) => Promise<void>
  mode: 'Friends' | 'Dating'; value: MatchFilters; close: () => void
  save?: (value: MatchFilters) => Promise<void>
  datingValue?: DatingPreferenceDraft
  saveDating?: (filters: MatchFilters, profile: DatingPreferenceDraft, options?: SearchOptions) => Promise<void>
}) {
  const [draft, setDraft] = useState(() => normalizeFilters(value))
  const [searchDraft, setSearchDraft] = useState(() => ({ ...(searchValue ?? emptySearchOptions), goals: [...(searchValue?.goals ?? [])] }))
  const [profileDraft, setProfileDraft] = useState(() => ({ ...datingValue }))
  const canSave = !!previewSearch || (mode === 'Dating' ? !!saveDating || !!save : !!save)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const dialog = useRef<HTMLDialogElement>(null), pending = useRef(false), mounted = useRef(false)
  const [dragOffset, setDragOffset] = useState(0)
  const drag = useRef<{ pointer: number; x: number; y: number; offset: number } | null>(null)
  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (pending.current || !window.matchMedia('(max-width: 800px)').matches || event.button !== 0 || dialog.current!.scrollTop > 0 || (event.target as Element).closest('button')) return
    drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, offset: 0 }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current
    if (!current || current.pointer !== event.pointerId) return
    const distance = event.clientY - current.y
    current.offset = Math.abs(event.clientX - current.x) > Math.abs(distance) ? 0 : Math.max(0, distance)
    setDragOffset(current.offset)
  }
  const endDrag = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    const current = drag.current
    if (!current || current.pointer !== event.pointerId) return
    drag.current = null
    setDragOffset(0)
    if (!cancelled && current.offset >= 100 && window.matchMedia('(max-width: 800px)').matches) dismiss()
  }
  const id = useId()
  useEffect(() => {
    mounted.current = true
    const element = dialog.current!, opener = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    element.showModal()
    element.querySelector<HTMLButtonElement>('[data-close]')?.focus()
    return () => {
      mounted.current = false
      element.close()
      document.body.style.overflow = overflow
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true })
    }
  }, [])
  const dismiss = () => { if (!pending.current) close() }
  const updateAge = (bound: 'lower' | 'upper', value: number) => setDraft(previous => ({ ...previous,
    [bound]: bound === 'lower' ? Math.max(18, Math.min(previous.upper, value)) : Math.min(99, Math.max(previous.lower, value)),
  }))
  return createPortal(<dialog ref={dialog} className="match-filter-sheet" style={{ transform: dragOffset ? `translateY(${dragOffset}px)` : undefined }} data-dragging={dragOffset > 0 || undefined} data-mode={mode.toLowerCase()} aria-labelledby={`${id}-heading`} aria-describedby={`${id}-scope ${id}-note`} onCancel={event => { event.preventDefault(); dismiss() }}>
    <div className="mfs-drag-region" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={event => endDrag(event)} onPointerCancel={event => endDrag(event, true)} onLostPointerCapture={event => endDrag(event, true)}>
    <div className="mfs-grabber" aria-hidden="true" />
    <header className="mfs-header"><div><span>{mode} preferences</span><h2 id={`${id}-heading`}>Your kind of connection.</h2></div><button data-close type="button" className="mfs-close" aria-label="Close filters" disabled={busy} onClick={dismiss}>×</button></header>
    </div>
    <p className="mfs-scope" id={`${id}-scope`}>Choose how far to look and the ages you’d like to meet.</p>
    <form onSubmit={async event => {
      event.preventDefault()
      if (!canSave || pending.current) return
      if (searchValue) { const issue = validateSearchOptions(searchDraft); if (issue) { setError(issue); return } }
      if (mode === 'Dating') { const issue = validateDatingPreferences(profileDraft, datingValue); if (issue) { setError(issue); return } }
      pending.current = true; setBusy(true); setError('')
      try { if (previewSearch) await previewSearch(normalizeFilters(draft), { ...searchDraft, area: searchDraft.area.trim(), goals: [...searchDraft.goals] }); else if (mode === 'Dating' && saveDating) { if (searchValue) await saveDating(normalizeFilters(draft), { ...profileDraft }, { ...searchDraft, area: searchDraft.area.trim() }); else await saveDating(normalizeFilters(draft), { ...profileDraft }) } else await save!(normalizeFilters(draft)); if (mounted.current) close() }
      catch { if (mounted.current) setError('Preferences could not be saved. Your previous filters are unchanged. Try again.') }
      finally { pending.current = false; if (mounted.current) setBusy(false) }
    }}>
      <fieldset disabled={busy} className="mfs-section"><div className="mfs-label"><label htmlFor={`${id}-distance`}>Maximum distance</label><output htmlFor={`${id}-distance`}>{draft.distance} {draft.distance === 1 ? 'mile' : 'miles'}</output></div>
        <input id={`${id}-distance`} className="mfs-distance" type="range" min={1} max={100} step={1} value={draft.distance} aria-label="Maximum distance in miles" onChange={event => setDraft(previous => ({ ...previous, distance: Number(event.target.value) }))} style={{ '--distance': `${(draft.distance - 1) / 99 * 100}%` } as CSSProperties} />
        <div className="mfs-endpoints" aria-hidden="true"><span>1 mile</span><span>100 miles</span></div>
      </fieldset>
      <fieldset disabled={busy} className="mfs-section"><div className="mfs-label"><span id={`${id}-age`}>Age range</span><output htmlFor={`${id}-lower ${id}-upper`}>{draft.lower}–{draft.upper}</output></div><p className="mfs-explanation">Move either end to set your range.</p>
        <div className="mfs-age" role="group" aria-labelledby={`${id}-age`} style={{ '--split': (draft.lower + draft.upper - 36) / 162, '--lower': `${(draft.lower - 18) / 81 * 100}%`, '--upper': `${(draft.upper - 18) / 81 * 100}%` } as CSSProperties}>
          <div className="mfs-track" /><div className="mfs-fill" />
          {(['lower', 'upper'] as const).map(bound => <input key={bound} id={`${id}-${bound}`} data-bound={bound} type="range" min={18} max={99} step={1} value={draft[bound]} aria-label={bound === 'lower' ? 'Minimum age' : 'Maximum age'} aria-valuemin={bound === 'upper' ? draft.lower : 18} aria-valuemax={bound === 'lower' ? draft.upper : 99} onChange={event => updateAge(bound, Number(event.target.value))} />)}
        </div>
        <div className="mfs-endpoints" aria-hidden="true"><span>18</span><span>99</span></div>
      </fieldset>
      {searchValue && <SearchPreferenceFields mode={mode} value={searchDraft} change={value => { setSearchDraft(value); setError('') }} home={home} disabled={busy} />}
      {mode === 'Dating' && <DatingPreferenceFields value={profileDraft} change={value => { setProfileDraft(value); setError('') }} disabled={busy} />}
      {error && <p className="mfs-error" role="alert">{error}</p>}
      <div className="mfs-actions"><button type="button" className="mfs-reset" title="Reset distance and age only" disabled={busy} onClick={() => { setDraft({ ...filterDefaults[mode] }); setError('') }}>Reset</button><button type="submit" className="mfs-save" disabled={busy || !canSave} aria-describedby={`${id}-note`}>{busy ? previewSearch ? 'Applying…' : 'Saving…' : mode === 'Friends' && previewSearch ? 'Apply filter preview' : 'Save preferences'}</button></div>
      <p className="mfs-note" id={`${id}-note`}>{mode === 'Friends' && previewSearch ? 'Preview for this visit. Age, distance, goals and temporary area do not affect the current search yet. Interests and your weekly schedule stay shared with Profile.' : mode === 'Friends' ? 'Search filters are not connected yet. Saving is unavailable; your queue and profile stay the same.' : 'Local preview only: filters, search area and details reset on leaving. Dating is for adults 18 and over. Your account and Friends stay unchanged. Reset changes distance and age only.'}</p>
    </form>
  </dialog>, document.body)
}
