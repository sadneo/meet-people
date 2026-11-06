// Browser contract fixture only. Real currency/security acceptance lives in
// tests/integration/garden-economy.mjs and uses the actual PostgreSQL RPC.
import type { BrowserContext, Page } from '@playwright/test'
import { emptyCommunity, type Community, purchaseRefund } from '../../src/features/garden/economy'
import { gardenReducer, type GardenAction } from '../../src/features/garden/reducer'
import type { GardenResponse } from '../../shared/garden'

type FixtureState={community:Community;revision:number;undo:Community[];checked:boolean;profile:boolean;social:NonNullable<GardenResponse['rewards']['social']>;checkInDays:string[];overrides:Partial<GardenResponse['rewards']>}
const contexts=new WeakMap<BrowserContext,Map<string,FixtureState>>()
export async function gardenFixture(page:Page){
 if(!contexts.has(page.context()))contexts.set(page.context(),new Map())
 const states=contexts.get(page.context())!
 const fresh=()=>({community:{...emptyCommunity,balance:300},revision:0,undo:[] as Community[],checked:false,profile:false,social:{connectionsClaimed:0,connectionAvailable:false,keepInTouchClaimed:false,keepInTouchAvailable:false},checkInDays:[] as string[],overrides:{} as Partial<GardenResponse['rewards']>})
 const state=(token='Bearer browser-user-jwt')=>{if(!states.has(token))states.set(token,fresh());return states.get(token)!}
 const calls:{method:string;body:Record<string,unknown>}[]=[]
 let fail=false,loseResponse=false
 await page.route('**/api/garden',async route=>{
  const req=route.request(),s=state(req.headers().authorization),body=req.postDataJSON()??{}
  calls.push({method:req.method(),body})
  if(fail)return route.fulfill({status:503,json:{error:'Garden unavailable'}})
  if(req.method()==='POST'){
   if(body.revision!==s.revision)return route.fulfill({status:409,json:{error:'Stale Garden'}})
   if(body.action==='check-in'){if(!s.checked)s.community={...s.community,balance:s.community.balance+20};s.checked=true;if(!s.checkInDays.includes('2026-11-05'))s.checkInDays.push('2026-11-05')}
   else if(body.action==='profile-reward'){if(!s.profile)s.community={...s.community,balance:s.community.balance+100};s.profile=true}
   else if(body.action==='connection-reward'&&s.social.connectionAvailable){s.community={...s.community,balance:s.community.balance+30};s.social={...s.social,connectionsClaimed:s.social.connectionsClaimed+1,connectionAvailable:false}}
   else if(body.action==='keep-in-touch'&&s.social.keepInTouchAvailable){s.community={...s.community,balance:s.community.balance+20};s.social={...s.social,keepInTouchClaimed:true,keepInTouchAvailable:false}}
   else if(body.action==='undo'){
    const before=s.undo.pop();if(before)s.community={...before,balance:s.community.balance+purchaseRefund(s.community)-purchaseRefund(before)}
   }else{
    const action:GardenAction=body.action==='build'?{type:'build',id:body.id}:body.action==='remove'?{type:'remove-garden-item',id:body.id}:body.action==='geode'?{type:'open-geode',random:0}:body.action==='reset'?{type:'reset-purchases'}:{type:'move-community-item',id:body.id,position:body.position}
    const next=gardenReducer(s,action).community
    if(next===s.community)return route.fulfill({status:400,json:{error:'Cannot complete Garden action'}})
    if(body.action==='geode')s.undo=[];else if(next!==s.community)s.undo.push(structuredClone(s.community))
    s.community=next
   }
   s.revision++
   if(loseResponse){loseResponse=false;return route.abort()}
  }
  const value:GardenResponse={revision:s.revision,canUndo:!!s.undo.length,community:{...s.community,positions:s.community.positions??{},purchaseCosts:s.community.purchaseCosts??{},geodeUnlocks:s.community.geodeUnlocks??[],freshStart:true},rewards:{day:'2026-11-05',nextCheckIn:'2026-11-06T00:00:00Z',checkedIn:s.checked,weekDays:s.checkInDays.length,weekStart:'2026-11-02',checkInDays:s.checkInDays,social:s.social,weeklyBonus:false,profileEligible:true,profileClaimed:s.profile,...s.overrides}}
  return route.fulfill({json:value})
 })
 return {calls,serverRewards:(value:Partial<GardenResponse['rewards']>)=>{state().overrides=value},rewards:(value:{social?:NonNullable<GardenResponse['rewards']['social']>;days?:string[];collected?:boolean})=>{if(value.social)state().social=value.social;if(value.days)state().checkInDays=value.days;if(value.collected){state().checked=true;state().profile=true}},seed:(community:Community)=>{state().community=structuredClone(community);state().revision++;state().undo=[]},fail:(value:boolean)=>{fail=value},loseNextResponse:()=>{loseResponse=true},read:()=>state().community}
}
