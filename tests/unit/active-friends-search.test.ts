// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { chooseActiveGroup, commonActiveWindow, type ActivePool } from '../../api/matching/active-search'
import { runActiveFriendsCycle, type ActiveFriendsWorker } from '../../api/matching/active-worker'
import { ActiveQueueInputSchema } from '../../shared/active-friends'
const id = (n: number) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const now = '2026-10-28T09:00:00Z'
const member = (n: number): ActivePool['units'][number]['members'][number] => ({
  id: id(n), age: 24, ageMin: 18, ageMax: 40, latitude: 0, longitude: 0, radiusMiles: 10,
  interests: [`Custom activity ${n}`], goals: [], blockedIds: [],
  intervals: [{ start: '2026-10-28T10:00:00Z', end: '2026-10-28T14:00:00Z' }],
})
const unit = (n: number): ActivePool['units'][number] => ({ id: id(n + 100), groupId: null, queuedAt: '2026-10-28T08:58:00Z', preferredSize: 2, minimumSize: 2, maximumSize: 4, allowExistingGroups: false, members: [member(n)] })
function pool(count = 3): ActivePool { return { algorithmVersion: 'active-friends-fifo-v1', unitId: id(101), leaseToken: id(999), now, preferredSizeGraceSeconds: 30, minimumOverlapMinutes: 60,
  units: Array.from({ length: count }, (_, n) => unit(n + 1)), areas: [{ id: id(800), latitude: 0, longitude: 0 }] } }
it('matches unrelated interests without a quality threshold and prioritizes older feasible peers', () => {
  const value = pool(); value.units[1].queuedAt = '2026-10-28T08:56:00Z'
  value.units[2].members[0].interests = [...value.units[0].members[0].interests]
  expect(chooseActiveGroup(value)?.unitIds).toEqual([id(101), id(102)])
})
it('only waits briefly for preferred size, then offers smaller groups without relaxing accepted size ranges', () => {
  const value = pool(2); value.units[0].preferredSize = 4; value.units[0].queuedAt = '2026-10-28T08:59:50Z'
  expect(chooseActiveGroup(value)).toBeNull()
  value.units[0].queuedAt = '2026-10-28T08:59:29Z'
  expect(chooseActiveGroup(value)?.unitIds).toHaveLength(2)
  value.units[0].minimumSize = 4
  expect(chooseActiveGroup(value)).toBeNull()
})
it('finds an easy full nine-person group before the grace period without exhausting shallow search', () => {
  const value = pool(20)
  value.units.forEach(item => { item.preferredSize = 9; item.maximumSize = 9; item.queuedAt = '2026-10-28T08:59:59Z' })
  expect(chooseActiveGroup(value)?.unitIds).toHaveLength(9)
})
it('never relaxes bilateral blocks, age, distance or a feasible general meeting area', () => {
  for (const change of [
    (value: ActivePool) => { value.units[1].members[0].blockedIds = [id(1)] },
    (value: ActivePool) => { value.units[1].members[0].ageMin = 30 },
    (value: ActivePool) => { value.units[0].members[0].ageMax = 20 },
    (value: ActivePool) => { value.units[1].members[0].longitude = 1 },
    (value: ActivePool) => { value.areas[0].latitude = 2 },
  ]) { const value = pool(2); change(value); expect(chooseActiveGroup(value)).toBeNull() }
})
it('calculates actual whole-group intersections rather than just pairwise overlap', () => {
  const value = pool(); value.units.forEach(item => { item.minimumSize = 3; item.preferredSize = 3 })
  value.units[0].members[0].intervals = [{ start: '2026-10-28T09:00:00Z', end: '2026-10-28T11:00:00Z' }, { start: '2026-10-28T12:00:00Z', end: '2026-10-28T13:00:00Z' }]
  value.units[1].members[0].intervals = [{ start: '2026-10-28T10:00:00Z', end: '2026-10-28T12:00:00Z' }]
  value.units[2].members[0].intervals = [{ start: '2026-10-28T11:00:00Z', end: '2026-10-28T13:00:00Z' }]
  expect(chooseActiveGroup(value)).toBeNull()
})
it('merges adjacent overnight pieces and compares actual DST instants', () => {
  const a = member(1), b = member(2)
  a.intervals = [{ start: '2026-11-01T00:00:00-04:00', end: '2026-11-01T01:00:00-04:00' }, { start: '2026-11-01T01:00:00-04:00', end: '2026-11-01T02:00:00-05:00' }]
  b.intervals = [{ start: '2026-11-01T04:30:00Z', end: '2026-11-01T06:30:00Z' }]
  expect(commonActiveWindow([a, b], 60)).toEqual({ start: '2026-11-01T04:30:00.000Z', end: '2026-11-01T06:30:00.000Z' })
})
it('keeps existing groups together and requires explicit newcomer opt-in', () => {
  const value = pool(2); value.units[0].preferredSize = 3
  value.units[1].groupId = id(500); value.units[1].members.push(member(3)); value.units[1].preferredSize = 3
  expect(chooseActiveGroup(value)).toBeNull()
  value.units[0].allowExistingGroups = true
  expect(chooseActiveGroup(value)?.unitIds).toEqual([id(101), id(102)])
})
it('validates bounded unique queue units and explicit accepted size ranges', () => {
  expect(() => chooseActiveGroup({ ...pool(), units: [unit(1), unit(1)] })).toThrow()
  expect(() => chooseActiveGroup(pool(51))).toThrow()
  expect(ActiveQueueInputSchema.parse({ requestId: id(1), preferredNewFriends: 3 })).toMatchObject({ minimumGroupSize: 2, maximumGroupSize: 4, allowExistingGroups: false })
  expect(ActiveQueueInputSchema.safeParse({ requestId: id(1), preferredNewFriends: 3, maximumGroupSize: 3 }).success).toBe(false)
})
it('uses soft compatibility to break equal-wait ties without requiring exact similarity', () => {
  const value = pool(); value.units[2].members[0].interests = ['Custom activity 1']
  expect(chooseActiveGroup(value)?.unitIds).toEqual([id(101), id(103)])
})
it('does not perform worker work when disabled, and reconciles uncertain commits without resubmitting', async () => {
  expect(await runActiveFriendsCycle(null)).toEqual({ state: 'paused', processed: 0 })
  const worker = {
    sweep: vi.fn(async () => ({ ok: true })), claim: vi.fn(async () => pool(2)),
    finish: vi.fn(async () => { throw new Error('Unknown commit') }), reconcile: vi.fn(async () => ({ state: 'reserved', processed: 1 })),
  } satisfies ActiveFriendsWorker
  expect(await runActiveFriendsCycle(worker)).toEqual({ state: 'reserved', processed: 1 })
  expect(worker.finish).toHaveBeenCalledOnce(); expect(worker.reconcile).toHaveBeenCalledExactlyOnceWith(id(101))
})
it('handles no feasible peers, malformed pools and unavailable worker boundaries honestly', async () => {
  const worker = { sweep: async () => ({ ok: true }), claim: async () => pool(1), finish: vi.fn(async () => ({ state: 'waiting', processed: 0 })), reconcile: async () => ({ state: 'uncertain', processed: 0 }) }
  expect(await runActiveFriendsCycle(worker)).toEqual({ state: 'waiting', processed: 0 })
  expect(worker.finish).toHaveBeenCalledExactlyOnceWith(id(101), id(999), null)
  expect(await runActiveFriendsCycle({ ...worker, claim: async () => ({ units: [] }) })).toEqual({ state: 'uncertain', processed: 0 })
})
