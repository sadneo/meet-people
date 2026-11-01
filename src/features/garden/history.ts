import { parseCommunity, type Community } from './economy'

export type GardenSnapshot = Pick<Community, 'owned' | 'positions'>
export type GardenHistory = Record<string, GardenSnapshot>
export const gardenHistoryKey = (owner: string) => `pebble:garden-history:v1:${owner}`
export function gardenDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function gardenWeek(date = new Date()) {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7)
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday); day.setDate(monday.getDate() + index)
    return { key: gardenDay(day), label: day.toLocaleDateString(undefined, { weekday: 'short' }), date: day }
  })
}
export function readGardenHistory(owner: string): GardenHistory {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(gardenHistoryKey(owner)) ?? '{}')
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    const history: GardenHistory = {}
    for (const [day, value] of Object.entries(raw).sort().slice(-35)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !value || typeof value !== 'object' || !Array.isArray(value.owned)) continue
      // Reuse catalog/placement validation. History contains no spendable balance
      // or unlock authority and is never dispatched back into live Garden state.
      const parsed = parseCommunity(JSON.stringify({ balance: 0, earnedChapters: [], geodeUnlocks: value.owned, ...value }))
      history[day] = { owned: parsed.owned, positions: parsed.positions ?? {} }
    }
    return history
  } catch { return {} }
}
export function recordGardenDay(owner: string, community: Community, date = new Date()) {
  try {
    const history = readGardenHistory(owner), day = gardenDay(date)
    const snapshot = { owned: [...community.owned], positions: { ...community.positions } }
    if (JSON.stringify(history[day]) === JSON.stringify(snapshot)) return true
    history[day] = snapshot
    const recent = Object.fromEntries(Object.entries(history).sort().slice(-35))
    localStorage.setItem(gardenHistoryKey(owner), JSON.stringify(recent))
    return true
  } catch { return false }
}
