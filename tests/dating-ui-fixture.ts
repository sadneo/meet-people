import { vi } from 'vitest'
import { emptyDatingProfile, SaveDatingAggregateSchema, validDatingTransition, type DatingAggregate, type SaveDatingAggregate } from '../shared/dating'

export function datingUiFixture() {
  const state = {
    stored: { profileRevision: 0, searchRevision: 0, profile: emptyDatingProfile(), search: null, eligibility: { asOf: '2026-10-19', adult: true, locationResolved: false }, effectiveEnabled: false } as DatingAggregate,
    onRead: null as (() => Promise<Response>) | null,
    onWrite: null as ((value: SaveDatingAggregate) => Promise<Response>) | null,
    calls: [] as { method: string; token: string | null; body: SaveDatingAggregate | null }[],
  }
  function commit(value: SaveDatingAggregate) {
    state.stored = { ...state.stored, profileRevision: value.expectedProfileRevision + 1, searchRevision: value.expectedSearchRevision + 1, profile: value.profile, search: value.search, effectiveEnabled: false }
  }
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) !== '/api/matchmaking/dating-preferences') throw new Error('Unexpected request in isolated Dating UI fixture')
    const method = init?.method ?? 'GET', body = init?.body ? SaveDatingAggregateSchema.parse(JSON.parse(String(init.body))) : null
    state.calls.push({ method, token: new Headers(init?.headers).get('Authorization'), body })
    if (method === 'GET') return state.onRead ? state.onRead() : Response.json(state.stored)
    if (state.onWrite) return state.onWrite(body!)
    if (body!.expectedProfileRevision !== state.stored.profileRevision || body!.expectedSearchRevision !== state.stored.searchRevision) return Response.json({ code: 'conflict', error: 'Aggregate changed.' }, { status: 409 })
    if (!validDatingTransition(state.stored.profile, body!.profile)) return Response.json({ code: 'invalid', error: 'Clear clarification.' }, { status: 400 })
    commit(body!)
    return Response.json(state.stored)
  })
  vi.stubGlobal('fetch', fetch)
  return { state, fetch, commit, puts: () => state.calls.filter(call => call.method === 'PUT'), gets: () => state.calls.filter(call => call.method === 'GET') }
}
export function deferredDatingResponse() {
  let resolve!: (response: Response) => void
  return { promise: new Promise<Response>(done => { resolve = done }), resolve: (response: Response) => resolve(response) }
}
export function enabledDatingSnapshot(): DatingAggregate {
  return {
    profileRevision: 4, searchRevision: 4,
    profile: { ...emptyDatingProfile(), gender: 'Woman', sexuality: 'Straight', intent: 'Long-term relationship', style: 'Monogamy', heightInches: 60, enabled: true },
    search: { ageMin: 21, ageMax: 40, radiusMiles: 10, searchArea: { source: 'home', resolvedLocationRef: 'a0000000-0000-4000-8000-000000000001' } },
    eligibility: { asOf: '2026-10-19', adult: true, locationResolved: true }, effectiveEnabled: true,
  }
}
