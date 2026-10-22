import { completedAccountChapters, emptyAccount, type Account } from '../../shared/account'
// Explicit synthetic server data for tests, never a runtime default or bypass.
export const requiredPreferences = {
  interests: ['Coffee', 'Books', 'Games'], birthdate: '2000-01-01', location_city: 'Fixture campus',
  availability: [{ dow: 0, start_time: '21:00:00', end_time: '24:00:00' }],
}
export function accountFixture(profile: Account['profile']): Account {
  const account: Account = { ...emptyAccount, profile, preferences: { intents: ['Make friends'], usual: [], distance: 'Nearby', group: 'Either' }, completed: [] }
  return { ...account, completed: completedAccountChapters(account) }
}
