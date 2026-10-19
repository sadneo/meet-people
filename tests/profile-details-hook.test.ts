import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useProfileDetails } from '../src/features/account/useProfileDetails'
import type { ProfileDetails, SaveProfileDetails } from '../shared/profile-details'

const facts = { education: ' School ', occupation: '', languages: ['\uFEFF Français\u00A0'], visibility: { education: true, occupation: false, languages: false } }
let stored: ProfileDetails
let onRead: (() => Promise<Response>) | null, onWrite: ((write: SaveProfileDetails) => Promise<Response>) | null
const calls: { method: string; token: string | null; body: SaveProfileDetails | null }[] = []
function deferred() {
  let resolve!: (value: Response) => void
  return { promise: new Promise<Response>(done => { resolve = done }), resolve: (value: Response) => resolve(value) }
}
beforeEach(() => {
  stored = { revision: 4, facts: structuredClone(facts) }; onRead = null; onWrite = null; calls.length = 0
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) !== '/api/matchmaking/profile-details') throw new Error('Unexpected network request')
    const method = init?.method ?? 'GET', body = init?.body ? JSON.parse(String(init.body)) as SaveProfileDetails : null
    calls.push({ method, body, token: new Headers(init?.headers).get('Authorization') })
    if (method === 'GET') return onRead ? onRead() : Response.json(stored)
    if (onWrite) return onWrite(body!)
    if (body!.expectedRevision !== stored.revision) return Response.json({ code: 'conflict', error: 'Changed.' }, { status: 409 })
    stored = { revision: stored.revision + 1, facts: body!.facts }
    return Response.json(stored)
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
async function load() {
  const hook = renderHook(({ owner, token }) => useProfileDetails(owner, token), { initialProps: { owner: 'first', token: 'first-token' } })
  await waitFor(() => expect(hook.result.current.canWrite).toBe(true))
  return hook
}
const puts = () => calls.filter(call => call.method === 'PUT')
const gets = () => calls.filter(call => call.method === 'GET')

it('closes mutation entry synchronously before a deferred PUT and readback', async () => {
  const hook = await load(), retainedSave = hook.result.current.save, write = deferred()
  const draft = { expectedRevision: 4, facts: { ...facts, education: ' Exact pending value ' } }
  onWrite = () => write.promise
  let pending!: Promise<boolean>
  act(() => { pending = retainedSave(draft) })
  await act(async () => { expect(await retainedSave(draft)).toBe(false) })
  expect(puts()).toHaveLength(1)
  expect(hook.result.current.canWrite).toBe(false)
  stored = { revision: 5, facts: draft.facts }
  await act(async () => { write.resolve(Response.json(stored)); expect(await pending).toBe(true) })
  expect(hook.result.current.canWrite).toBe(true)
  expect(hook.result.current.details).toEqual(stored)
  expect(calls.map(call => call.method)).toEqual(['GET', 'PUT', 'GET'])
})

it.each(['uncertainty', 'conflict', 'readback failure'])('retained ready save cannot bypass %s, failed reload, or latest revision checks', async kind => {
  const hook = await load(), retainedSave = hook.result.current.save
  const draft = { expectedRevision: 4, facts: { ...facts, education: 'Kept draft' } }
  if (kind === 'conflict') {
    stored = { revision: 5, facts: { ...facts, education: 'Other writer' } }
  } else if (kind === 'uncertainty') {
    onWrite = async write => { stored = { revision: 5, facts: write.facts }; throw new TypeError('Disconnected') }
  } else {
    onRead = async () => Response.json({ code: 'unavailable', error: 'Read failed.' }, { status: 503 })
  }
  await act(async () => { expect(await retainedSave(draft)).toBe(false) })
  expect(puts()).toHaveLength(1)
  expect(hook.result.current.canWrite).toBe(false)
  await act(async () => { expect(await retainedSave(draft)).toBe(false) })
  expect(puts()).toHaveLength(1)
  onRead = async () => Response.json({ code: 'unavailable', error: 'Still unavailable.' }, { status: 503 })
  await act(async () => { expect(await hook.result.current.reload()).toBeNull() })
  await act(async () => { expect(await retainedSave(draft)).toBe(false) })
  expect(puts()).toHaveLength(1)
  expect(hook.result.current.reconcileRequired).toBe(true)
  onRead = null; onWrite = null
  await act(async () => { expect(await hook.result.current.reload()).toEqual(stored) })
  expect(hook.result.current.canWrite).toBe(true)
  // Even after reconciliation, the callback must check the *current* revision.
  await act(async () => { expect(await retainedSave(draft)).toBe(false) })
  expect(puts()).toHaveLength(1)
  expect(hook.result.current.reconcileRequired).toBe(true)
  await act(async () => { await hook.result.current.reload() })
  const next = { expectedRevision: stored.revision, facts: { ...facts, education: ' Explicit new save ' } }
  await act(async () => { expect(await retainedSave(next)).toBe(true) })
  expect(puts()).toHaveLength(2)
  expect(hook.result.current.details?.facts).toEqual(next.facts)
})

