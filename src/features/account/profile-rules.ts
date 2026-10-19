import { ProfileFactsSchema } from '../../../shared/profile-details'

export function calculatedAge(birthdate: string | null | undefined, now = new Date()): number | null {
  if (!birthdate || !/^\d{4}-\d{2}-\d{2}$/.test(birthdate)) return null
  const [year, month, day] = birthdate.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null
  const age = now.getFullYear() - year - (now.getMonth() + 1 < month || (now.getMonth() + 1 === month && now.getDate() < day) ? 1 : 0)
  return age < 0 ? null : age
}
export function todayDate(now = new Date()) { return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}` }
export function validateFacts(education: string, occupation: string, languages: string[]) {
  const parsed = ProfileFactsSchema.safeParse({ education, occupation, languages, visibility: { education: false, occupation: false, languages: false } })
  if (parsed.success) return ''
  const issue = parsed.error.issues[0]
  if (issue.path[0] !== 'languages') return 'Keep education and occupation to 120 valid Unicode characters each.'
  return issue.message === 'Choose unique languages.' ? 'Each language only needs to be added once.' : 'Choose up to 12 languages, with no more than 60 valid Unicode characters each.'
}
