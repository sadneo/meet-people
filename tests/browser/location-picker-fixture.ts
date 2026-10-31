import type { Page } from '@playwright/test'
import type { MapCenter, MapTicket } from '../../shared/location-picker'

// Explicit browser-only renderer/API double. No runtime key, map or auth bypass.
export async function mockLocationPicker(page: Page, options: { available?: boolean } = {}) {
  type Body = { input?: string; kind?: string; mode?: string; center?: MapCenter; ticket?: MapTicket; deviceAssisted?: boolean }
  const calls: { path: string; body: Body }[] = []
  const receipts = new Map<string, object>()
  await page.route('**/src/features/matchmaking/google-location-map.ts', route => route.fulfill({ contentType: 'application/javascript', body: `
    export async function mountSearchMap(element, options) {
      element.textContent = 'Synthetic map (browser test)';
      element.dataset.center = JSON.stringify(options.center);
      window.__moveTestMap = center => { options.onMoving(); options.onMove(center); };
      return { setCenter(center) { element.dataset.center = JSON.stringify(center); }, destroy() { element.replaceChildren(); delete window.__moveTestMap; } };
    }
  ` }))
  await page.route('**/api/matchmaking/search-locations/**', async route => {
    const path = new URL(route.request().url()).pathname, body = (route.request().postDataJSON() ?? {}) as Body
    calls.push({ path, body })
    const reply = (json: unknown, status = 200) => route.fulfill({ json, status })
    if (path.endsWith('/map/config')) return reply({ available: options.available !== false })
    if (path.endsWith('/map/suggestions')) return reply({ suggestions: [{ placeId: body.input?.includes('Upper') ? 'upper-manhattan' : 'brooklyn', label: body.input?.includes('Upper') ? 'Upper Manhattan, NY' : 'Brooklyn, NY' }] })
    if (path.endsWith('/map/preview')) {
      const areaLabel = body.kind === 'place' && body.placeId === 'upper-manhattan' ? 'Upper Manhattan, NY' : 'Brooklyn, NY'
      const center = body.center ?? { latitude: 40.7, longitude: -73.9 }
      return reply({ center, areaLabel, expiresAt: '2099-01-01T00:00:00Z', ticket: { payload: JSON.stringify({ mode: body.mode, areaLabel, center }), signature: 'a'.repeat(64) } })
    }
    if (path.endsWith('/map/confirm')) {
      const claims = JSON.parse(body.ticket!.payload)
      const id = body.mode === 'friends' ? 'f1000000-0000-4000-8000-000000000001' : 'f2000000-0000-4000-8000-000000000001'
      const receipt = { id, mode: body.mode, source: 'temporary', areaLabel: claims.areaLabel, method: 'selected-area', expiresAt: '2099-01-01T00:00:00Z', usable: true }
      receipts.set(id, receipt)
      return reply(receipt)
    }
    if (/\/map\/(friends|dating)\//.test(path)) return reply({ center: { latitude: 40.7, longitude: -73.9 }, areaLabel: 'Brooklyn, NY', usable: true })
    const saved = receipts.get(path.split('/').pop()!)
    if (saved) return reply(saved)
    return route.fallback()
  })
  return { calls }
}
