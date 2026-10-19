import { SearchLocationPicker } from './SearchLocationPicker'
import type { SearchLocationReceipt } from '../../../shared/search-locations'
import { SearchPreferenceFields } from './SearchPreferenceFields'
import { emptySearchOptions, validateSearchOptions, type SearchOptions } from './search-preferences'
import { useEffect, useLayoutEffect, useId, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import './match-filter-sheet.css'
import { DatingPreferenceFields } from './DatingPreferenceFields'
import { emptyDatingPreferences, validateDatingPreferences, type DatingPreferenceDraft } from './dating-preferences'
import type { useDatingPreferences } from './useDatingPreferences'
import { datingAggregateDraft, datingDraftWrite } from './dating-aggregate-draft'
import type { useFriendsPreferences } from './useFriendsPreferences'
import { friendsPreferenceDraft, friendsDraftWrite } from './friends-preferences-draft'

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

export function MatchFilterSheet({ mode, value, close, save, datingValue = emptyDatingPreferences, saveDating, searchValue, home = null, previewSearch, canonicalDating, canonicalFriends }: {
  canonicalDating?: ReturnType<typeof useDatingPreferences>
  canonicalFriends?: ReturnType<typeof useFriendsPreferences> & { homeReferenceInvalidated?: boolean }
  searchValue?: SearchOptions; home?: string | null
  previewSearch?: (filters: MatchFilters, options: SearchOptions) => Promise<void>
  mode: 'Friends' | 'Dating'; value: MatchFilters; close: () => void
  save?: (value: MatchFilters) => Promise<void>
  datingValue?: DatingPreferenceDraft
  saveDating?: (filters: MatchFilters, profile: DatingPreferenceDraft, options?: SearchOptions) => Promise<void>
}) {
  const [draft, setDraft] = useState(() => normalizeFilters(value))
  const [searchDraft, setSearchDraft] = useState(() => ({ ...(searchValue ?? emptySearchOptions), goals: [...(searchValue?.goals ?? [])] }))
  const [locationReceipt, setLocationReceipt] = useState<SearchLocationReceipt | null>(null), [locationBusy, setLocationBusy] = useState(false), [locationCleared, setLocationCleared] = useState(false)
  const [profileDraft, setProfileDraft] = useState(() => ({ ...datingValue }))
  const [baseline, setBaseline] = useState(canonicalDating?.snapshot ?? null), [baselineHome, setBaselineHome] = useState(home)
  const [friendsBaseline, setFriendsBaseline] = useState(canonicalFriends?.snapshot ?? null)
  const [friendsAreaChanged, setFriendsAreaChanged] = useState(false), [friendsFieldsEpoch, setFriendsFieldsEpoch] = useState(0)
  const [reloading, setReloading] = useState(false)
  const changed = !!(baseline && canonicalDating?.snapshot && (baseline.profileRevision !== canonicalDating.snapshot.profileRevision || baseline.searchRevision !== canonicalDating.snapshot.searchRevision))
  const friendsChanged = !!(friendsBaseline && canonicalFriends?.snapshot && friendsBaseline.revision !== canonicalFriends.snapshot.revision)
  const enabledReadOnly = !!canonicalDating && (!!canonicalDating.snapshot?.profile.enabled || !!baseline?.profile.enabled)
  const canSave = !locationBusy && (canonicalFriends ? canonicalFriends.canWrite && !friendsChanged && !reloading : canonicalDating ? canonicalDating.canWrite && !enabledReadOnly && !changed && !reloading : !!previewSearch || (mode === 'Dating' ? !!saveDating || !!save : !!save))
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const fieldsLocked = locationBusy || busy || reloading || !!canonicalDating?.accountBusy || !!canonicalFriends?.accountBusy || enabledReadOnly
  const dialog = useRef<HTMLDialogElement>(null), pending = useRef(false), reloadPending = useRef(false), mounted = useRef(false)
  useLayoutEffect(() => () => { mounted.current = false }, [])
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
  const dismiss = () => { if (!pending.current && !canonicalDating?.busy && !canonicalFriends?.busy) close() }
  const reload = async () => {
    if ((!canonicalDating && !canonicalFriends) || reloadPending.current || pending.current || canonicalDating?.busy || canonicalFriends?.busy) return
    reloadPending.current = true
    setReloading(true); setError('')
    if (canonicalFriends) {
      const snapshot = await canonicalFriends.reload()
      reloadPending.current = false
      if (!mounted.current) return
      setReloading(false)
      if (snapshot) {
        const loaded = friendsPreferenceDraft(snapshot)
        setLocationReceipt(null); setLocationCleared(false); setFriendsBaseline(snapshot); setBaselineHome(home); setDraft(loaded.filters); setSearchDraft(loaded.options); setFriendsAreaChanged(false); setFriendsFieldsEpoch(epoch => epoch + 1)
      }
      return
    }
    const snapshot = await canonicalDating!.reload()
    reloadPending.current = false
    if (!mounted.current) return
    setReloading(false)
    if (snapshot) {
      const loaded = datingAggregateDraft(snapshot)
      setLocationReceipt(null); setLocationCleared(false); setBaseline(snapshot); setBaselineHome(home); setDraft(loaded.filters); setProfileDraft(loaded.profile); setSearchDraft(loaded.options)
    }
  }
  const updateAge = (bound: 'lower' | 'upper', value: number) => setDraft(previous => ({ ...previous,
    [bound]: bound === 'lower' ? Math.max(18, Math.min(previous.upper, value)) : Math.min(99, Math.max(previous.lower, value)),
  }))
  const savedArea = mode === 'Friends' ? friendsBaseline?.preferences?.searchArea : baseline?.search?.searchArea
  const sameSavedArea = savedArea?.source === searchDraft.source && (savedArea.source !== 'temporary' || savedArea.areaLabel === searchDraft.area)
  const currentAreaLabel = searchDraft.source === 'home' ? home ?? '' : searchDraft.area
  const freshLocation = locationReceipt?.mode === (mode === 'Friends' ? 'friends' : 'dating') && locationReceipt.source === searchDraft.source && locationReceipt.areaLabel === currentAreaLabel ? locationReceipt : null
  const homeLocationInvalid = searchDraft.source === 'home' && (baselineHome !== home || !!canonicalFriends?.homeReferenceInvalidated)
  const storedLocation = !locationCleared && !friendsAreaChanged && !homeLocationInvalid && sameSavedArea ? savedArea?.resolvedLocationRef ?? null : null
  const locationControls = (canonicalFriends || canonicalDating) && <SearchLocationPicker mode={mode === 'Friends' ? 'friends' : 'dating'} source={searchDraft.source} area={searchDraft.source === 'home' ? home ?? '' : searchDraft.area} disabled={fieldsLocked}
        reference={freshLocation?.id ?? storedLocation}
        pending={setLocationBusy} clear={() => { setLocationReceipt(null); setLocationCleared(true); setFriendsAreaChanged(true) }} resolved={receipt => { setLocationReceipt(receipt); setLocationCleared(false); setSearchDraft(current => ({ ...current, source: receipt.source, area: receipt.source === 'temporary' ? receipt.areaLabel : '' })); setError('') }} />
  return createPortal(<dialog ref={dialog} className="match-filter-sheet" style={{ transform: dragOffset ? `translateY(${dragOffset}px)` : undefined }} data-dragging={dragOffset > 0 || undefined} data-mode={mode.toLowerCase()} data-canonical={canonicalDating || canonicalFriends ? 'true' : undefined} aria-labelledby={`${id}-heading`} aria-describedby={`${id}-scope ${id}-note`} onCancel={event => { event.preventDefault(); dismiss() }}>
    <div className="mfs-drag-region" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={event => endDrag(event)} onPointerCancel={event => endDrag(event, true)} onLostPointerCapture={event => endDrag(event, true)}>
    <div className="mfs-grabber" aria-hidden="true" />
    <header className="mfs-header"><div><span>{mode} preferences</span><h2 id={`${id}-heading`}>Your kind of connection.</h2></div><button data-close type="button" className="mfs-close" aria-label="Close filters" disabled={busy} onClick={dismiss}>×</button></header>
    </div>
    <p className="mfs-scope" id={`${id}-scope`}>{canonicalFriends ? 'Save your preferred ages, distance, goals and search area. Saved filters are not applied to the current queue.' : 'Choose how far to look and the ages you’d like to meet.'}</p>
    <form onSubmit={async event => {
      event.preventDefault()
      if (!canSave || pending.current) return
      if (searchValue && !canonicalDating && !canonicalFriends) { const issue = validateSearchOptions(searchDraft); if (issue) { setError(issue); return } }
      if (mode === 'Dating') { const issue = validateDatingPreferences(profileDraft, datingValue); if (issue) { setError(issue); return } }
      pending.current = true; setBusy(true); setError('')
      try {
        if (canonicalFriends) {
          const invalidateHome = searchDraft.source === 'home' && (baselineHome !== home || !!canonicalFriends.homeReferenceInvalidated)
          const write = friendsDraftWrite(friendsBaseline!, normalizeFilters(draft), searchDraft, friendsAreaChanged || invalidateHome || locationCleared, freshLocation, home)
          const confirmed = await canonicalFriends.save(write)
          if (confirmed && mounted.current) close()
        } else if (canonicalDating) {
          const source = { ...baseline!, eligibility: canonicalDating.snapshot!.eligibility }
          const write = datingDraftWrite(source, normalizeFilters(draft), profileDraft, searchDraft, baselineHome !== home || locationCleared, freshLocation, home)
          const confirmed = await canonicalDating.save(write)
          if (confirmed && mounted.current) close()
        } else {
          if (previewSearch) await previewSearch(normalizeFilters(draft), { ...searchDraft, area: searchDraft.area.trim(), goals: [...searchDraft.goals] }); else if (mode === 'Dating' && saveDating) { if (searchValue) await saveDating(normalizeFilters(draft), { ...profileDraft }, { ...searchDraft, area: searchDraft.area.trim() }); else await saveDating(normalizeFilters(draft), { ...profileDraft }) } else await save!(normalizeFilters(draft))
          if (mounted.current) close()
        }
      }
      catch (failure) { if (mounted.current) setError(failure instanceof Error && failure.message === 'Choose a current search location again.' ? failure.message : canonicalFriends ? 'Check Friends bounds, exact goals and temporary area. A temporary area needs a nonblank label; no geography is inferred.' : canonicalDating ? failure instanceof Error && failure.message.startsWith('Clear matching') ? failure.message : 'Check the Dating draft, height and search area. Reload saved preferences if a save could not be confirmed.' : 'Preferences could not be saved. Your previous filters are unchanged. Try again.') }
      finally { pending.current = false; if (mounted.current) setBusy(false) }
    }}>
      {(!canonicalDating && !canonicalFriends || canonicalDating?.snapshot || canonicalFriends?.snapshot) && <>
      <fieldset disabled={fieldsLocked} className="mfs-section"><div className="mfs-label"><label htmlFor={`${id}-distance`}>Maximum distance</label><output htmlFor={`${id}-distance`}>{draft.distance} {draft.distance === 1 ? 'mile' : 'miles'}</output></div>
        <input id={`${id}-distance`} className="mfs-distance" type="range" min={1} max={100} step={1} value={draft.distance} aria-label="Maximum distance in miles" onChange={event => setDraft(previous => ({ ...previous, distance: Number(event.target.value) }))} style={{ '--distance': `${(draft.distance - 1) / 99 * 100}%` } as CSSProperties} />
        <div className="mfs-endpoints" aria-hidden="true"><span>1 mile</span><span>100 miles</span></div>
      </fieldset>
      <fieldset disabled={fieldsLocked} className="mfs-section"><div className="mfs-label"><span id={`${id}-age`}>Age range</span><output htmlFor={`${id}-lower ${id}-upper`}>{draft.lower}–{draft.upper}</output></div><p className="mfs-explanation">Move either end to set your range.</p>
        <div className="mfs-age" role="group" aria-labelledby={`${id}-age`} style={{ '--split': (draft.lower + draft.upper - 36) / 162, '--lower': `${(draft.lower - 18) / 81 * 100}%`, '--upper': `${(draft.upper - 18) / 81 * 100}%` } as CSSProperties}>
          <div className="mfs-track" /><div className="mfs-fill" />
          {(['lower', 'upper'] as const).map(bound => <input key={bound} id={`${id}-${bound}`} data-bound={bound} type="range" min={18} max={99} step={1} value={draft[bound]} aria-label={bound === 'lower' ? 'Minimum age' : 'Maximum age'} aria-valuemin={bound === 'upper' ? draft.lower : 18} aria-valuemax={bound === 'lower' ? draft.upper : 99} onChange={event => updateAge(bound, Number(event.target.value))} />)}
        </div>
        <div className="mfs-endpoints" aria-hidden="true"><span>18</span><span>99</span></div>
      </fieldset>
      {searchValue && <SearchPreferenceFields key={canonicalFriends ? `friends-${friendsFieldsEpoch}` : 'dating-or-preview'} mode={mode} value={searchDraft} existingGoals={friendsBaseline?.preferences?.goals} change={value => {
        if (value.source !== searchDraft.source || value.area !== searchDraft.area) { setLocationReceipt(null); setLocationCleared(false); if (canonicalFriends) setFriendsAreaChanged(true) }
        setSearchDraft(value); setError('')
      }} home={home} disabled={fieldsLocked} canonical={!!canonicalDating || !!canonicalFriends} locationControls={locationControls} />}

      {canonicalFriends && <>
        {!friendsBaseline?.preferences && <p className="mfs-note">No Friends filter choices stored. These are unsaved draft defaults, not saved constraints.</p>}
        {!freshLocation && (friendsAreaChanged || searchDraft.source === 'home' && (baselineHome !== home || canonicalFriends.homeReferenceInvalidated)) && <p className="mfs-note">This draft clears the location reference. The area remains unresolved; no nearby matching is enabled.</p>}
      </>}
      {mode === 'Dating' && <DatingPreferenceFields value={profileDraft} existingTargets={baseline?.profile.clarifiedTargets ?? datingValue.clarifiedTargets} change={value => { setProfileDraft(value); setError('') }} disabled={fieldsLocked} />}
      {canonicalDating && <>
        {enabledReadOnly && <p className="mfs-note">This saved Dating profile has enabled consent. Details and search are read-only here to avoid changing it. No activation or consent-change control is available.</p>}
        {!baseline?.search && <p className="mfs-note">No search preferences saved. These suggested bounds are an unsaved draft.</p>}
        <p className="mfs-note">Eligibility receipt as of {canonicalDating.snapshot?.eligibility.asOf}: {canonicalDating.snapshot?.eligibility.adult ? 'adult age recorded' : 'adult age not established'}. Disabled drafts do not require adult eligibility or a resolved location.</p>
        {baseline && (baseline.profile.gender !== '' || baseline.profile.sexuality !== '') && (baseline.profile.gender !== profileDraft.gender || baseline.profile.sexuality !== profileDraft.sexuality) && <p className="mfs-note">Your saved identity changed. Clear matching clarification and save the disabled identity draft first; reopen to confirm new targets.</p>}
        <button type="button" className="mfs-reset" disabled={fieldsLocked} onClick={() => { setProfileDraft(current => ({ ...current, clarifiedTargets: [] })); setError('') }}>Clear matching clarification</button>
      </>}
      </>}
      {canonicalDating?.loading && <p role="status">Loading saved Dating preferences…</p>}
      {canonicalFriends?.loading && <p role="status">Loading saved Friends filters…</p>}
      {changed && <p role="status">Saved Dating preferences changed. Reload the whole aggregate to replace this draft.</p>}
      {friendsChanged && <p role="status">Saved Friends filters changed. Reload saved filters to replace this draft.</p>}
      {(error || canonicalDating?.error || canonicalFriends?.error) && <p className="mfs-error" role="alert">{error || canonicalDating?.error || canonicalFriends?.error}</p>}
      {canonicalDating && <p className="mfs-note">Reload replaces both drafts with canonical values; it never retries a save.</p>}
      {canonicalFriends && <p className="mfs-note">Reload replaces this filter draft with canonical values; it never retries a save. Closing discards unsaved edits.</p>}
      <div className="mfs-actions">
        {(!canonicalDating && !canonicalFriends || canonicalDating?.snapshot || canonicalFriends?.snapshot) && <button type="button" className="mfs-reset" title="Reset distance and age only" disabled={fieldsLocked} onClick={() => { setDraft({ ...filterDefaults[mode] }); setError('') }}>Reset</button>}
        {canonicalDating && <button type="button" className="mfs-reset" disabled={busy || reloading || canonicalDating.loading} onClick={() => void reload()}>Reload saved Dating preferences</button>}
        {canonicalFriends && <button type="button" className="mfs-reset" disabled={busy || reloading || canonicalFriends.loading} onClick={() => void reload()}>Reload saved Friends filters</button>}
        <button type="submit" className="mfs-save" disabled={busy || !canSave} aria-describedby={`${id}-note`}>{busy ? previewSearch ? 'Applying…' : 'Saving…' : canonicalFriends ? 'Save Friends filters' : canonicalDating ? 'Save disabled Dating draft' : mode === 'Friends' && previewSearch ? 'Apply filter preview' : 'Save preferences'}</button>
      </div>
      <p className="mfs-note" id={`${id}-note`}>{canonicalFriends ? 'Preference storage only: the production matcher does not consume these revisions yet. Saving does not change current search constraints or enable nearby matching. Interests and your weekly schedule remain shared with Profile through Find Friends, not this form. Reset changes age/distance only.' : canonicalDating ? 'Saves disabled details and search together; existing enabled consent is read-only and preserved. No live activation is available here. Visibility does not activate Dating. Local prototype recommendations — not live Dating matches.' : mode === 'Friends' && previewSearch ? 'Preview for this visit. Age, distance, goals and temporary area do not affect the current search yet. Interests and your weekly schedule stay shared with Profile.' : mode === 'Friends' ? 'Search filters are not connected yet. Saving is unavailable; your queue and profile stay the same.' : 'Local preview only: filters, search area and details reset on leaving. Dating is for adults 18 and over. Your account and Friends stay unchanged. Reset changes distance and age only.'}</p>
    </form>
  </dialog>, document.body)
}
