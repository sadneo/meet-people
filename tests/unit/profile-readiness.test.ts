import { expect, it } from 'vitest'
import { isProfileReady, ReadyPreferencesSchema } from '../../shared/profile-readiness'

const account = { username: 'fixture', display_name: 'Fixture', bio: null, avatar_url: null }
const profile = { ...account, interests: ['Coffee', 'Music', 'Art'], birthdate: '2001-02-03', location_city: 'Fixture campus', availability: [{ dow: 0, start_time: '21:00:00', end_time: '24:00:00' }] }
it('derives readiness exclusively from canonical identity and durable required preferences', () => {
  expect(isProfileReady(account, profile)).toBe(true)
  expect(isProfileReady(null, profile)).toBe(false)
  expect(isProfileReady(account, null)).toBe(false)
  for (const patch of [{ interests: ['Coffee', 'Music'] }, { interests: ['Coffee', 'Coffee', 'Art'] }, { birthdate: null }, { birthdate: '2001-02-30' }, { location_city: '   ' }, { availability: [] }]) {
    expect(ReadyPreferencesSchema.safeParse({ ...profile, ...patch }).success).toBe(false)
  }
})
it('preserves optional bio/avatar and late/custom windows without adding photo, geolocation or age requirements', () => {
  expect(ReadyPreferencesSchema.safeParse({ ...profile, bio: null, avatar_url: null, birthdate: '2026-10-18', availability: [{ dow: 2, start_time: '09:15:00', end_time: '11:45:00' }, ...profile.availability] }).success).toBe(true)
})
