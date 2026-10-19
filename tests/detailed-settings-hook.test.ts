import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useDetailedSettings } from '../src/features/account/useDetailedSettings'
import { emptyDetailedSettings, effectiveDetailedSettings } from '../shared/detailed-settings'
import { detailedSettingsFixture, deferredSettingsResponse } from './detailed-settings-fixture'
import { useLayoutEffect } from 'react'

let fixture: ReturnType<typeof detailedSettingsFixture>
beforeEach(() => { fixture = detailedSettingsFixture() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
async function load() {
  const hook = renderHook(({ owner, token }) => useDetailedSettings(owner, token), { initialProps: { owner: 'first', token: 'first-token' } })
  await waitFor(() => expect(hook.result.current.canWrite).toBe(true))
  return hook
}
it.each(['conflict', 'uncertainty', 'readback failure'])('retained callbacks cannot bypass %s or failed reconciliation', async kind => {
  const hook = await load(), retained = hook.result.current.save
  const draft = { expectedRevision: 0, settings: { ...emptyDetailedSettings(), messages: true } }
  if (kind === 'conflict') fixture.state.stored = { revision: 1, settings: { ...emptyDetailedSettings(), plans: true } }
  else if (kind === 'uncertainty') fixture.state.onWrite = async value => { fixture.state.stored = { revision: 1, settings: value.settings }; throw new TypeError('Disconnected') }
  else fixture.state.onRead = async () => Response.json({ code: 'unavailable', error: 'Read failed.' }, { status: 503 })
  await act(async () => { expect(await retained(draft)).toBeNull() })
  await act(async () => { expect(await retained(draft)).toBeNull() })
  expect(fixture.puts()).toHaveLength(1)
  const reads = fixture.gets().length
  await act(async () => { expect(await hook.result.current.refresh()).toBeNull() })
  expect(fixture.gets()).toHaveLength(reads) // automatic/master refresh never reconciles
  fixture.state.onRead = async () => Response.json({ code: 'unavailable', error: 'Still failed.' }, { status: 503 })
  await act(async () => { expect(await hook.result.current.reload()).toBeNull() })
  await act(async () => { expect(await retained(draft)).toBeNull() })
  expect(fixture.puts()).toHaveLength(1)
  expect(hook.result.current.reconcileRequired).toBe(true)
  fixture.state.onRead = null; fixture.state.onWrite = null
  await act(async () => { await hook.result.current.reload() })
  await act(async () => { expect(await retained(draft)).toBeNull() }) // old revision rejected locally
  expect(fixture.puts()).toHaveLength(1)
  await act(async () => { await hook.result.current.reload() })
  await act(async () => { expect(await retained({ expectedRevision: 1, settings: draft.settings })).toEqual(fixture.snapshot()) })
  expect(fixture.puts()).toHaveLength(2)
})
it.each(['interrupted', 'completed'])('preserves reconciliation across repeated refreshes after %s uncertain save', async kind => {
  const hook = await load(), deferred = deferredSettingsResponse(), retained = hook.result.current.save
  const draft = { expectedRevision: 0, settings: { ...emptyDetailedSettings(), friendsDiscovery: true } }
  let pending!: ReturnType<typeof retained>
  if (kind === 'interrupted') {
    fixture.state.onWrite = () => deferred.promise
    act(() => { pending = retained(draft) })
    await waitFor(() => expect(fixture.puts()).toHaveLength(1))
  } else {
    fixture.state.onWrite = async () => { throw new TypeError('Disconnected') }
    await act(async () => { await retained(draft) })
  }
  for (const token of ['second-token', 'third-token']) {
    hook.rerender({ owner: 'first', token })
    expect(hook.result.current.reconcileRequired).toBe(true)
    expect(hook.result.current.canWrite).toBe(false)
    expect(fixture.gets()).toHaveLength(1)
  }
  if (kind === 'interrupted') await act(async () => { deferred.resolve(Response.json({ revision: 1, settings: draft.settings, masters: fixture.state.masters, effective: effectiveDetailedSettings(draft.settings, fixture.state.masters) })); expect(await pending).toBeNull() })
  fixture.state.onRead = async () => Response.json({ code: 'unavailable', error: 'Failed reconciliation' }, { status: 503 })
  await act(async () => { await hook.result.current.reload() })
  hook.rerender({ owner: 'first', token: 'fourth-token' })
  expect(fixture.gets()).toHaveLength(2)
  expect(hook.result.current.reconcileRequired).toBe(true)
  fixture.state.onRead = null
  await act(async () => { await hook.result.current.reload() })
  expect(hook.result.current.canWrite).toBe(true)
  expect(fixture.puts()).toHaveLength(1)
})
it('accepts canonical readback with independently changed masters but never divergent choices', async () => {
  const hook = await load()
  fixture.state.onRead = async () => { fixture.state.masters = { notifications: false, discoverable: false }; return Response.json(fixture.snapshot()) }
  await act(async () => { expect(await hook.result.current.save({ expectedRevision: 0, settings: { ...emptyDetailedSettings(), messages: true } })).toMatchObject({ revision: 1, effective: emptyDetailedSettings() }) })
  expect(hook.result.current.snapshot?.settings.messages).toBe(true)
  fixture.state.onRead = async () => Response.json({ ...fixture.snapshot(), settings: emptyDetailedSettings() })
  await act(async () => { expect(await hook.result.current.save({ expectedRevision: 1, settings: { ...emptyDetailedSettings(), plans: true } })).toBeNull() })
  expect(hook.result.current.reconcileRequired).toBe(true)
})
it('fences old saves/readback on actor change and rejects old/unmounted callbacks', async () => {
  const hook = await load(), retained = hook.result.current.save, deferred = deferredSettingsResponse()
  fixture.state.onWrite = () => deferred.promise
  let pending!: ReturnType<typeof retained>
  act(() => { pending = retained({ expectedRevision: 0, settings: { ...emptyDetailedSettings(), messages: true } }) })
  fixture.state.stored = { revision: 2, settings: { ...emptyDetailedSettings(), matches: true } }
  hook.rerender({ owner: 'second', token: 'second-token' })
  await waitFor(() => expect(hook.result.current.snapshot?.revision).toBe(2))
  const oldSettings = { ...emptyDetailedSettings(), messages: true }
  await act(async () => { deferred.resolve(Response.json({ revision: 1, settings: oldSettings, masters: fixture.state.masters, effective: effectiveDetailedSettings(oldSettings, fixture.state.masters) })); expect(await pending).toBeNull() })
  expect(fixture.gets().filter(call => call.token === 'Bearer first-token')).toHaveLength(1)
  expect(hook.result.current.reconcileRequired).toBe(false)
  expect(await retained({ expectedRevision: 2, settings: emptyDetailedSettings() })).toBeNull()
  const second = hook.result.current.save, before = fixture.state.calls.length
  hook.unmount()
  expect(await second({ expectedRevision: 2, settings: emptyDetailedSettings() })).toBeNull()
  expect(fixture.state.calls).toHaveLength(before)
})
it('fences a late initial GET across owner replacement', async () => {
  const response = deferredSettingsResponse(); fixture.state.onRead = () => response.promise
  const hook = renderHook(({ owner, token }) => useDetailedSettings(owner, token), { initialProps: { owner: 'first', token: 'first-token' } })
  await waitFor(() => expect(fixture.gets()).toHaveLength(1))
  fixture.state.onRead = null; fixture.state.stored = { revision: 1, settings: { ...emptyDetailedSettings(), datingDiscovery: true } }
  hook.rerender({ owner: 'second', token: 'second-token' })
  await waitFor(() => expect(hook.result.current.snapshot?.revision).toBe(1))
  await act(async () => response.resolve(Response.json({ revision: 0, settings: emptyDetailedSettings(), masters: null, effective: emptyDetailedSettings() })))
  expect(hook.result.current.owner).toBe('second')
  expect(hook.result.current.snapshot?.settings.datingDiscovery).toBe(true)
  expect(hook.result.current.error).toBe('')
})
it.each(['token', 'owner', 'account-busy'])('rejects retained mutations during %s transition before passive effect cleanup', async transition => {
  let retained: ReturnType<typeof useDetailedSettings>['save'] | undefined
  let attempt: Promise<unknown> | undefined
  const hook = renderHook(({ owner, token, busy, invoke }) => {
    const resource = useDetailedSettings(owner, token, busy)
    useLayoutEffect(() => {
      if (invoke) attempt = retained!({ expectedRevision: 0, settings: { ...emptyDetailedSettings(), messages: true } })
    }, [invoke])
    return resource
  }, { initialProps: { owner: 'first', token: 'first-token', busy: false, invoke: false } })
  await waitFor(() => expect(hook.result.current.canWrite).toBe(true))
  retained = hook.result.current.save
  hook.rerender({ owner: transition === 'owner' ? 'second' : 'first', token: transition === 'token' ? 'renewed-token' : 'first-token', busy: transition === 'account-busy', invoke: true })
  await act(async () => { expect(await attempt).toBeNull() })
  expect(fixture.puts()).toHaveLength(0)
})
it('rejects a retained old-session reload before passive cleanup, without issuing an old-token GET', async () => {
  let reload: ReturnType<typeof useDetailedSettings>['reload'] | undefined
  let attempt: Promise<unknown> | undefined
  const hook = renderHook(({ token, invoke }) => {
    const resource = useDetailedSettings('first', token)
    useLayoutEffect(() => { if (invoke) attempt = reload!() }, [invoke])
    return resource
  }, { initialProps: { token: 'first-token', invoke: false } })
  await waitFor(() => expect(hook.result.current.canWrite).toBe(true))
  reload = hook.result.current.reload
  hook.rerender({ token: 'renewed-token', invoke: true })
  await act(async () => { expect(await attempt).toBeNull() })
  expect(fixture.gets().filter(call => call.token === 'Bearer first-token')).toHaveLength(1)
})
