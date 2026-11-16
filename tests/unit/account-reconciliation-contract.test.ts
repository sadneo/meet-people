import { expect, it } from 'vitest'
import { AccountSchema, SaveAccountSchema, completedAccountChapters, emptyAccount } from '../../shared/account'

const profile = { username: 'explicit', display_name: 'Explicit', bio: null, avatar_url: null, interests: ['Coffee', 'Music', 'Art'], birthdate: '2001-02-03', location_city: 'Chosen campus', availability: [{ dow: 0, start_time: '21:00:00', end_time: '24:00:00' }] }
const account = { ...emptyAccount, profile, preferences: { ...emptyAccount.preferences, intents: ['Make friends'], distance: 'Nearby' as const, group: 'Either' as const }, completed: [0, 1, 2, 3] }
it('requires identity and birthday for app entry and accepts empty matching preferences', () => {
  const basic = { ...emptyAccount, profile: { ...profile, interests: [], location_city: null, availability: [] }, completed: [0] }
  expect(SaveAccountSchema.safeParse(basic).success).toBe(true)
  expect(completedAccountChapters(basic)).toEqual([0, 1, 2, 3])
  for (const patch of [{ birthdate: null }, { username: '' }, { display_name: '' }]) {
    expect(SaveAccountSchema.safeParse({ ...account, profile: { ...profile, ...patch } }).success).toBe(false)
  }
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
it('reads an existing basic profile as complete without inventing matching preferences', () => {
  expect(completedAccountChapters({ ...account, completed: [] })).toEqual([0, 1, 2, 3])
  expect(completedAccountChapters({ ...emptyAccount, profile })).toEqual([0, 1, 2, 3])
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
