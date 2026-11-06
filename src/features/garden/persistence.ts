import { parseCommunity, type Community } from './economy'

export const GARDEN_DATABASE='pebble:garden:v1'
const storeName='gardens'
export type GardenRecord={owner:string;community:Community;revision:number}
export type PersistedChange={before:GardenRecord;after:GardenRecord;cancelled:boolean}
function validateRecord(record:GardenRecord){
 if(!Number.isSafeInteger(record.revision)||record.revision<0||!record.community||!Number.isSafeInteger(record.community.balance)||record.community.balance<0||!Array.isArray(record.community.owned)||!Array.isArray(record.community.earnedChapters))throw new Error('Invalid saved Garden')
 return record
}
function openGardenDatabase():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(GARDEN_DATABASE,1)
  let failed=false
  request.onupgradeneeded=()=>{request.result.createObjectStore(storeName,{keyPath:'owner'})}
  request.onblocked=()=>{failed=true;reject(new Error('Garden storage upgrade is blocked'))}
  request.onerror=()=>reject(request.error)
  request.onsuccess=()=>{
   const db=request.result
   if(failed){db.close();return}
   db.onversionchange=()=>db.close()
   resolve(db)
  }
 })
}
export async function readGardenRecord(owner:string):Promise<GardenRecord|null>{
 const db=await openGardenDatabase()
 return new Promise((resolve,reject)=>{
  const transaction=db.transaction(storeName,'readonly'),request=transaction.objectStore(storeName).get(owner)
  transaction.oncomplete=()=>{db.close();try{resolve(request.result?validateRecord(request.result):null)}catch(error){reject(error)}}
  transaction.onabort=()=>{db.close();reject(transaction.error??new Error('Garden read aborted'))}
 })
}
// No await inside the transaction: IndexedDB owns atomic read/modify/write ordering,
// including across renderer processes. localStorage is only a one-time legacy import.
export async function transactGarden(owner:string,legacyKey:string,reduce:(community:Community)=>Community,active:()=>boolean):Promise<PersistedChange|null>{
 const db=await openGardenDatabase()
 return new Promise((resolve,reject)=>{
  const transaction=db.transaction(storeName,'readwrite'),store=transaction.objectStore(storeName),request=store.get(owner)
  let result:PersistedChange|null=null,error:unknown
  request.onsuccess=()=>{
   try{
    if(!active()){transaction.abort();return}
    const existing=request.result as GardenRecord|undefined
    if(existing)validateRecord(existing)
    const before=existing??{owner,community:parseCommunity(localStorage.getItem(legacyKey)),revision:0}
    const community=reduce(before.community)
    const after=JSON.stringify(community)===JSON.stringify(before.community)?before:{owner,community,revision:before.revision+1}
    validateRecord(after)
    if(!existing||after!==before)store.put(after)
    result={before,after,cancelled:false}
   }catch(cause){error=cause;transaction.abort()}
  }
  transaction.oncomplete=()=>{db.close();resolve(result)}
  transaction.onabort=()=>{db.close();if(!active())resolve(null);else reject(error??transaction.error??new Error('Garden write aborted'))}
 })
}
