import { describe, expect, it } from 'vitest'
import { emptyCommunity, openGeode, parseCommunity, purchase, purchaseRefund, removeGardenItem, resetPurchases } from '../../src/features/garden/economy'
import { geodeRocks } from '../../src/features/garden/geodes'
import { gardenReducer as reducer } from '../../src/features/garden/reducer'
const initialState = {community:emptyCommunity}

describe('integrated Garden collection',()=>{
 it('undo restores placement/purchases but cannot undo a geode unlock',()=>{
  const before={...initialState,community:{...emptyCommunity,balance:500}}
  const bought=reducer(before,{type:'build',id:'bench'})
  expect(reducer(bought,{type:'restore-garden',community:before.community}).community).toEqual(before.community)
  const unlocked=reducer(before,{type:'open-geode',random:0})
  expect(reducer(unlocked,{type:'restore-garden',community:before.community})).toBe(unlocked)
 })
 it('unlocks exactly four unique rocks, charges 300 each, refuses a fifth',()=>{
  let state={...emptyCommunity,balance:1500}
  for(let i=0;i<4;i++)state=openGeode(state,.5)
  expect(new Set(state.geodeUnlocks).size).toBe(4);expect(state.balance).toBe(300)
  expect(openGeode(state,.5)).toBe(state)
 })
 it('cannot buy without funds or place a locked rock',()=>{
  expect(openGeode({...emptyCommunity,balance:299},.1).geodeUnlocks).toBeUndefined()
  expect(purchase(emptyCommunity,'amethyst')).toBe(emptyCommunity)
  expect(openGeode({...emptyCommunity,balance:300},NaN).balance).toBe(300)
 })
 it('reset refunds regular purchases and returns geodes to free inventory without rerolls',()=>{
  let state=openGeode({...emptyCommunity,balance:1000},0)
  state=purchase(purchase(state,'amethyst'),'bench')
  expect(purchaseRefund(state)).toBe(15)
  const reset=resetPurchases(state)
  expect(reset.balance).toBe(700);expect(reset.geodeUnlocks).toEqual(['amethyst']);expect(reset.owned).toEqual([])
  const placed=purchase(reset,'amethyst');expect(placed.balance).toBe(700)
  expect(removeGardenItem(placed,'amethyst').balance).toBe(700)
  expect(openGeode(reset,0).geodeUnlocks).toEqual(['amethyst','rose-quartz'])
 })
 it('reload keeps inventory, rejects fake refund receipts and locked placements',()=>{
  const state=parseCommunity(JSON.stringify({...emptyCommunity,balance:20,owned:['amethyst','pyrite'],geodeUnlocks:['amethyst','amethyst','unknown'],purchaseCosts:{amethyst:300}}))
  expect(state.geodeUnlocks).toEqual(['amethyst']);expect(state.owned).toEqual(['amethyst']);expect(purchaseRefund(state)).toBe(0)
  expect(geodeRocks).toHaveLength(4)
 })
})
