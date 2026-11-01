import { expect, it } from 'vitest'
import { FriendsDiscoveryCandidateSchema } from '../../shared/friends-discovery'
import { DatingCandidateSchema } from '../../shared/dating-live'

const person = { id: 'fd000000-0000-4000-8000-000000000001', name: 'Synthetic person', age: 25, city: null, bio: null, avatar: null, photoRevision: 0, interests: ['Coffee'], areaDistanceMiles: 1 }
it('accepts only public facts and a coarse shared-time summary in both modes', () => {
  const fields = { details: { education: 'College', languages: ['English'] }, sharedAvailability: { dayOfWeek: 3, period: 'afternoon', timeZone: 'America/New_York' } }
  expect(FriendsDiscoveryCandidateSchema.parse({ ...person, ...fields }).details).toEqual(fields.details)
  expect(DatingCandidateSchema.parse({ ...person, ...fields, heightInches: null, gender: null, sexuality: null, intent: 'Long-term relationship', style: 'Monogamy' }).sharedAvailability).toEqual(fields.sharedAvailability)
})
it('rejects owner visibility settings and exact schedule bounds', () => {
  expect(FriendsDiscoveryCandidateSchema.safeParse({ ...person, details: { education: 'College', visibility: { education: false } } }).success).toBe(false)
  expect(FriendsDiscoveryCandidateSchema.safeParse({ ...person, sharedAvailability: { dayOfWeek: 3, period: 'afternoon', timeZone: 'UTC', start: '12:00', end: '17:00' } }).success).toBe(false)
})
it('supports absent, hidden and unavailable data without fixture defaults', () => {
  expect(FriendsDiscoveryCandidateSchema.parse(person).details).toBeUndefined()
  expect(FriendsDiscoveryCandidateSchema.parse({ ...person, details: {}, sharedAvailability: null }).sharedAvailability).toBeNull()
})
