import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { useLayoutEffect } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useFriendsPreferences } from '../src/features/matchmaking/useFriendsPreferences'
import { friendsPreferenceDraft, friendsDraftWrite } from '../src/features/matchmaking/friends-preferences-draft'
import { friendsPreferencesFixture, deferredFriendsResponse } from './friends-preferences-fixture'

let fixture: ReturnType<typeof friendsPreferencesFixture>
beforeEach(() => { fixture = friendsPreferencesFixture() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
function write() { const draft = friendsPreferenceDraft(fixture.state.stored); return friendsDraftWrite(fixture.state.stored, draft.filters, draft.options) }
async function load() {
  const hook = renderHook(({ owner, token }) => useFriendsPreferences(owner, token), { initialProps: { owner: 'first', token: 'first-token' } })
  await waitFor(() => expect(hook.result.current.canWrite).toBe(true)); return hook
}
it.each(['conflict', 'disconnect', 'readback', 'divergent'])('locks retained callbacks after %s, failed reload and repeated token refresh until explicit reconciliation', async kind => {
  const hook = await load(), value = write(), retained = hook.result.current.save
  if (kind === 'conflict') fixture.commit(value)
  else if (kind === 'disconnect') fixture.state.onWrite = async value => { fixture.commit(value); throw new Error('Disconnected') }
  else fixture.state.onRead = async () => kind === 'readback' ? Response.json({ code: 'auth', error: 'Expired' }, { status: 401 }) : Response.json({ ...fixture.state.stored, revision: fixture.state.stored.revision + 1 })
  await act(async () => { expect(await retained(value)).toBeNull() })
  await act(async () => { expect(await retained(value)).toBeNull() })
  expect(fixture.puts()).toHaveLength(1); expect(hook.result.current.reconcileRequired).toBe(true)
  fixture.state.onRead = async () => Response.json(null)
  await act(async () => { expect(await hook.result.current.reload()).toBeNull() })
  hook.rerender({ owner: 'first', token: 'second-token' }); hook.rerender({ owner: 'first', token: 'third-token' })
  expect(hook.result.current.reconcileRequired).toBe(true); expect(hook.result.current.canWrite).toBe(false)
  fixture.state.onRead = null; fixture.state.onWrite = null
  await act(async () => { await hook.result.current.reload() })
  expect(hook.result.current.canWrite).toBe(true)
  expect(await retained(write())).toBeNull()
  await act(async () => { expect(await hook.result.current.save(write())).not.toBeNull() })
  expect(fixture.puts()).toHaveLength(2)
})
it('holds the duplicate mutation lock until separate canonical GET completes', async () => {
  const hook = await load(), response = deferredFriendsResponse(), value = write()
  fixture.state.onRead = () => response.promise
  let pending!: ReturnType<typeof hook.result.current.save>
  act(() => { pending = hook.result.current.save(value) })
  await waitFor(() => expect(fixture.gets()).toHaveLength(2))
  expect(await hook.result.current.save(value)).toBeNull()
  await act(async () => { response.resolve(Response.json(fixture.state.stored)); expect(await pending).toEqual(fixture.state.stored) })
  expect(fixture.puts()).toHaveLength(1)
})
it('preserves interrupted-write reconciliation over token refreshes and fences late PUT/readback', async () => {
  const hook = await load(), response = deferredFriendsResponse(), value = write()
  fixture.state.onWrite = () => response.promise
  let pending!: ReturnType<typeof hook.result.current.save>
  act(() => { pending = hook.result.current.save(value) })
  hook.rerender({ owner: 'first', token: 'second-token' }); hook.rerender({ owner: 'first', token: 'third-token' })
  expect(hook.result.current.reconcileRequired).toBe(true)
  fixture.commit(value)
  await act(async () => { response.resolve(Response.json(fixture.state.stored)); expect(await pending).toBeNull() })
  expect(fixture.gets()).toHaveLength(1)
  await act(async () => { await hook.result.current.reload() })
  expect(hook.result.current.canWrite).toBe(true)
})
it.each(['owner', 'token', 'busy'])('blocks a retained mutation during %s render before passive cleanup', async change => {
  let retained: ReturnType<typeof useFriendsPreferences>['save'] | undefined, attempted: Promise<unknown> | undefined
  const hook = renderHook(({ owner, token, busy, invoke }) => {
    const result = useFriendsPreferences(owner, token, busy)
    useLayoutEffect(() => { if (invoke) attempted = retained!(write()) }, [invoke])
    return result
  }, { initialProps: { owner: 'first', token: 'first-token', busy: false, invoke: false } })
  await waitFor(() => expect(hook.result.current.canWrite).toBe(true)); retained = hook.result.current.save
  hook.rerender({ owner: change === 'owner' ? 'second' : 'first', token: change === 'token' ? 'renewed-token' : 'first-token', busy: change === 'busy', invoke: true })
  await act(async () => { expect(await attempted).toBeNull() })
  expect(fixture.puts()).toHaveLength(0)
})
it('fences an obsolete initial GET and unmounted callbacks without exposing another owner', async () => {
  const response = deferredFriendsResponse(); fixture.state.onRead = () => response.promise
  const hook = renderHook(({ owner, token }) => useFriendsPreferences(owner, token), { initialProps: { owner: 'first', token: 'first-token' } })
  const retained = hook.result.current.save
  await waitFor(() => expect(fixture.gets()).toHaveLength(1))
  fixture.state.onRead = null; fixture.commit(write())
  hook.rerender({ owner: 'second', token: 'second-token' })
  await waitFor(() => expect(hook.result.current.snapshot?.revision).toBe(1))
  await act(async () => response.resolve(Response.json({ revision: 0, preferences: null })))
  expect(hook.result.current.owner).toBe('second'); expect(hook.result.current.snapshot?.revision).toBe(1)
  const current = hook.result.current.save, before = fixture.state.calls.length
  hook.unmount()
  expect(await retained(write())).toBeNull(); expect(await current(write())).toBeNull()
  expect(fixture.state.calls).toHaveLength(before)
})
