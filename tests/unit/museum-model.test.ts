// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { demoMinerals, gemFamilies, museumSlots } from '../../src/features/prototype/museum-model'

describe('museum progression exhibit', () => {
  it('fills exactly four rows with one family and four ordered stages per row', () => {
    const slots = museumSlots(demoMinerals)
    expect(slots).toHaveLength(16)
    gemFamilies.forEach((family, row) => {
      const specimens = slots.slice(row * 4, row * 4 + 4)
      expect(specimens.map(specimen => specimen?.family)).toEqual(Array(4).fill(family.id))
      expect(specimens.map(specimen => specimen?.stage)).toEqual([0, 1, 2, 3])
      expect(specimens[3]?.expression).toBe(family.expression)
    })
  })
  it('keeps empty-state support and never creates more than sixteen cases', () => {
    expect(museumSlots([])).toEqual(Array(16).fill(null))
    expect(museumSlots([...demoMinerals, { ...demoMinerals[0], id: 'extra' }])).toHaveLength(16)
  })
  it('deduplicates exhibit records without changing their order', () => {
    expect(museumSlots([demoMinerals[0], demoMinerals[0]]).filter(Boolean)).toEqual([demoMinerals[0]])
  })
})
