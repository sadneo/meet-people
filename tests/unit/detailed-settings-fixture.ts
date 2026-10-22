import { vi } from 'vitest'
import { emptyDetailedSettings, effectiveDetailedSettings, SaveDetailedSettingsSchema, type DetailedSettings, type SaveDetailedSettings } from '../../shared/detailed-settings'

export function detailedSettingsFixture() {
  const state = {
    stored: { revision: 0, settings: emptyDetailedSettings() },
    masters: { notifications: true, discoverable: true } as DetailedSettings['masters'],
    onRead: null as (() => Promise<Response>) | null,
    onWrite: null as ((value: SaveDetailedSettings) => Promise<Response>) | null,
    calls: [] as { method: string; token: string | null; body: SaveDetailedSettings | null }[],
  }
  const snapshot = (): DetailedSettings => ({ ...state.stored, masters: state.masters, effective: effectiveDetailedSettings(state.stored.settings, state.masters) })
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) !== '/api/matchmaking/detailed-settings') throw new Error('Unexpected network request in isolated detailed Settings test')
    const method = init?.method ?? 'GET', body = init?.body ? SaveDetailedSettingsSchema.parse(JSON.parse(String(init.body))) : null
    state.calls.push({ method, token: new Headers(init?.headers).get('Authorization'), body })
    if (method === 'GET') return state.onRead ? state.onRead() : Response.json(snapshot())
    if (state.onWrite) return state.onWrite(body!)
    if (body!.expectedRevision !== state.stored.revision) return Response.json({ code: 'conflict', error: 'Settings changed.' }, { status: 409 })
    state.stored = { revision: state.stored.revision + 1, settings: body!.settings }
    return Response.json(snapshot())
  })
  vi.stubGlobal('fetch', fetch)
  return { state, snapshot, fetch, puts: () => state.calls.filter(value => value.method === 'PUT'), gets: () => state.calls.filter(value => value.method === 'GET') }
}
export function deferredSettingsResponse() {
  let resolve!: (value: Response) => void
  return { promise: new Promise<Response>(done => { resolve = done }), resolve: (value: Response) => resolve(value) }
}
