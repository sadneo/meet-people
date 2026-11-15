/// <reference types="google.maps" />
import type { MapCenter } from '../../../shared/location-picker'

let loading: Promise<typeof google.maps> | null = null
let authorizationError: Error | null = null
const authorizationListeners = new Set<(failure: Error) => void>()
export function loadGoogleMaps(): Promise<typeof google.maps> {
  // A rejected SDK mutates its Map constructor. Do not instantiate it again in
  // this document; the app must reload after its key restrictions are corrected.
  if (authorizationError) return Promise.reject(authorizationError)
  if (loading) return loading
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined
  if (!key) return Promise.reject(new Error('The map is not configured yet.'))
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    const name = '__pebbleMapsReady'
    const callbacks = window as unknown as Record<string, unknown>
    const fail = () => { delete callbacks[name]; script.remove(); loading = null; reject(new Error('The map could not load. Check your connection and try again.')) }
    const timeout = window.setTimeout(fail, 15000)
    callbacks.gm_authFailure = () => {
      clearTimeout(timeout)
      delete callbacks[name]
      authorizationError = new Error('The map could not be authorized. Reopen the app after its map configuration is updated.')
      reject(authorizationError)
      for (const notify of authorizationListeners) notify(authorizationError)
    }
    callbacks[name] = () => { clearTimeout(timeout); delete callbacks[name]; resolve(google.maps) }
    script.src = `https://maps.googleapis.com/maps/api/js?${new URLSearchParams({ key, v: 'quarterly', loading: 'async', callback: name })}`
    script.async = true
    script.onerror = () => { clearTimeout(timeout); fail() }
    document.head.append(script)
  })
  return loading
}
export type SearchMap = { setCenter: (center: MapCenter) => void; destroy: () => void }
export async function mountSearchMap(element: HTMLElement, options: { center: MapCenter; zoom?: number; radiusMiles: number; onMoving: () => void; onMove: (center: MapCenter) => void; signal?: AbortSignal; onError?: (failure: Error) => void }): Promise<SearchMap> {
  if (options.signal?.aborted) throw new DOMException('Map closed', 'AbortError')
  const maps = await loadGoogleMaps()
  // The SDK may finish after Back removed the sheet, including StrictMode cleanup.
  if (options.signal?.aborted) throw new DOMException('Map closed', 'AbortError')
  const point = (center: MapCenter) => ({ lat: center.latitude, lng: center.longitude })
  const map = new maps.Map(element, { center: point(options.center), zoom: options.zoom ?? 11, keyboardShortcuts: true, clickableIcons: false,
    mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
    styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }, { featureType: 'transit', stylers: [{ visibility: 'off' }] }] })
  if (authorizationError) throw authorizationError
  const circle = new maps.Circle({ map, center: point(options.center), radius: options.radiusMiles * 1609.344,
    fillColor: '#9d503d', fillOpacity: 0.055, strokeColor: '#9d503d', strokeOpacity: 0.35, strokeWeight: 1, clickable: false })
  let programmatic = true, changed = false, destroyed = false
  const listeners = [
    map.addListener('dragstart', () => { if (destroyed) return; programmatic = false; options.onMoving() }),
    map.addListener('center_changed', () => { if (destroyed) return; changed = true; circle.setCenter(map.getCenter()!); if (!programmatic) options.onMoving() }),
    map.addListener('idle', () => {
      if (destroyed) return
      if (changed && !programmatic) { const center = map.getCenter()!; options.onMove({ latitude: center.lat(), longitude: center.lng() }) }
      changed = false; programmatic = false
    }),
    map.addListener('click', (event: google.maps.MapMouseEvent) => { if (!destroyed && event.latLng) { programmatic = false; options.onMoving(); map.panTo(event.latLng) } }),
  ]
  const onAuthorizationFailure = (failure: Error) => { if (!destroyed) options.onError?.(failure) }
  authorizationListeners.add(onAuthorizationFailure)
  return {
    setCenter(center) { if (destroyed) return; programmatic = true; map.setCenter(point(center)); map.setZoom(12) },
    destroy() {
      if (destroyed) return
      destroyed = true
      authorizationListeners.delete(onAuthorizationFailure)
      // Google's failed/auth-rejected map can return missing or already-disposed
      // handles. Vendor cleanup must never throw through React's unmount phase.
      for (const listener of listeners) try { listener?.remove() } catch { /* Continue releasing the other handles. */ }
      try { circle.setMap(null) } catch { /* The failed map may already be disposed. */ }
      try { maps.event.clearInstanceListeners(map) } catch { /* Best-effort vendor cleanup. */ }
      element.replaceChildren()
    },
  }
}
