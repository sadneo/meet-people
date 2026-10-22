import { expect, it } from 'vitest'
import { buildSections, emptyCommunity, parseCommunity, purchase, purchaseRefund, resetPurchases, upgrades, type Community } from '../../src/features/prototype/economy'
import { initialState, reducer } from '../../src/features/prototype/model'

it('renders every catalog item once with the four 300-Pebble rocks in Rare Finds', () => {
  expect(buildSections[0].name).toBe('Rare Finds')
  expect(buildSections[0].items.map(item => [item.name, item.cost])).toEqual([['Garnet', 300], ['Sapphire', 300], ['Emerald', 300], ['Citrine', 300]])
  expect(buildSections.flatMap(section => section.items).map(item => item.id).sort()).toEqual(upgrades.map(item => item.id).sort())
})
it('refunds actual recorded spend once and preserves earned history while clearing all positions', () => {
  const start: Community = { ...emptyCommunity, balance: 2000, earnedChapters: [0, 1], positions: { pebble: { x: 744, y: 660 } } }
  let bought = purchase(purchase(start, 'garnet'), 'bench')
  bought = { ...bought, positions: { ...bought.positions, garnet: { x: 720, y: 720 }, bench: { x: 600, y: 700 } } }
  expect(bought.purchaseCosts).toEqual({ garnet: 300, bench: 15 })
  const reset = resetPurchases(parseCommunity(JSON.stringify(bought)))
  expect(reset.balance).toBe(2000)
  expect(reset.owned).toEqual([])
  expect(reset.purchaseCosts).toEqual({})
  expect(reset.positions).toEqual({})
  expect(parseCommunity(JSON.stringify(reset)).freshStart).toBe(true)
  expect(purchase(reset, 'garnet').freshStart).toBe(true)
  expect(reset.earnedChapters).toEqual([0, 1])
  expect(resetPurchases(reset)).toBe(reset)
  expect(purchase(reset, 'garnet').balance).toBe(1700)
})
it('uses legacy catalog prices only for owned items and ignores stray receipts', () => {
  const legacy: Community = { balance: 80, owned: ['garnet', 'bench', 'bench'], earnedChapters: [] }
  expect(purchaseRefund(legacy)).toBe(315)
  expect(resetPurchases(legacy).balance).toBe(395)
  const recorded = { ...legacy, purchaseCosts: { garnet: 250, sapphire: 300 } }
  expect(purchaseRefund(recorded)).toBe(265)
  const invalid = parseCommunity(JSON.stringify({ ...legacy, purchaseCosts: { garnet: -1, bench: 'bad' } }))
  expect(purchaseRefund(invalid)).toBe(315)
})
it('does not discard an exact refund above the demo funding cap on reload', () => {
  const full = { ...emptyCommunity, balance: 1_000_000, owned: ['garnet'] as const }
  const reset = resetPurchases({ ...full, owned: [...full.owned] })
  expect(reset.balance).toBe(1_000_300)
  expect(parseCommunity(JSON.stringify(reset)).balance).toBe(1_000_300)
  expect(reducer({ ...initialState, community: reset }, { type: 'demo-funds' }).community.balance).toBe(1_000_300)
})
it('changes only Community purchase data in the app reducer', () => {
  const before = { ...initialState, community: purchase({ ...emptyCommunity, balance: 350 }, 'citrine') }
  const after = reducer(before, { type: 'reset-purchases' })
  expect(after.community.balance).toBe(350)
  for (const key of Object.keys(before) as (keyof typeof before)[]) if (key !== 'community') expect(after[key]).toBe(before[key])
})

it('can reset the developed base without purchases or an arbitrary refund', () => {
  const reset = resetPurchases({ ...emptyCommunity, balance: 50 })
  expect(reset.freshStart).toBe(true)
  expect(reset.balance).toBe(50)
  expect(resetPurchases(reset)).toBe(reset)
})
