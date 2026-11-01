import { adultOn } from '../../shared/dating'

// Presentation guard only. The service remains responsible for eligibility.
// Unknown birthdays never opt a person into adult-only UI.
export function canShowDating(birthdate: unknown) {
  return adultOn(birthdate, new Date().toISOString().slice(0, 10))
}

// Frontend admission guidance; this does not replace server enforcement.
export function meetsMinimumAge(birthdate: string | null, years = 13) {
  if (!birthdate || !/^\d{4}-\d{2}-\d{2}$/.test(birthdate)) return false
  const today = new Date().toISOString().slice(0, 10)
  const age = Number(today.slice(0, 4)) - Number(birthdate.slice(0, 4)) - (today.slice(5) < birthdate.slice(5) ? 1 : 0)
  return age >= years
}
