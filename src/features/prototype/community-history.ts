// UI-only history fixture. There is no dated participation ledger in the current
// economy. These values never grant currency, build upgrades, or imply ownership.
// Replace this adapter with dated participation data when a real ledger exists.
export type CommunityDay = { date: Date; activity: number; stage: number }
const demoWeeks = [[10, 0, 20, 10, 30, 0, 20], [0, 10, 10, 0, 20, 10, 0], [10, 0, 0, 10, 0, 10, 0], [0, 0, 10, 0, 0, 0, 10]]
export const historyWeekCount = demoWeeks.length
export function communityWeek(weeksAgo: number, today = new Date()): CommunityDay[] {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  start.setDate(start.getDate() - start.getDay() - 7 * (weeksAgo + 1))
  return demoWeeks[weeksAgo].map((activity, index) => {
    const date = new Date(start)
    date.setDate(date.getDate() + index)
    // Demo snapshots progress by day, independently of sample earnings. A zero
    // activity bar must not remove buildings or skip the plain Sunday starting point.
    return { date, activity, stage: index }
  })
}
