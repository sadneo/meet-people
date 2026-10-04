import { describe, expect, it } from 'vitest'
import { emptyCommunity, parseCommunity, purchase, upgrades } from '../src/features/prototype/economy'
import { initialState, reducer } from '../src/features/prototype/model'

describe('manual community purchases', () => {
  it('deducts exact catalog prices and rejects duplicates and insufficient balances', () => {
    expect(upgrades.map(item => item.cost)).toEqual([10, 15, 20, 25, 30, 40, 55, 70, 90, 120])
    expect(purchase(emptyCommunity, 'flowers')).toBe(emptyCommunity)
    const bought = purchase({ ...emptyCommunity, balance: 10 }, 'flowers')
    expect(bought.balance).toBe(0)
    expect(bought.owned).toEqual(['flowers'])
    expect(purchase(bought, 'flowers')).toBe(bought)
    expect(purchase(bought, 'bench')).toBe(bought)
  })
  it('persists only valid local economy data and tolerates damaged storage', () => {
    const saved = { balance: 25, owned: upgrades.map(upgrade => upgrade.id), earnedChapters: [0, 1] }
    expect(parseCommunity(JSON.stringify(saved))).toEqual(saved)
    expect(parseCommunity('{bad json')).toEqual(emptyCommunity)
    expect(parseCommunity(JSON.stringify({ ...saved, balance: -20 }))).toEqual(emptyCommunity)
    expect(parseCommunity(JSON.stringify({ ...saved, balance: 1.2 }))).toEqual(emptyCommunity)
    expect(parseCommunity(JSON.stringify({ ...saved, owned: ['flowers', 'flowers', 'unknown'], earnedChapters: [0, 0, 7] }))).toEqual({ balance: 25, owned: ['flowers'], earnedChapters: [0] })
  })
  it('onboarding earns currency once, including after reload, but never builds anything', () => {
    const first = reducer(initialState, { type: 'chapter', chapter: 0, profile: initialState.profile })
    expect(first.community).toEqual({ balance: 10, owned: [], earnedChapters: [0] })
    const reloaded = { ...initialState, community: parseCommunity(JSON.stringify(first.community)) }
    const repeat = reducer(reloaded, { type: 'chapter', chapter: 0, profile: initialState.profile })
    expect(repeat.community.balance).toBe(10)
    expect(repeat.community.owned).toEqual([])
    const reset = reducer(repeat, { type: 'reset-community' })
    expect(reset.community).toEqual({ balance: 0, owned: [], earnedChapters: [0] })
  })
})
