import { afterEach, expect, it, vi } from 'vitest'
import { datingAggregateClient } from '../../src/features/matchmaking/dating-aggregate-client'
import { datingAggregateDraft, datingDraftWrite } from '../../src/features/matchmaking/dating-aggregate-draft'
import { datingUiFixture, enabledDatingSnapshot } from './dating-ui-fixture'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
it('captures actor token, reads strict state and writes only a disabled complete aggregate with both revisions', async () => {
  const fixture = datingUiFixture(), client = datingAggregateClient('captured-token')
  const initial = await client.read(), draft = datingAggregateDraft(initial)
  expect(draft.profile.showHeight).toBe(false)
  draft.profile.feet = '5'; draft.profile.inches = '0'
  const write = datingDraftWrite(initial, draft.filters, draft.profile, draft.options)
  expect((await client.save(write)).profile.heightInches).toBe(60)
  expect(fixture.puts()[0]).toEqual({ method: 'PUT', token: 'Bearer captured-token', body: write })
  expect(fixture.fetch).toHaveBeenLastCalledWith('/api/matchmaking/dating-preferences', expect.objectContaining({ cache: 'no-store', method: 'PUT' }))
})
it('preserves custom labels/targets and exact temporary text, clearing stale or edited location references', () => {
  const fixture = datingUiFixture(), initial = fixture.state.stored
  initial.profileRevision = initial.searchRevision = 3
  initial.profile = { ...initial.profile, gender: '🪨'.repeat(100), sexuality: 'Legacy sexuality', heightInches: 60, clarifiedTargets: ['Custom target'] }
  initial.search = { ageMin: 21, ageMax: 40, radiusMiles: 10, searchArea: { source: 'temporary', areaLabel: ' Campus ', resolvedLocationRef: 'a0000000-0000-4000-8000-000000000001' } }
  initial.eligibility.locationResolved = true
  const draft = datingAggregateDraft(initial), write = datingDraftWrite(initial, draft.filters, draft.profile, draft.options)
  expect(write.profile).toEqual(initial.profile); expect(write.search).toEqual(initial.search)
  expect(datingDraftWrite(initial, draft.filters, draft.profile, { ...draft.options, area: 'New area' }).search?.searchArea.resolvedLocationRef).toBeNull()
  initial.eligibility.locationResolved = false
  expect(datingDraftWrite(initial, draft.filters, draft.profile, draft.options).search?.searchArea.resolvedLocationRef).toBeNull()
  initial.eligibility.locationResolved = true
  initial.search.searchArea = { source: 'home', resolvedLocationRef: 'a0000000-0000-4000-8000-000000000001' }
  const home = datingAggregateDraft(initial)
  expect(datingDraftWrite(initial, home.filters, home.profile, home.options, true).search?.searchArea.resolvedLocationRef).toBeNull()
  expect(datingDraftWrite(initial, home.filters, home.profile, home.options, false).search?.searchArea.resolvedLocationRef).toBe('a0000000-0000-4000-8000-000000000001')
})
it('rejects enabled/partial input before transport, distinguishes conflicts and never retries malformed partial saves', async () => {
  const fixture = datingUiFixture(), client = datingAggregateClient('owner'), initial = fixture.state.stored, draft = datingAggregateDraft(initial)
  const write = datingDraftWrite(initial, draft.filters, draft.profile, draft.options)
  await expect(client.save({ ...write, expectedSearchRevision: -1 })).rejects.toMatchObject({ code: 'invalid' })
  await expect(client.save({ ...write, profile: { ...write.profile, enabled: true } })).rejects.toMatchObject({ code: 'invalid' })
  expect(fixture.fetch).not.toHaveBeenCalled()
  fixture.state.onWrite = async () => Response.json({ code: 'conflict', error: 'Changed.' }, { status: 409 })
  await expect(client.save(write)).rejects.toMatchObject({ code: 'conflict' })
  fixture.state.onWrite = async () => Response.json({ ...initial, profileRevision: 1 })
  await expect(client.save(write)).rejects.toMatchObject({ code: 'malformed' })
  expect(fixture.puts()).toHaveLength(2)
})
it('keeps its deadline through body consumption without retrying a PUT', async () => {
  vi.useFakeTimers()
  const fixture = datingUiFixture(), initial = fixture.state.stored, draft = datingAggregateDraft(initial)
  const fetch = vi.fn(async (_input: unknown, init?: RequestInit) => ({ ok: true, status: 200, json: () => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')), { once: true })) }))
  vi.stubGlobal('fetch', fetch)
  const result = expect(datingAggregateClient('owner').save(datingDraftWrite(initial, draft.filters, draft.profile, draft.options))).rejects.toMatchObject({ code: 'provider' })
  await vi.advanceTimersByTimeAsync(15000); await result
  expect(fetch).toHaveBeenCalledTimes(1)
})
it('reads enabled consent without rewriting it and refuses to map ordinary edits into a disabling draft', async () => {
  const fixture = datingUiFixture(); fixture.state.stored = enabledDatingSnapshot()
  const baseline = await datingAggregateClient('owner').read(), draft = datingAggregateDraft(baseline)
  expect(baseline.profile.enabled).toBe(true)
  expect(draft.profile.inches).toBe('0')
  expect(() => datingDraftWrite(baseline, { ...draft.filters, distance: 15 }, { ...draft.profile, showGender: true }, draft.options)).toThrow(/enabled consent/i)
  expect(fixture.state.stored).toEqual(enabledDatingSnapshot())
  expect(fixture.puts()).toHaveLength(0)
})
