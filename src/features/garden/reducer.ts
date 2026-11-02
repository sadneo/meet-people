import { openGeode, purchase, removeGardenItem, resetPurchases, type Community, type UpgradeId } from './economy'
import { constrainPlacement, defaultPlacements, type MovableId, type Position } from './community-placement'

export type GardenAction =
 | { type:'build'; id:UpgradeId }
 | { type:'remove-garden-item'; id:UpgradeId }
 | { type:'open-geode'; random:number }
 | { type:'reset-purchases' }
 | { type:'demo-funds' }
 | { type:'restore-garden'; community:Community }
 | { type:'move-community-item'; id:MovableId; position:Position }

export function gardenReducer(state:{community:Community},action:GardenAction){
 const community=state.community
 switch(action.type){
  case 'build':return {community:purchase(community,action.id)}
  case 'remove-garden-item':return {community:removeGardenItem(community,action.id)}
  case 'open-geode':return {community:openGeode(community,action.random)}
  case 'reset-purchases':return {community:resetPurchases(community)}
  case 'demo-funds':return {community:{...community,balance:Math.min(1_000_000,community.balance+1000)}}
  case 'restore-garden':return JSON.stringify(community.geodeUnlocks??[])===JSON.stringify(action.community.geodeUnlocks??[])?{community:action.community}:state
  case 'move-community-item':
   if(!Object.hasOwn(defaultPlacements,action.id)||(action.id!=='pebble'&&!community.owned.includes(action.id as UpgradeId)))return state
   return {community:{...community,positions:{...community.positions,[action.id]:constrainPlacement(action.position,action.id)}}}
 }
}
