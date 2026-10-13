import { people } from './model'

// Home presentation contract only, NOT a presence or matchmaking API contract.
// The name/avatar fields align with the existing candidate shape, but a single
// suggested candidate does not establish that a person is currently available.
export type AvailablePerson = {
  id: string
  name: string
  avatar: string | null
}

// TEMPORARY UI DATA: existing fictional profiles, treated as available solely for
// the Home design preview. Replace this adapter with Daniel's available-user
// output when it exists. No requests, queue changes, polling, or persistence.
export function demoAvailablePeople(blockedIds: readonly string[]): AvailablePerson[] {
  return people.filter(person => !blockedIds.includes(person.id)).map(person => ({
    id: person.id,
    name: person.name,
    avatar: `/prototype/${person.photo}`,
  }))
}

export function previewPeople(people: readonly AvailablePerson[], start: number, count: number): AvailablePerson[] {
  if (!people.length) return []
  return Array.from({ length: Math.min(count, people.length) }, (_, index) => people[(start + index) % people.length])
}
