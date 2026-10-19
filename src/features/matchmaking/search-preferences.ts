export type SearchOptions = { source: 'home' | 'temporary'; area: string; goals: string[] }
export const emptySearchOptions: SearchOptions = { source: 'home', area: '', goals: [] }
export const friendshipGoals = ['Meet new people', 'Find people for events', 'Casual hangouts', 'Activity buddies', 'Study buddies', 'Close friendships']
export function validateSearchOptions(value: SearchOptions) {
  if (value.source === 'temporary' && (!value.area.trim() || value.area.trim().length > 120)) return 'Enter a temporary city or campus of 1–120 characters, or use your home area.'
  if (value.goals.length > 20 || value.goals.some(value => !value.trim() || value.length > 120)) return 'Check your friendship goals.'
  return ''
}
