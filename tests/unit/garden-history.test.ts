import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyCommunity, purchase, resetPurchases } from '../../src/features/garden/economy'
import { gardenDay, gardenHistoryKey, gardenWeek, readGardenHistory, recordGardenDay } from '../../src/features/garden/history'

beforeEach(()=>localStorage.clear())
describe('local Garden daily history',()=>{
 it('keeps genuine daily scenes through purchases and resets without granting inventory',()=>{
  const monday=new Date(2026,10,2,12),tuesday=new Date(2026,10,3,12),wednesday=new Date(2026,10,4,12)
  const start={...emptyCommunity,balance:1000}
  recordGardenDay('a',start,monday)
  const built=purchase(start,'cottage');recordGardenDay('a',built,tuesday)
  recordGardenDay('a',resetPurchases(built),wednesday)
  const history=readGardenHistory('a')
  expect(history[gardenDay(monday)].owned).toEqual([])
  expect(history[gardenDay(tuesday)].owned).toEqual(['cottage'])
  expect(history[gardenDay(wednesday)].owned).toEqual([])
  expect(history[gardenDay(tuesday)]).not.toHaveProperty('balance')
  expect(built.owned).toEqual(['cottage']);expect(readGardenHistory('other')).toEqual({})
 })
 it('does not invent earlier progress and keeps only 35 daily snapshots',()=>{
  for(let day=1;day<=40;day++)recordGardenDay('a',emptyCommunity,new Date(2026,8,day,12))
  expect(Object.keys(readGardenHistory('a'))).toHaveLength(35)
  expect(readGardenHistory('a')['2026-09-01']).toBeUndefined()
 })
 it('validates damaged local history and tolerates unavailable storage',()=>{
  localStorage.setItem(gardenHistoryKey('a'),'broken');expect(readGardenHistory('a')).toEqual({})
  localStorage.setItem(gardenHistoryKey('a'),JSON.stringify({'2026-11-02':{owned:['unknown','amethyst'],positions:{amethyst:{x:700,y:600}}}}))
  expect(readGardenHistory('a')['2026-11-02'].owned).toEqual(['amethyst'])
  const blocked=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('Storage unavailable')})
  expect(recordGardenDay('a',emptyCommunity)).toBe(false)
  blocked.mockRestore()
 })
 it('uses local calendar days and a Monday-first week across month boundaries',()=>{
  expect(gardenWeek(new Date(2026,10,1,12)).map(d=>d.key)).toEqual(['2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30','2026-10-31','2026-11-01'])
 })
})
