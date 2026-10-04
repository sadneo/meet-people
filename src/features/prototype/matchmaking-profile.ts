export type MatchProfile = {
  age: string
  area: string
  distance: string
  interests: string[]
  schedule: string[]
  places: string[]
}

export const initialMatchProfile: MatchProfile = {
  age: '21',
  area: 'Stony Brook campus',
  distance: '10–20 min',
  interests: ['Hiking', 'Coffee', 'Board games', 'Photography'],
  schedule: ['mon-evening', 'tue-evening', 'wed-evening', 'thu-evening', 'fri-evening', 'sat-afternoon'],
  places: ['Coffee shops', 'Parks & trails', 'Casual food', 'Campus events'],
}

export const matchmakingProfileStorageKey = 'pebble.matchmaking-profile'

export function loadMatchProfile(): MatchProfile {
  try {
    const stored = localStorage.getItem(matchmakingProfileStorageKey)
    if (!stored) return initialMatchProfile
    const parsed = JSON.parse(stored) as Partial<MatchProfile>
    if (
      typeof parsed.age !== 'string' || typeof parsed.area !== 'string' || typeof parsed.distance !== 'string' ||
      !Array.isArray(parsed.interests) || !parsed.interests.every((item) => typeof item === 'string') ||
      !Array.isArray(parsed.schedule) || !parsed.schedule.every((item) => typeof item === 'string' && /^[a-z]+-[a-z]+$/.test(item)) ||
      !Array.isArray(parsed.places) || !parsed.places.every((item) => typeof item === 'string')
    ) return initialMatchProfile
    return { ...initialMatchProfile, ...parsed }
  } catch {
    return initialMatchProfile
  }
}
