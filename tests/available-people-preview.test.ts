// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { demoAvailablePeople, previewPeople } from '../src/features/prototype/available-people-preview'

describe('Home preview adapter', () => {
  const people = demoAvailablePeople([])
  it('cycles without repeating a person before all samples have been used', () => {
    const cycle = [0, 3, 6].flatMap(start => previewPeople(people, start, 3))
    expect(new Set(cycle.slice(0, people.length).map(person => person.id)).size).toBe(people.length)
    expect(cycle[people.length].id).toBe(people[0].id)
  })
  it('does not duplicate a short pool or invent users for an empty pool', () => {
    expect(previewPeople(people.slice(0, 2), 3, 3)).toHaveLength(2)
    expect(new Set(previewPeople(people.slice(0, 2), 3, 3).map(person => person.id)).size).toBe(2)
    expect(previewPeople([], 3, 3)).toEqual([])
  })
  it('excludes blocked prototype profiles', () => {
    expect(demoAvailablePeople(['jamie', 'maya']).some(person => ['jamie', 'maya'].includes(person.id))).toBe(false)
  })
})
