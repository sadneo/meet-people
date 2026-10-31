import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import type { FriendsPreferences } from '../../shared/friends-search-preferences'
import type { MapCenter, MapPreview, MapPreviewRequest } from '../../shared/location-picker'
import type { SearchLocationReceipt } from '../../shared/search-locations'
import { mountSearchMap, type SearchMap } from '../features/matchmaking/google-location-map'
import { searchLocationClient } from '../features/matchmaking/search-location-client'
import { ErrorMessage, Icon } from './common'
import { useModalLayer } from './modal-layer'
import { useCurrent } from './current'

type Props = { mode: 'friends' | 'dating'; value: FriendsPreferences['searchArea']; radiusMiles: number; disabled?: boolean; save: (area: FriendsPreferences['searchArea']) => Promise<boolean> }
export function LocationPicker(props: Props) {
  const current = useCurrent(), layer = useModalLayer(), trigger = useRef<HTMLButtonElement>(null)
  // React keys can appear in diagnostics; never use the bearer token as a key.
  const binding = useMemo(() => ({ token: current.session.access_token, key: crypto.randomUUID() }), [current.session.access_token])
  const [open, setOpen] = useState(false)
  const label = props.value.resolvedLocationRef
    ? props.value.source === 'temporary' ? props.value.areaLabel : current.account?.profile?.location_city
    : null
  return <div className="search-area">
    <button ref={trigger} type="button" className="account-area search-area-button" disabled={props.disabled || !layer} onClick={() => setOpen(true)}>
      <span><span className="search-area-label">Search area</span><span>{label || 'Choose an area'}</span></span><Icon name="ChevronRight"/>
    </button>
    {open && layer?.host && createPortal(<SearchAreaSheet key={`${props.mode}:${binding.key}`} {...props} close={() => setOpen(false)}/>, layer.host)}
  </div>
}
function SearchAreaSheet({ mode, value, radiusMiles, disabled, save, close }: Props & { close: () => void }) {
  const current = useCurrent(), { activate } = useModalLayer()!
  const client = useMemo(() => searchLocationClient(current.session.access_token), [current.session.access_token])
  const [initial, setInitial] = useState<{ center: MapCenter; zoom: number; available: boolean } | null>(null)
  const [ready, setReady] = useState(false), [error, setError] = useState(''), [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<{ placeId: string; label: string }[]>([])
  const [searching, setSearching] = useState(false), [locating, setLocating] = useState(false), [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState<MapPreview | null>(null)
  const [label, setLabel] = useState(value.resolvedLocationRef ? value.source === 'temporary' ? value.areaLabel : current.account?.profile?.location_city || '' : '')
  const [retry, setRetry] = useState(0), [activeSuggestion, setActiveSuggestion] = useState(-1)
  const mapElement = useRef<HTMLDivElement>(null), map = useRef<SearchMap | null>(null)
  const backButton = useRef<HTMLButtonElement>(null)
  const session = useRef(crypto.randomUUID()), alive = useRef(true), savingRef = useRef(false), version = useRef(0)
  const operation = useRef<AbortController | null>(null), moveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const issued = useRef<{ payload: string; receipt: SearchLocationReceipt } | null>(null)
  const back = useRef(close)
  useLayoutEffect(() => { back.current = close }, [close])
  useEffect(() => activate(() => { if (!savingRef.current) back.current() }), [activate])
  useEffect(() => { const frame = requestAnimationFrame(() => backButton.current?.focus()); return () => cancelAnimationFrame(frame) }, [])
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false; operation.current?.abort(); if (moveTimer.current) clearTimeout(moveTimer.current) }
  }, [client])
  useEffect(() => {
    const controller = new AbortController(); let live = true
    void (async () => {
      const config = await client.mapConfig(controller.signal)
      let center = { latitude: 39.5, longitude: -98.35 }, zoom = 4
      if (config.available && value.resolvedLocationRef) {
        try { const saved = await client.mapSelection(mode, value.resolvedLocationRef, controller.signal); center = saved.center; zoom = 11; if (live) setLabel(saved.areaLabel) }
        catch { if (live) { setLabel(''); setError('Your previous area could not be loaded. Search for an area to confirm it again.') } }
      }
      if (live) { setInitial({ center, zoom, available: config.available }); if (!config.available) setError('Map search is not configured yet.') }
    })().catch(() => { if (live) setError('Map search is unavailable. Try again.') })
    return () => { live = false; controller.abort() }
  }, [client, mode, value.resolvedLocationRef, retry])

  const resolve = useCallback(async (request: MapPreviewRequest, recenter = false) => {
    if (savingRef.current) return
    const generation = ++version.current
    operation.current?.abort(); const controller = new AbortController(); operation.current = controller
    setPreview(null); setLocating(true); setError(''); issued.current = null
    try {
      const result = await client.preview(request, controller.signal)
      if (!alive.current || generation !== version.current) return
      setPreview(result); setLabel(result.areaLabel)
      if (recenter) map.current?.setCenter(result.center)
    } catch (failure) {
      if (alive.current && generation === version.current) { setLabel(''); setError(failure instanceof Error ? failure.message : 'Choose an area again.') }
    } finally { if (alive.current && generation === version.current) setLocating(false) }
  }, [client])
  const move = useCallback((center?: MapCenter) => {
    if (savingRef.current) return
    version.current++; operation.current?.abort(); setPreview(null); setLabel(''); setLocating(true); setSuggestions([])
    if (moveTimer.current) clearTimeout(moveTimer.current)
    if (center) moveTimer.current = setTimeout(() => void resolve({ kind: 'pin', mode, center, deviceAssisted: false }), 450)
  }, [mode, resolve])
  useEffect(() => {
    if (!initial?.available || !mapElement.current) return
    let live = true, instance: SearchMap | null = null
    void mountSearchMap(mapElement.current, { center: initial.center, zoom: initial.zoom, radiusMiles, onMoving: () => move(), onMove: center => move(center) }).then(result => {
      if (!live) { result.destroy(); return }
      instance = result; map.current = result; setReady(true)
    }).catch(failure => { if (live) setError(failure instanceof Error ? failure.message : 'The map could not load.') })
    return () => { live = false; instance?.destroy(); map.current = null }
  }, [initial, radiusMiles, move])
  useEffect(() => {
    if (query.trim().length < 2 || !ready || saving) return
    const controller = new AbortController(); let live = true
    const timer = setTimeout(() => {
      void client.suggestions({ mode, input: query.trim(), sessionToken: session.current }, controller.signal).then(result => {
        if (live) setSuggestions(result.suggestions)
      }).catch(failure => { if (live) setError(failure instanceof Error ? failure.message : 'Search is unavailable.') }).finally(() => { if (live) setSearching(false) })
    }, 300)
    return () => { live = false; clearTimeout(timer); controller.abort() }
  }, [client, mode, query, ready, saving])
  function select(placeId: string) {
    setSuggestions([]); setQuery(''); setSearching(false); setActiveSuggestion(-1)
    const token = session.current; session.current = crypto.randomUUID()
    void resolve({ kind: 'place', mode, placeId, sessionToken: token }, true)
  }
  async function currentLocation() {
    if (!current.account?.settings.location) { setError('Enable location access in Profile → Discovery before using your current location.'); return }
    const generation = ++version.current; operation.current?.abort(); if (moveTimer.current) clearTimeout(moveTimer.current)
    setPreview(null); setLocating(true); setError(''); setQuery('')
    try {
      const position = await new Promise<GeolocationPosition>((ok, fail) => navigator.geolocation.getCurrentPosition(ok, fail, { enableHighAccuracy: false, maximumAge: 0, timeout: 15000 }))
      if (!alive.current || generation !== version.current) return
      if (position.coords.accuracy > 1000 || Date.now() - position.timestamp > 5 * 60_000 || position.timestamp > Date.now() + 15000) throw new Error('Your location is too imprecise. Search for an area or move the map instead.')
      await resolve({ kind: 'pin', mode, center: { latitude: position.coords.latitude, longitude: position.coords.longitude }, deviceAssisted: true }, true)
    } catch (failure) {
      if (alive.current && generation === version.current) { setLocating(false); setError(failure instanceof Error && !('code' in failure) ? failure.message : 'Your device location is unavailable. Search for an area or move the map instead.') }
    }
  }
  async function confirm() {
    if (!preview || disabled || savingRef.current) return
    if (Date.parse(preview.expiresAt) <= Date.now() && !issued.current) { setPreview(null); setError('This preview expired. Move the map or choose the area again.'); return }
    savingRef.current = true; setSaving(true); setError('')
    try {
      const controller = new AbortController(); operation.current = controller
      const receipt = issued.current?.payload === preview.ticket.payload ? issued.current.receipt : await client.confirmMap(mode, preview.ticket, controller.signal)
      if (!alive.current) return
      issued.current = { payload: preview.ticket.payload, receipt }
      if (await save({ source: 'temporary', areaLabel: receipt.areaLabel, resolvedLocationRef: receipt.id })) back.current()
      else setError('The save could not be confirmed. Go back and reload saved preferences before trying again.')
    } catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : 'The search area could not be saved.') }
    finally { if (alive.current) { savingRef.current = false; setSaving(false) } }
  }
  return <section className="search-location-sheet" aria-label="Choose search area" aria-busy={saving}>
    <header className="row"><button ref={backButton} type="button" className="round" aria-label="Back to preferences" disabled={saving} onClick={close}><Icon name="Back"/></button><h2>Search area</h2></header>
    <div className="location-search-controls">
      <input type="search" role="combobox" aria-label="Search city or neighborhood" aria-expanded={suggestions.length > 0} aria-controls="location-suggestions" aria-autocomplete="list" aria-activedescendant={activeSuggestion >= 0 ? `location-suggestion-${activeSuggestion}` : undefined}
        placeholder="Search city or neighborhood" maxLength={120} value={query} disabled={!ready || saving} onChange={event => {
          version.current++; operation.current?.abort(); if (moveTimer.current) clearTimeout(moveTimer.current);
          setQuery(event.target.value); setSuggestions([]); setActiveSuggestion(-1); setSearching(event.target.value.trim().length >= 2); setPreview(null); setLocating(false); setError('');
        }}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setActiveSuggestion(index => Math.max(0, Math.min(suggestions.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))) }
          if (event.key === 'Enter') { event.preventDefault(); if (suggestions[activeSuggestion]) select(suggestions[activeSuggestion].placeId) }
          if (event.key === 'Escape' && suggestions.length) { event.preventDefault(); event.stopPropagation(); setSuggestions([]) }
        }}/>
      <button type="button" className="location-current" disabled={!ready || saving || locating || !navigator.geolocation} onClick={() => void currentLocation()}><Icon name="Location"/>Use my current location</button>
      {searching && <span role="status">Searching…</span>}
      {!searching && query.trim().length >= 2 && !suggestions.length && !error && <span role="status">No areas found.</span>}
      {!!suggestions.length && <ul id="location-suggestions" className="location-suggestions" role="listbox" aria-label="Areas">{suggestions.map((item, index) => <li key={item.placeId} id={`location-suggestion-${index}`} role="option" aria-selected={activeSuggestion === index}><button type="button" onClick={() => select(item.placeId)}>{item.label}</button></li>)}</ul>}
    </div>
    <div className="location-map-frame" inert={saving}>
      <div ref={mapElement} className="location-map" aria-label="Choose search area on map"/>
      {ready && <div className={`location-center-pin ${locating ? 'moving' : ''}`} aria-hidden="true"><Icon name="Location"/></div>}
      {!ready && !error && <p className="location-map-loading" role="status">Loading map…</p>}
    </div>
    <footer className="location-picker-footer">
      <p className="location-chosen" role="status">{locating ? 'Finding area…' : label || 'Choose an area'}</p>
      <ErrorMessage>{error}</ErrorMessage>
      {!current.account?.settings.location && error.includes('Enable location') && <Link to="/profile?section=discovery">Location settings</Link>}
      {!ready && error && <button type="button" className="btn light" onClick={() => { setError(''); setInitial(null); setReady(false); setRetry(count => count + 1) }}>Retry map</button>}
      <button type="button" className="btn" disabled={!preview || !ready || locating || saving || disabled} onClick={() => void confirm()}>{saving ? 'Saving…' : 'Set search area'}</button>
    </footer>
  </section>
}
