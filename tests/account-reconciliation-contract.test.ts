import { expect, it } from 'vitest'
import { AccountSchema, SaveAccountSchema, completedAccountChapters, emptyAccount } from '../shared/account'

const profile = { username: 'explicit', display_name: 'Explicit', bio: null, avatar_url: null, interests: ['Coffee', 'Music', 'Art'], birthdate: '2001-02-03', location_city: 'Chosen campus', availability: [{ dow: 0, start_time: '21:00:00', end_time: '24:00:00' }] }
const account = { ...emptyAccount, profile, preferences: { ...emptyAccount.preferences, intents: ['Make friends'], distance: 'Nearby' as const, group: 'Either' as const }, completed: [0, 1, 2, 3] }
it('requires all persisted fields for claimed completion, while bio/photo remain optional', () => {
  expect(SaveAccountSchema.safeParse(account).success).toBe(true)
  for (const patch of [{ interests: ['Coffee'] }, { birthdate: null }, { location_city: '' }, { availability: [] }]) expect(SaveAccountSchema.safeParse({ ...account, profile: { ...profile, ...patch } }).success).toBe(false)
  for (const patch of [{ intents: [] }, { distance: '' }, { group: '' }]) expect(SaveAccountSchema.safeParse({ ...account, preferences: { ...account.preferences, ...patch } }).success).toBe(false)
})
it('reads historical completion markers without granting readiness or permitting incomplete saves', () => {
  const legacy = { ...account, profile: { ...profile, birthdate: null, location_city: null } }
  const saved = AccountSchema.parse(legacy)
  expect(saved.completed).toEqual([0, 1, 2, 3])
  expect(completedAccountChapters(saved)).toEqual([0, 1, 2])
  expect(SaveAccountSchema.safeParse(saved).success).toBe(false)
  expect(AccountSchema.safeParse({ ...legacy, completed: [0, 2] }).success).toBe(false)
  expect(AccountSchema.safeParse({ ...legacy, settings: null }).success).toBe(false)
})
it('maps valid stored data to the first missing chapter without inventing preferences or replaying completed work', () => {
  expect(completedAccountChapters({ ...account, completed: [] })).toEqual([0, 1, 2, 3])
  expect(completedAccountChapters({ ...emptyAccount, profile })).toEqual([0, 1])
  expect(completedAccountChapters(emptyAccount)).toEqual([])
  expect(emptyAccount.preferences.intents).toEqual([])
  expect(emptyAccount.preferences.distance).toBe('')
  expect(emptyAccount.preferences.group).toBe('')
})
it('permits honest sequential partial saves but rejects skipped or invalid chapters', () => {
  expect(SaveAccountSchema.safeParse({ ...account, completed: [0] }).success).toBe(true)
  expect(SaveAccountSchema.safeParse({ ...account, completed: [0, 2] }).success).toBe(false)
  expect(SaveAccountSchema.safeParse({ ...account, profile: { ...profile, interests: ['Coffee', 'Coffee', 'Art'] } }).success).toBe(false)
})
