/// <reference types="google.maps" />
import type { MapCenter } from '../../../shared/location-picker'

let loading: Promise<typeof google.maps> | null = null
export function loadGoogleMaps(): Promise<typeof google.maps> {
  if (loading) return loading
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined
  if (!key) return Promise.reject(new Error('The map is not configured yet.'))
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    const name = '__pebbleMapsReady'
    const callbacks = window as unknown as Record<string, unknown>
    const fail = () => { delete callbacks[name]; script.remove(); loading = null; reject(new Error('The map could not load. Check your connection and try again.')) }
    const timeout = window.setTimeout(fail, 15000)
    callbacks[name] = () => { clearTimeout(timeout); delete callbacks[name]; resolve(google.maps) }
    script.src = `https://maps.googleapis.com/maps/api/js?${new URLSearchParams({ key, v: 'quarterly', loading: 'async', callback: name })}`
    script.async = true
    script.onerror = () => { clearTimeout(timeout); fail() }
    document.head.append(script)
  })
  return loading
}
export type SearchMap = { setCenter: (center: MapCenter) => void; destroy: () => void }
export async function mountSearchMap(element: HTMLElement, options: { center: MapCenter; zoom?: number; radiusMiles: number; onMoving: () => void; onMove: (center: MapCenter) => void }): Promise<SearchMap> {
  const maps = await loadGoogleMaps()
  const point = (center: MapCenter) => ({ lat: center.latitude, lng: center.longitude })
  const map = new maps.Map(element, { center: point(options.center), zoom: options.zoom ?? 11, keyboardShortcuts: true, clickableIcons: false,
    mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
    styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }, { featureType: 'transit', stylers: [{ visibility: 'off' }] }] })
  const circle = new maps.Circle({ map, center: point(options.center), radius: options.radiusMiles * 1609.344,
    fillColor: '#9d503d', fillOpacity: 0.055, strokeColor: '#9d503d', strokeOpacity: 0.35, strokeWeight: 1, clickable: false })
  let programmatic = true, changed = false
  const listeners = [
    map.addListener('dragstart', () => { programmatic = false; options.onMoving() }),
    map.addListener('center_changed', () => { changed = true; circle.setCenter(map.getCenter()!); if (!programmatic) options.onMoving() }),
    map.addListener('idle', () => {
      if (changed && !programmatic) { const center = map.getCenter()!; options.onMove({ latitude: center.lat(), longitude: center.lng() }) }
      changed = false; programmatic = false
    }),
    map.addListener('click', (event: google.maps.MapMouseEvent) => { if (event.latLng) { programmatic = false; options.onMoving(); map.panTo(event.latLng) } }),
  ]
  return {
    setCenter(center) { programmatic = true; map.setCenter(point(center)); map.setZoom(12) },
    destroy() { listeners.forEach(listener => listener.remove()); circle.setMap(null); maps.event.clearInstanceListeners(map); element.replaceChildren() },
  }
}
