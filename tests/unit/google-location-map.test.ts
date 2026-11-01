import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); document.head.querySelectorAll('script').forEach(script => script.remove()); vi.resetModules() })

it('loads Google only when needed, suppresses programmatic movement and cleans up map listeners', async () => {
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'public-restricted-test-key')
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>()
  const emit = (event: string, ...args: unknown[]) => listeners.get(event)?.forEach(listener => listener(...args))
  let center = { lat: 40.7, lng: -73.9 }
  const removed = vi.fn(), setCircle = vi.fn(), clearInstanceListeners = vi.fn(), setZoom = vi.fn()
  class FakeMap {
    getCenter() { return { lat: () => center.lat, lng: () => center.lng } }
    setCenter(next: typeof center) { center = next; emit('center_changed') }
    panTo(next: typeof center) { this.setCenter(next) }
    setZoom = setZoom
    addListener(name: string, listener: (...args: unknown[]) => void) {
      const group = listeners.get(name) ?? new Set(); group.add(listener); listeners.set(name, group)
      return { remove() { group.delete(listener); removed() } }
    }
  }
  class FakeCircle { setCenter = vi.fn(); setMap = setCircle }
  vi.stubGlobal('google', { maps: { Map: FakeMap, Circle: FakeCircle, event: { clearInstanceListeners } } })
  const { mountSearchMap } = await import('../../src/features/matchmaking/google-location-map')
  expect(document.head.querySelector('script')).toBeNull()
  const onMove = vi.fn(), onMoving = vi.fn(), element = document.createElement('div')
  const mounted = mountSearchMap(element, { center: { latitude: center.lat, longitude: center.lng }, radiusMiles: 15, onMove, onMoving })
  expect(document.head.querySelector('script')?.src).toContain('maps.googleapis.com/maps/api/js')
  ;(window as unknown as { __pebbleMapsReady: () => void }).__pebbleMapsReady()
  const map = await mounted
  emit('idle')
  expect(onMove).not.toHaveBeenCalled()
  map.setCenter({ latitude: 41, longitude: -74 }); emit('idle')
  expect(onMove).not.toHaveBeenCalled()
  expect(setZoom).toHaveBeenCalledWith(12)
  emit('dragstart'); center = { lat: 42, lng: -75 }; emit('center_changed'); emit('idle')
  expect(onMoving).toHaveBeenCalled()
  expect(onMove).toHaveBeenCalledWith({ latitude: 42, longitude: -75 })
  map.destroy()
  expect(removed).toHaveBeenCalledTimes(4)
  expect(setCircle).toHaveBeenCalledWith(null)
  expect(clearInstanceListeners).toHaveBeenCalled()
})

it('reports missing configuration or script failure without pretending a map loaded', async () => {
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '')
  const first = await import('../../src/features/matchmaking/google-location-map')
  await expect(first.loadGoogleMaps()).rejects.toThrow('not configured')
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'restricted-test-key')
  const pending = first.loadGoogleMaps()
  document.head.querySelector('script')!.dispatchEvent(new Event('error'))
  await expect(pending).rejects.toThrow('could not load')
  expect(document.head.querySelector('script')).toBeNull()
})
