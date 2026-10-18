import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useUnifiedAccount } from '../src/auth/useUnifiedAccount'
import { accountFixture, requiredPreferences } from './complete-profile-fixture'
import type { Account } from '../shared/account'

const original = accountFixture({ username: 'explicit', display_name: 'Explicit', bio: null, avatar_url: null, ...requiredPreferences })
let stored: Account, reads: number, puts: Account[], sorted: boolean, drop: boolean, replaceIdentity: boolean
beforeEach(() => {
  stored = structuredClone(original); reads = 0; puts = []; sorted = false; drop = false; replaceIdentity = false
  vi.stubGlobal('fetch', vi.fn(async (_input, init?: RequestInit) => {
    if (init?.method === 'PUT') { stored = JSON.parse(String(init.body)); puts.push(structuredClone(stored)) }
    else reads++
    const result = structuredClone(stored)
    if (puts.length && init?.method === 'GET') {
      if (sorted) {
        result.profile!.interests.sort()
        result.profile!.availability.sort((a, b) => a.dow - b.dow || a.start_time.localeCompare(b.start_time) || a.end_time.localeCompare(b.end_time))
      }
      if (drop) result.profile!.interests = result.profile!.interests.slice(1)
      if (replaceIdentity) result.profile!.username = 'unexpected-identity'
    }
    return Response.json(result)
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
async function load() {
  const hook = renderHook(({ token }) => useUnifiedAccount(token), { initialProps: { token: 'actor-one' } })
  await waitFor(() => expect(hook.result.current.available).toBe(true))
  return hook
}
it('accepts real SQL-sorted interests/windows, retaining exact labels and window tuples', async () => {
  sorted = true
  const hook = await load()
  const next = structuredClone(hook.result.current.account!)
  next.profile!.interests = ['Music', 'Art', 'Coffee', 'Board games\nstrategy']
  next.profile!.availability = [{ dow: 5, start_time: '09:15:00', end_time: '11:45:00' }, ...next.profile!.availability]
  let saved = false
  await act(async () => { saved = await hook.result.current.save(next) })
  expect(saved).toBe(true); expect(hook.result.current.error).toBe(''); expect(puts).toHaveLength(1)
  expect(hook.result.current.account!.profile!.interests).toEqual([...next.profile!.interests].sort())
})
it.each(['dropped-label', 'changed-identity'])('does not accept %s in otherwise valid authoritative readback', async failure => {
  const hook = await load()
  const next = structuredClone(hook.result.current.account!)
  next.profile!.interests.push('Music')
  drop = failure === 'dropped-label'; replaceIdentity = failure === 'changed-identity'
  await act(async () => { expect(await hook.result.current.save(next)).toBe(false) })
  expect(hook.result.current.available).toBe(false)
  expect(hook.result.current.error).toContain('could not be confirmed')
})
it('rejects a dirty field when preflight sees a divergent baseline, retaining the draft and sending zero PUTs', async () => {
  const hook = await load(), draft = structuredClone(hook.result.current.account!)
  draft.profile!.display_name = 'My unsaved name'
  stored.profile!.display_name = 'Other tab name'
  await act(async () => { expect(await hook.result.current.save(draft)).toBe(false) })
  expect(puts).toEqual([]); expect(draft.profile!.display_name).toBe('My unsaved name')
  expect(hook.result.current.error).toContain('Another tab changed')
  expect(hook.result.current.available).toBe(false)
})
it('merges independent fresh fields without overwriting them or claiming atomic cross-tab protection', async () => {
  const hook = await load(), draft = structuredClone(hook.result.current.account!)
  draft.settings.notifications = false
  stored.profile!.interests.push('Music'); stored.preferences.group = 'Small groups'
  await act(async () => { expect(await hook.result.current.save(draft)).toBe(true) })
  expect(puts[0].profile!.interests).toContain('Music')
  expect(puts[0].preferences.group).toBe('Small groups'); expect(puts[0].settings.notifications).toBe(false)
})
it('retained callbacks reject entry after unmount, without issuing preflight or writes', async () => {
  const hook = await load(), save = hook.result.current.save, draft = hook.result.current.account!
  hook.unmount(); const before = reads
  expect(await save(draft)).toBe(false); expect(reads).toBe(before); expect(puts).toEqual([])
})
