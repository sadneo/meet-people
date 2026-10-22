import { expect, it } from 'vitest'
import { constrainPlacement, parsePositions, validPlacement } from '../../src/features/prototype/community-placement'
import { parseCommunity, purchase, upgrades, type Community } from '../../src/features/prototype/economy'
import { initialState, reducer } from '../../src/features/prototype/model'

it('keeps edge, water and extreme drops on usable land', () => {
  for (const id of ['pebble', 'garnet', 'hall', 'bridge'] as const) {
    for (const point of [{ x: -1000, y: -1000 }, { x: 2000, y: 2000 }, { x: 978, y: 394 }, { x: 700, y: 640 }]) {
      expect(validPlacement(constrainPlacement(point, id), id)).toBe(true)
    }
  }
})
it('migrates old saves and rejects invalid, fixed and unowned positions', () => {
  const old: Community = { balance: 500, owned: ['garnet'], earnedChapters: [] }
  expect(parseCommunity(JSON.stringify(old)).owned).toEqual(['garnet'])
  expect(parsePositions({ 'tree-back': { x: 500, y: 500 }, sapphire: { x: 500, y: 500 }, garnet: { x: 'bad', y: 2 } }, ['garnet'])).toEqual({})
  expect(parsePositions({ pebble: { x: Infinity, y: 0 } }, [])).toEqual({})
  const state = reducer({ ...initialState, community: purchase(old, 'citrine') }, { type: 'move-community-item', id: 'citrine', position: { x: 800, y: 750 } })
  expect(parseCommunity(JSON.stringify(state.community)).positions).toEqual(state.community.positions)
  expect(reducer(state, { type: 'reset-community' }).community.positions).toEqual({})
})
it('prices all four collectible Pebbles above every existing decoration', () => {
  const rare = ['garnet', 'sapphire', 'emerald', 'citrine']
  const normalMax = Math.max(...upgrades.filter(item => !rare.includes(item.id)).map(item => item.cost))
  for (const id of rare) expect(upgrades.find(item => item.id === id)!.cost).toBeGreaterThan(normalMax)
})
