// @vitest-environment node
import { afterEach,expect,it,vi } from 'vitest'
import express from 'express'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createGardenRouter } from '../../api/garden'
import type { UserContextTransport } from '../../api/matchmaking'
import { GardenCommandSchema, GardenResponseSchema, hasGardenReward } from '../../shared/garden'
import { upgrades } from '../../src/features/garden/economy'
import { readFileSync } from 'node:fs'
let server:Server|undefined
afterEach(async()=>{if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));server=undefined})
const result={revision:0,canUndo:false,community:{balance:300,owned:[],earnedChapters:[],geodeUnlocks:[],positions:{},purchaseCosts:{},freshStart:true},rewards:{day:'2026-11-05',nextCheckIn:'2026-11-06T00:00:00Z',checkedIn:false,weekDays:0,weeklyBonus:false,profileClaimed:false,profileEligible:true}}
const request={requestId:'a0000000-0000-4000-8000-000000000001',revision:0,action:'check-in'}
async function setup(code?:string,verified=true){
 const garden=vi.fn(async()=>({data:result,error:code?{code}:null})),verify=vi.fn(async()=>verified?{id:'actor'}:null),actor=vi.fn(()=>({garden}))
 const app=express();app.use(express.json());app.use('/api/garden',createGardenRouter({verify,actor} as unknown as UserContextTransport))
 server=await new Promise<Server>(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))})
 const call=(body?:unknown,token='good')=>fetch(`http://127.0.0.1:${(server!.address() as AddressInfo).port}/api/garden`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined})
 return {call,garden,verify,actor}
}
it('uses verified actor and fixed RPC; never accepts an amount or owner',async()=>{
 const {call,garden,verify,actor}=await setup();expect((await call()).status).toBe(200);expect(verify).toHaveBeenCalledWith('good');expect(actor).toHaveBeenCalledWith('good')
 expect((await call(request)).status).toBe(200);expect(garden).toHaveBeenLastCalledWith(request)
 const count=garden.mock.calls.length
 expect((await call({...request,owner:'other',amount:9999})).status).toBe(400);expect(garden).toHaveBeenCalledTimes(count)
})
it('rejects unauthenticated users before the RPC',async()=>{const {call,garden}=await setup(undefined,false);expect((await call()).status).toBe(401);expect(garden).not.toHaveBeenCalled()})
it.each([['GR409',409],['GR429',429],['GR400',400],['42501',403],['PGRST202',503]])('maps %s safely to %s',async(code,status)=>{const{call}=await setup(code);const response=await call(request);expect(response.status).toBe(status);expect(await response.text()).not.toContain(code)})
it('strict commands reject client-selected geodes, arbitrary undo snapshots and clocks',()=>{
 for(const extra of [{random:0},{community:result.community},{now:'2030-01-01'}])expect(GardenCommandSchema.safeParse({...request,...extra}).success).toBe(false)
 expect(GardenCommandSchema.safeParse({...request,action:'move',id:'bench',position:{x:NaN,y:0}}).success).toBe(false)
 expect(GardenCommandSchema.safeParse({...request,action:'move',id:'bench'}).success).toBe(false)
})
it('SQL prices stay in sync with the existing Garden catalog',()=>{
 const migration=readFileSync('supabase/migrations/20261105000000_garden_economy.sql','utf8')
 for(const item of upgrades)expect(migration).toContain(`('${item.id}',${item.cost},`)
})
it('social claims reach the owner RPC without client-selected evidence or payouts',async()=>{
 const {call,garden}=await setup()
 for(const action of ['connection-reward','keep-in-touch']){
  expect((await call({...request,action})).status).toBe(200)
  expect(garden).toHaveBeenLastCalledWith({...request,action})
  for(const field of [{peer:'other'},{amount:30},{date:'2026-11-05'},{id:'peer'},{messages:[]}])expect((await call({...request,action,...field})).status).toBe(400)
 }
})
it('reward dot uses confirmed claimability, not weekly progress; old responses remain compatible',()=>{
 expect(GardenResponseSchema.safeParse(result).success).toBe(true)
 expect(hasGardenReward()).toBe(false)
 expect(hasGardenReward(result.rewards)).toBe(true)
 const rewards={...result.rewards,checkedIn:true,profileClaimed:true,weekDays:4}
 expect(hasGardenReward(rewards)).toBe(false)
 const social={connectionsClaimed:0,connectionAvailable:false,keepInTouchClaimed:false,keepInTouchAvailable:false}
 expect(hasGardenReward({...rewards,social})).toBe(false)
 expect(hasGardenReward({...rewards,social:{...social,connectionAvailable:true}})).toBe(true)
 expect(hasGardenReward({...rewards,social:{...social,keepInTouchAvailable:true}})).toBe(true)
})