it.each(['interrupted', 'completed uncertainty'])('repeated same-owner token refresh cannot clear %s or failed reconciliation', async kind => {
  const hook = await load(), retainedSave = hook.result.current.save, write = deferred()
  const draft = { expectedRevision: 4, facts: { ...facts, education: 'Interrupted draft' } }
  let pending!: Promise<boolean>
  if (kind === 'interrupted') {
    onWrite = () => write.promise
    act(() => { pending = retainedSave(draft) })
    await waitFor(() => expect(puts()).toHaveLength(1))
  } else {
    onWrite = async value => { stored = { revision: 5, facts: value.facts }; throw new TypeError('Disconnected') }
    await act(async () => { expect(await retainedSave(draft)).toBe(false) })
  }
  for (const token of ['second-token', 'third-token']) {
    hook.rerender({ owner: 'first', token })
    expect(hook.result.current.canWrite).toBe(false)
    expect(hook.result.current.reconcileRequired).toBe(true)
    expect(gets()).toHaveLength(1)
  }
  if (kind === 'interrupted') {
    stored = { revision: 5, facts: draft.facts }
    await act(async () => { write.resolve(Response.json(stored)); expect(await pending).toBe(false) })
  }
  onRead = async () => Response.json({ code: 'unavailable', error: 'Reconciliation failed.' }, { status: 503 })
  await act(async () => { expect(await hook.result.current.reload()).toBeNull() })
  expect(gets()).toHaveLength(2)
  for (const token of ['fourth-token', 'fifth-token']) {
    hook.rerender({ owner: 'first', token })
    expect(hook.result.current.canWrite).toBe(false)
    expect(hook.result.current.reconcileRequired).toBe(true)
    expect(gets()).toHaveLength(2)
  }
  await act(async () => { expect(await retainedSave(draft)).toBe(false) })
  expect(puts()).toHaveLength(1)
  onRead = null; onWrite = null
  await act(async () => { expect(await hook.result.current.reload()).toEqual(stored) })
  expect(hook.result.current.reconcileRequired).toBe(false)
  expect(hook.result.current.canWrite).toBe(true)
  expect(gets().at(-1)?.token).toBe('Bearer fifth-token')
  expect(puts()).toHaveLength(1)
})

it('resets reconciliation only for a real owner change and rejects old-owner/unmounted callbacks', async () => {
  const hook = await load(), firstSave = hook.result.current.save
  onWrite = async () => { throw new TypeError('Disconnected') }
  await act(async () => { await firstSave({ expectedRevision: 4, facts }) })
  expect(hook.result.current.reconcileRequired).toBe(true)
  stored = { revision: 1, facts: { ...facts, education: 'Second owner' } }; onWrite = null
  hook.rerender({ owner: 'second', token: 'second-token' })
  await waitFor(() => expect(hook.result.current.canWrite).toBe(true))
  expect(hook.result.current.reconcileRequired).toBe(false)
  expect(hook.result.current.details).toEqual(stored)
  await act(async () => { expect(await firstSave({ expectedRevision: 1, facts })).toBe(false) })
  const secondSave = hook.result.current.save, before = calls.length
  hook.unmount()
  expect(await secondSave({ expectedRevision: 1, facts })).toBe(false)
  expect(calls).toHaveLength(before)
  expect(puts()).toHaveLength(1)
})

it('a session-interrupted reconciliation GET cannot clear the requirement or start another automatic GET', async () => {
  const hook = await load(), readback = deferred()
  onWrite = async () => { throw new TypeError('Disconnected') }
  await act(async () => { await hook.result.current.save({ expectedRevision: 4, facts }) })
  onRead = () => readback.promise
  let pending!: ReturnType<typeof hook.result.current.reload>
  act(() => { pending = hook.result.current.reload() })
  await waitFor(() => expect(gets()).toHaveLength(2))
  for (const token of ['second-token', 'third-token']) {
    hook.rerender({ owner: 'first', token })
    expect(hook.result.current.reconcileRequired).toBe(true)
    expect(hook.result.current.canWrite).toBe(false)
    expect(gets()).toHaveLength(2)
  }
  await act(async () => { readback.resolve(Response.json(stored)); expect(await pending).toBeNull() })
  expect(hook.result.current.reconcileRequired).toBe(true)
  expect(hook.result.current.canWrite).toBe(false)
  onRead = null
  await act(async () => { await hook.result.current.reload() })
  expect(hook.result.current.canWrite).toBe(true)
  expect(hook.result.current.reconcileRequired).toBe(false)
  expect(puts()).toHaveLength(1)
})
