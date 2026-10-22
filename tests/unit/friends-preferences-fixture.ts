import { vi } from 'vitest'
import { SaveFriendsSearchPreferencesSchema, type FriendsSearchPreferences, type SaveFriendsSearchPreferences } from '../../shared/friends-search-preferences'

export function friendsPreferencesFixture() {
  const state = { stored: { revision: 0, preferences: null } as FriendsSearchPreferences,
    onRead: null as (() => Promise<Response>) | null, onWrite: null as ((value: SaveFriendsSearchPreferences) => Promise<Response>) | null,
    calls: [] as { method: string; token: string | null; body: SaveFriendsSearchPreferences | null }[] }
  function commit(value: SaveFriendsSearchPreferences) { state.stored = { revision: value.expectedRevision + 1, preferences: structuredClone(value.preferences) } }
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === '/api/matchmaking/friends-search-preferences/runtime') return Response.json({ error: 'Active matcher unavailable in this fixture.' }, { status: 503 })
    if (String(input).startsWith('/api/matchmaking/search-locations/')) return Response.json({ error: 'No location resolution in this fixture.' }, { status: 404 })
    if (String(input) !== '/api/matchmaking/friends-search-preferences') throw new Error('Unexpected request in isolated Friends preference test')
    const method = init?.method ?? 'GET', body = init?.body ? SaveFriendsSearchPreferencesSchema.parse(JSON.parse(String(init.body))) : null
    state.calls.push({ method, token: new Headers(init?.headers).get('Authorization'), body })
    if (method === 'GET') return state.onRead ? state.onRead() : Response.json(state.stored)
    if (state.onWrite) return state.onWrite(body!)
    if (body!.expectedRevision !== state.stored.revision) return Response.json({ code: 'conflict', error: 'Friends choices changed.' }, { status: 409 })
    commit(body!); return Response.json(state.stored)
  })
  vi.stubGlobal('fetch', fetch)
  return { state, fetch, commit, puts: () => state.calls.filter(call => call.method === 'PUT'), gets: () => state.calls.filter(call => call.method === 'GET') }
}
export function deferredFriendsResponse() {
  let resolve!: (response: Response) => void
  return { promise: new Promise<Response>(done => { resolve = done }), resolve: (response: Response) => resolve(response) }
}
