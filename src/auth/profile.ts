import type { Account } from '../../shared/account'
import type { Profile } from '../features/prototype/model'

export function accountToProfile(account: Account): Profile {
  return { name: account.profile?.display_name ?? '', bio: account.profile?.bio ?? '', photo: account.profile?.avatar_url ?? '', interests: account.profile?.interests ?? [], ...account.preferences }
}
export function profileToAccount(profile: Profile, account: Account, userId: string): Account {
  // Store explicit weekly windows for the existing matching engine.
  const periods = { Mornings: ['08:00:00', '12:00:00'], Afternoons: ['12:00:00', '17:00:00'], Evenings: ['17:00:00', '21:00:00'], Weekends: ['08:00:00', '21:00:00'] }
  const availability = [0, 1, 2, 3, 4, 5, 6].flatMap(dow => {
    if ((dow === 0 || dow === 6) && profile.usual.includes('Weekends')) return [{ dow, start_time: '08:00:00', end_time: '21:00:00' }]
    return profile.usual.filter(value => value !== 'Weekends').map(value => {
      const [start_time, end_time] = periods[value as keyof typeof periods]
      return { dow, start_time, end_time }
    })
  })
  return {
    ...account,
    profile: { username: account.profile?.username ?? `student-${userId}`, birthdate: account.profile?.birthdate ?? null, location_city: account.profile?.location_city ?? null,
      display_name: profile.name.trim(), bio: profile.bio.trim() || null, avatar_url: profile.photo || null, interests: profile.interests,
      availability: JSON.stringify(profile.usual) === JSON.stringify(account.preferences.usual) ? account.profile?.availability ?? availability : availability },
    preferences: { intents: profile.intents, usual: profile.usual as Account['preferences']['usual'], distance: profile.distance as Account['preferences']['distance'], group: profile.group as Account['preferences']['group'] },
  }
}
