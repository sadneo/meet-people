import { afterEach, expect, it, vi } from 'vitest'
import { friendsPreferencesClient } from '../src/features/matchmaking/friends-preferences-client'
import { friendsPreferenceDraft, friendsDraftWrite } from '../src/features/matchmaking/friends-preferences-draft'
import { friendsPreferencesFixture } from './friends-preferences-fixture'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
it('keeps revision-zero/null unknown, explicitly maps an independent draft and sends only its CAS resource', async () => {
  const fixture = friendsPreferencesFixture(), client = friendsPreferencesClient('captured-token'), initial = await client.read()
  expect(initial).toEqual({ revision: 0, preferences: null }); expect(fixture.puts()).toHaveLength(0)
  const draft = friendsPreferenceDraft(initial)
  expect(draft.options.goals).toEqual([]) // never legacy account intents
  const write = friendsDraftWrite(initial, draft.filters, { ...draft.options, goals: [' Exact\nGoal 🪨 '] })
  expect((await client.save(write)).preferences?.goals).toEqual([' Exact\nGoal 🪨 '])
  expect(fixture.puts()[0]).toEqual({ method: 'PUT', token: 'Bearer captured-token', body: write })
  expect(fixture.fetch).toHaveBeenLastCalledWith('/api/matchmaking/friends-search-preferences', expect.objectContaining({ method: 'PUT', cache: 'no-store' }))
})
it('preserves exact labels and unchanged references but clears changed source/label/home or explicitly invalidated refs', () => {
  const fixture = friendsPreferencesFixture(), reference = 'a0000000-0000-4000-8000-000000000001'
  fixture.state.stored = { revision: 3, preferences: { ageMin: 25, ageMax: 25, radiusMiles: 100, goals: ['🪨'.repeat(100), 'Coffee', 'coffee'], searchArea: { source: 'temporary', areaLabel: ' Campus ', resolvedLocationRef: reference } } }
  let draft = friendsPreferenceDraft(fixture.state.stored)
  expect(friendsDraftWrite(fixture.state.stored, draft.filters, draft.options).preferences).toEqual(fixture.state.stored.preferences)
  expect(friendsDraftWrite(fixture.state.stored, draft.filters, { ...draft.options, area: 'Other' }).preferences.searchArea.resolvedLocationRef).toBeNull()
  expect(friendsDraftWrite(fixture.state.stored, draft.filters, { ...draft.options, source: 'home' }).preferences.searchArea.resolvedLocationRef).toBeNull()
  expect(friendsDraftWrite(fixture.state.stored, draft.filters, draft.options, true).preferences.searchArea.resolvedLocationRef).toBeNull()
  fixture.state.stored.preferences!.searchArea = { source: 'home', resolvedLocationRef: reference }
  draft = friendsPreferenceDraft(fixture.state.stored)
  expect(friendsDraftWrite(fixture.state.stored, draft.filters, draft.options, true).preferences.searchArea.resolvedLocationRef).toBeNull()
})
it('rejects malformed/partial/global payloads before transport and does not retry conflicts or malformed success', async () => {
  const fixture = friendsPreferencesFixture(), client = friendsPreferencesClient('owner'), draft = friendsPreferenceDraft(fixture.state.stored), write = friendsDraftWrite(fixture.state.stored, draft.filters, draft.options)
  await expect(client.save({ ...write, expectedRevision: -1 })).rejects.toMatchObject({ code: 'invalid' })
  await expect(client.save({ ...write, preferences: { ...write.preferences, profile: {} } } as never)).rejects.toMatchObject({ code: 'invalid' })
  expect(fixture.fetch).not.toHaveBeenCalled()
  fixture.state.onWrite = async () => Response.json({ code: 'conflict', error: 'Changed.' }, { status: 409 })
  await expect(client.save(write)).rejects.toMatchObject({ code: 'conflict' })
  fixture.state.onWrite = async () => Response.json({ revision: 1, preferences: null })
  await expect(client.save(write)).rejects.toMatchObject({ code: 'malformed' })
  expect(fixture.puts()).toHaveLength(2)
})
it('keeps the transport deadline through JSON consumption without retrying writes', async () => {
  vi.useFakeTimers()
  const fixture = friendsPreferencesFixture(), draft = friendsPreferenceDraft(fixture.state.stored)
  const fetch = vi.fn(async (_input: unknown, init?: RequestInit) => ({ ok: true, status: 200, json: () => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')), { once: true })) }))
  vi.stubGlobal('fetch', fetch)
  const result = expect(friendsPreferencesClient('owner').save(friendsDraftWrite(fixture.state.stored, draft.filters, draft.options))).rejects.toMatchObject({ code: 'provider' })
  await vi.advanceTimersByTimeAsync(15000); await result
  expect(fetch).toHaveBeenCalledTimes(1)
})
