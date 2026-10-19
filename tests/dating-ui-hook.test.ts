import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { useLayoutEffect } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useDatingPreferences } from '../src/features/matchmaking/useDatingPreferences'
import { datingAggregateDraft, datingDraftWrite } from '../src/features/matchmaking/dating-aggregate-draft'
import { datingUiFixture, deferredDatingResponse, enabledDatingSnapshot } from './dating-ui-fixture'

let fixture: ReturnType<typeof datingUiFixture>
beforeEach(() => { fixture = datingUiFixture() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
async function load() {
  const hook = renderHook(({ owner, token }) => useDatingPreferences(owner, token), { initialProps: { owner: 'first', token: 'first-token' } })
  await waitFor(() => expect(hook.result.current.canWrite).toBe(true))
  return hook
}
function write() {
  const draft = datingAggregateDraft(fixture.state.stored)
  return datingDraftWrite(fixture.state.stored, draft.filters, { ...draft.profile, feet: '5', inches: '0' }, draft.options)
}
it.each(['profile', 'search', 'disconnect', 'readback'])('retained callbacks cannot bypass %s conflict/uncertainty or failed reconciliation', async kind => {
  const hook = await load(), retained = hook.result.current.save, value = write()
  if (kind === 'profile' || kind === 'search') {
    // Both resources exist; one independent revision diverges.
    fixture.state.stored.profileRevision = kind === 'profile' ? 2 : 1
    fixture.state.stored.searchRevision = kind === 'search' ? 2 : 1
  } else if (kind === 'disconnect') fixture.state.onWrite = async value => { fixture.commit(value); throw new TypeError('Disconnected') }
  else fixture.state.onRead = async () => Response.json({ code: 'unavailable', error: 'Failed GET' }, { status: 503 })
  await act(async () => { expect(await retained(value)).toBeNull() })
  await act(async () => { expect(await retained(value)).toBeNull() })
  expect(fixture.puts()).toHaveLength(1); expect(hook.result.current.reconcileRequired).toBe(true)
  fixture.state.onRead = async () => Response.json(null)
  await act(async () => { expect(await hook.result.current.reload()).toBeNull() })
  hook.rerender({ owner: 'first', token: 'second-token' }); hook.rerender({ owner: 'first', token: 'third-token' })
  expect(hook.result.current.canWrite).toBe(false); expect(hook.result.current.reconcileRequired).toBe(true)
  fixture.state.onRead = null; fixture.state.onWrite = null
  await act(async () => { await hook.result.current.reload() })
  expect(hook.result.current.canWrite).toBe(true)
  expect(await retained(write())).toBeNull() // old-session callback remains invalid
  await act(async () => { expect(await hook.result.current.save(write())).not.toBeNull() })
  expect(fixture.puts()).toHaveLength(2)
})
it('holds synchronous duplicate locks through canonical GET, then accepts independently changed eligibility', async () => {
  const hook = await load(), response = deferredDatingResponse(), value = write()
  fixture.state.onRead = () => response.promise
  let pending!: ReturnType<typeof hook.result.current.save>
  act(() => { pending = hook.result.current.save(value) })
  await waitFor(() => expect(fixture.gets()).toHaveLength(2))
  expect(await hook.result.current.save(value)).toBeNull()
  fixture.state.stored.eligibility.adult = false
  await act(async () => { response.resolve(Response.json(fixture.state.stored)); expect(await pending).toMatchObject({ eligibility: { adult: false }, profile: { enabled: false } }) })
  expect(fixture.puts()).toHaveLength(1)
})
it('retains an interrupted save gate across repeated same-owner token refreshes and fences late completion', async () => {
  const hook = await load(), response = deferredDatingResponse(), value = write()
  fixture.state.onWrite = () => response.promise
  let pending!: ReturnType<typeof hook.result.current.save>
  act(() => { pending = hook.result.current.save(value) })
  await waitFor(() => expect(fixture.puts()).toHaveLength(1))
  hook.rerender({ owner: 'first', token: 'second-token' }); hook.rerender({ owner: 'first', token: 'third-token' })
  expect(hook.result.current.reconcileRequired).toBe(true); expect(fixture.gets()).toHaveLength(1)
  fixture.commit(value)
  await act(async () => { response.resolve(Response.json(fixture.state.stored)); expect(await pending).toBeNull() })
  expect(fixture.gets()).toHaveLength(1)
  await act(async () => { await hook.result.current.reload() })
  expect(hook.result.current.snapshot?.profile.heightInches).toBe(60)
})
it.each(['token', 'owner', 'busy'])('fences retained saves in a %s render before passive cleanup', async change => {
  let retained: ReturnType<typeof useDatingPreferences>['save'] | undefined, pending: Promise<unknown> | undefined
  const hook = renderHook(({ owner, token, busy, invoke }) => {
    const resource = useDatingPreferences(owner, token, busy)
    useLayoutEffect(() => { if (invoke) pending = retained!(write()) }, [invoke])
    return resource
  }, { initialProps: { owner: 'first', token: 'first-token', busy: false, invoke: false } })
  await waitFor(() => expect(hook.result.current.canWrite).toBe(true)); retained = hook.result.current.save
  hook.rerender({ owner: change === 'owner' ? 'second' : 'first', token: change === 'token' ? 'new-token' : 'first-token', busy: change === 'busy', invoke: true })
  await act(async () => { expect(await pending).toBeNull() })
  expect(fixture.puts()).toHaveLength(0)
})
it('fences old-owner read/save completions and all callbacks after unmount', async () => {
  const hook = await load(), response = deferredDatingResponse(), retained = hook.result.current.save, value = write()
  fixture.state.onWrite = () => response.promise
  let pending!: ReturnType<typeof retained>
  act(() => { pending = retained(value) })
  hook.rerender({ owner: 'second', token: 'second-token' })
  await waitFor(() => expect(hook.result.current.canWrite).toBe(true))
  const old = { ...fixture.state.stored, profileRevision: 1, searchRevision: 1, profile: value.profile, search: value.search }
  await act(async () => { response.resolve(Response.json(old)); expect(await pending).toBeNull() })
  expect(fixture.gets().filter(call => call.token === 'Bearer first-token')).toHaveLength(1)
  const current = hook.result.current.save, calls = fixture.state.calls.length
  hook.unmount()
  expect(await current(value)).toBeNull(); expect(await retained(value)).toBeNull()
  expect(fixture.state.calls).toHaveLength(calls)
})
it('never publishes a late initial owner GET into a replacement account', async () => {
  const response = deferredDatingResponse(), old = structuredClone(fixture.state.stored)
  fixture.state.onRead = () => response.promise
  const hook = renderHook(({ owner, token }) => useDatingPreferences(owner, token), { initialProps: { owner: 'first', token: 'first-token' } })
  await waitFor(() => expect(fixture.gets()).toHaveLength(1))
  fixture.state.onRead = null
  fixture.state.stored = { ...old, profileRevision: 2, searchRevision: 2, profile: { ...old.profile, gender: 'Other' } }
  hook.rerender({ owner: 'second', token: 'second-token' })
  await waitFor(() => expect(hook.result.current.snapshot?.profile.gender).toBe('Other'))
  await act(async () => response.resolve(Response.json(old)))
  expect(hook.result.current.snapshot?.profile.gender).toBe('Other')
  expect(hook.result.current.owner).toBe('second')
})
it.each(['initial', 'reload'])('does not disable enabled consent from %s, including retained ready callbacks', async stage => {
  const hook = await load(), retained = hook.result.current.save
  if (stage === 'initial') hook.unmount()
  fixture.state.stored = enabledDatingSnapshot()
  const active = stage === 'initial' ? renderHook(() => useDatingPreferences('first', 'first-token')) : hook
  if (stage === 'reload') await act(async () => { await active.result.current.reload() })
  await waitFor(() => expect(active.result.current.snapshot?.profile.enabled).toBe(true))
  expect(active.result.current.canWrite).toBe(false)
  const before = structuredClone(fixture.state.stored)
  const attempted = { expectedProfileRevision: 4, expectedSearchRevision: 4, profile: { ...before.profile, enabled: false }, search: before.search }
  await act(async () => {
    expect(await active.result.current.save(attempted)).toBeNull()
    expect(await retained(attempted)).toBeNull()
  })
  expect(fixture.puts()).toHaveLength(0)
  expect(fixture.state.stored).toEqual(before)
})
it('cannot overwrite consent enabled elsewhere after capability GET: both-revision CAS conflicts then reload becomes read-only', async () => {
  const hook = await load(), stale = write()
  fixture.state.stored = enabledDatingSnapshot()
  const before = structuredClone(fixture.state.stored)
  await act(async () => { expect(await hook.result.current.save(stale)).toBeNull() })
  expect(hook.result.current.reconcileRequired).toBe(true)
  expect(fixture.state.stored).toEqual(before)
  await act(async () => { await hook.result.current.reload() })
  expect(hook.result.current.canWrite).toBe(false)
  expect(hook.result.current.snapshot?.profile.enabled).toBe(true)
  expect(fixture.puts()).toHaveLength(1) // rejected stale attempt, not a consent mutation
})
