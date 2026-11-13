import { expect, test, type Page } from '@playwright/test'
import type { Community } from '../../src/features/garden/economy'
import { wiringFixture, user } from './wiring-fixture'

// These probes cover retained device-local records, not the account wallet.
const legacyKey=`pebble:full-ui:community:v1:${user}`
async function probe(page:Page){
 await page.route('**/garden-storage-probe',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Legacy Garden storage probe</title>'}))
 await page.goto('/garden-storage-probe')
}
async function record(page:Page){return page.evaluate(async owner=>{
 const path='/src/features/garden/persistence.ts';const {readGardenRecord}=await import(path)
 return await readGardenRecord(owner)
},user)}

test('legacy IndexedDB transactions serialize 100 build/refund cycles without Web Locks',async({page,context})=>{
 test.setTimeout(120_000)
 await probe(page)
 await page.evaluate(key=>localStorage.setItem(key,JSON.stringify({balance:1000,owned:[],earnedChapters:[]})),legacyKey)
 const second=await context.newPage();await probe(second)
 for(const tab of [page,second])await tab.evaluate(()=>Object.defineProperty(navigator,'locks',{configurable:true,value:undefined}))
 for(let cycle=0;cycle<100;cycle++)for(const type of ['build','remove-garden-item'] as const){
  const results=await Promise.all([page,second].map((tab,index)=>tab.evaluate(async({owner,index,type,key})=>{
   const path='/src/features/garden/persistence.ts',reducerPath='/src/features/garden/reducer.ts'
   const {transactGarden}=await import(path),{gardenReducer}=await import(reducerPath)
   return await transactGarden(owner,key,(community:Community)=>gardenReducer({community},{type,id:index===0?'bench':'lanterns'}).community,()=>true)
  },{owner:user,index,type,key:legacyKey})))
  const expected=type==='build'?{balance:965,owned:['bench','lanterns']}:{balance:1000,owned:[]}
  for(const tab of [page,second]){
   const saved=await record(tab)
   expect({...saved!.community,owned:saved!.community.owned.toSorted()}).toMatchObject(expected)
  }
  expect(results.every(result=>result&&!result.cancelled)).toBe(true)
 }
})

test('legacy import preserves device records and never reimports edited mirrors',async({page})=>{
 await probe(page)
 const legacy:Community={balance:333,owned:['bench','river','amethyst'],earnedChapters:[1],geodeUnlocks:['amethyst'],purchaseCosts:{bench:15,river:80},positions:{bench:{x:576,y:792}},freshStart:true}
 await page.evaluate(({key,legacy})=>localStorage.setItem(key,JSON.stringify(legacy)),{key:legacyKey,legacy})
 await page.evaluate(async({owner,key})=>{
  const path='/src/features/garden/persistence.ts';const {transactGarden}=await import(path)
  await transactGarden(owner,key,(community:Community)=>community,()=>true)
 },{owner:user,key:legacyKey})
 expect((await record(page))!.community).toEqual(legacy)
 await page.evaluate(key=>localStorage.setItem(key,JSON.stringify({balance:999999,owned:[],earnedChapters:[]})),legacyKey)
 await page.evaluate(async({owner,key})=>{
  const path='/src/features/garden/persistence.ts';const {transactGarden}=await import(path)
  await transactGarden(owner,key,(community:Community)=>community,()=>true)
 },{owner:user,key:legacyKey})
 expect((await record(page))!.community).toEqual(legacy)
})

test('an aborted legacy transaction cannot acknowledge or partially save a purchase',async({page})=>{
 await probe(page)
 await page.evaluate(key=>localStorage.setItem(key,JSON.stringify({balance:1000,owned:[],earnedChapters:[]})),legacyKey)
 const result=await page.evaluate(async({owner,key})=>{
  const path='/src/features/garden/persistence.ts';const {transactGarden}=await import(path)
  await transactGarden(owner,key,(community:Community)=>community,()=>true)
  IDBObjectStore.prototype.put=()=>{throw new DOMException('Quota exceeded','QuotaExceededError')}
  try{
   await transactGarden(owner,key,(community:Community)=>({...community,balance:985,owned:['bench']}),()=>true)
   return 'acknowledged'
  }catch{return 'rejected'}
 },{owner:user,key:legacyKey})
 expect(result).toBe('rejected')
 expect((await record(page))!.community).toMatchObject({balance:1000,owned:[]})
})

test('legacy IndexedDB currency cannot credit the account wallet or become an offline fallback',async({page})=>{
 await probe(page)
 await page.evaluate(async({owner,key})=>{
  const path='/src/features/garden/persistence.ts';const {transactGarden}=await import(path)
  await transactGarden(owner,key,()=>({balance:999999,owned:['bench'],earnedChapters:[]}),()=>true)
 },{owner:user,key:legacyKey})
 const fixture=await wiringFixture(page)
 await page.goto('/')
 await expect(page.getByRole('button',{name:'Build with 300 Pebbles',exact:true})).toBeEnabled()
 expect(fixture.garden.read()).toMatchObject({balance:300,owned:[]})
 expect(fixture.garden.calls.filter(call=>call.method==='POST')).toHaveLength(0)
 expect((await record(page))!.community).toMatchObject({balance:999999,owned:['bench']})
 fixture.garden.fail(true)
 const result=await page.evaluate(async owner=>{
  const path='/src/features/garden/state.ts';const {updateGarden}=await import(path)
  return await updateGarden(owner,{type:'build',id:'bench'})
 },user)
 expect(result.cancelled).toBe(true);expect(result.saved).toBe(false)
 expect(fixture.garden.read()).toMatchObject({balance:300,owned:[]})
 await expect(page.getByRole('alert')).toContainText('could not be confirmed')
 expect((await record(page))!.community).toMatchObject({balance:999999,owned:['bench']})
})
