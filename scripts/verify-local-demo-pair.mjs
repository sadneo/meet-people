// Explicit local operator acceptance. Credentials arrive on stdin, stay in memory,
// and are never logged or saved. Uses genuine SDK Auth and actual HTTP endpoints.
import assert from 'node:assert/strict'
import { chromium,expect } from '@playwright/test'
async function readInput(){
 let raw='';for await(const chunk of process.stdin){raw+=chunk;if(raw.length>8192)throw new Error('Runtime input too large')}
 try{return JSON.parse(raw)}catch{throw new Error('Runtime input invalid')}
}
const input=await readInput()
assert.equal(typeof input.email,'string');assert.equal(typeof input.password,'string')
assert.deepEqual(input.dating,[{gender:'Man',sexuality:'Straight',intent:'Long-term relationship',style:'Monogamy'},{gender:'Woman',sexuality:'Straight',intent:'Long-term relationship',style:'Monogamy'}],'Explicit approved demo choices required')
const browser=await chromium.launch({headless:true}),participants=[],queued=new Set()
async function api(page,path,method='GET',body){
 const result=await page.evaluate(async({path,method,body})=>{
  const {supabase}=await import('/src/supabase.ts');const session=(await supabase.auth.getSession()).data.session
  if(!session)throw new Error('Real session required')
  const response=await fetch(path,{method,headers:{Authorization:`Bearer ${session.access_token}`,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'})
  return{status:response.status,data:await response.json()}
 },{path,method,body})
 assert.equal(result.status,200,`Demo endpoint ${method} ${path} returned ${result.status}; stop and reconcile`)
 return result.data
}
const matching=(page,path,method,body)=>api(page,'/api/matchmaking'+path,method,body)
try{
 for(let index=0;index<2;index++){
  const context=await browser.newContext({viewport:{width:index?1440:390,height:index?900:844}}),page=await context.newPage()
  await page.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort())
  await page.goto('http://127.0.0.1:3006/login')
  if(index===0){await page.getByRole('button',{name:'Sign in as development user',exact:true}).click();await page.waitForURL(url=>url.pathname!=='/login')}
  else{
   const signed=await page.evaluate(async({email,password})=>{const {supabase}=await import('/src/supabase.ts');const result=await supabase.auth.signInWithPassword({email,password});return !!result.data.session&&result.data.user?.is_anonymous===false&&!result.error},{email:input.email,password:input.password})
   assert.equal(signed,true,'Second real sign-in failed')
  }
  const id=await page.evaluate(async()=>{const {supabase}=await import('/src/supabase.ts');return(await supabase.auth.getUser()).data.user.id})
  const account=await matching(page,'/account');assert.equal(account.completed.length,4)
  const initial=await matching(page,'/status');assert.equal(initial.mode,null,'Existing queue must be preserved; stop test')
  const participant={context,page,id,name:account.profile.display_name};participants.push(participant)
  let detailed=await matching(page,'/detailed-settings')
  await matching(page,'/detailed-settings','PUT',{expectedRevision:detailed.revision,settings:{...detailed.settings,friendsDiscovery:true,datingDiscovery:true}})
  for(const mode of ['friends','dating']){
   const receipt=await matching(page,'/search-locations/resolve','POST',{requestId:crypto.randomUUID(),mode,source:'temporary',placeId:'b641ad29-9f92-4e66-9490-0b616f8fd85c'})
   assert.equal(receipt.usable,true)
   const area={source:'temporary',areaLabel:'Stony Brook University',resolvedLocationRef:receipt.id}
   if(mode==='friends'){
    const prior=await matching(page,'/friends-search-preferences')
    await matching(page,'/friends-search-preferences','PUT',{expectedRevision:prior.revision,preferences:{ageMin:18,ageMax:99,radiusMiles:15,goals:prior.preferences?.goals??[],searchArea:area}})
    assert.equal((await matching(page,'/friends-search-preferences/runtime')).canJoin,true,'Friends eligibility not met')
   }else{
    let prior=await matching(page,'/dating-preferences')
    if(prior.profile.enabled){await matching(page,'/dating/enabled','PUT',{expectedProfileRevision:prior.profileRevision,expectedSearchRevision:prior.searchRevision,enabled:false});prior=await matching(page,'/dating-preferences')}
    await matching(page,'/dating-preferences','PUT',{expectedProfileRevision:prior.profileRevision,expectedSearchRevision:prior.searchRevision,profile:{...prior.profile,...input.dating[index],enabled:false,clarifiedTargets:[]},search:{ageMin:18,ageMax:99,radiusMiles:15,searchArea:area}})
    assert.equal((await matching(page,'/dating/status')).canStart,true,'Dating adult/consent/location eligibility not met')
   }
  }
  console.log(`PASS account${index+1}: real Auth, canonical onboarding, saved mode-independent campus filters and explicit discovery/details readback`)
 }
 const [first,second]=participants
 for(const participant of participants){
  await participant.page.goto('http://127.0.0.1:3006/matchmaking');queued.add(participant)
  await participant.page.getByRole('button',{name:'Find Friends',exact:true}).click()
  await expect(participant.page.getByRole('button',{name:'Check for a match',exact:true})).toBeVisible()
 }
 await first.page.getByRole('button',{name:'Check for a match',exact:true}).click()
 await expect(first.page.locator('.match-person').getByRole('heading',{name:second.name,exact:true})).toBeVisible()
 console.log('PASS actual two-real-user Friends: Find Friends on both -> manual Check -> genuine other account candidate')
 for(const participant of participants){await participant.page.getByRole('button',{name:'Cancel search',exact:true}).click();await expect(participant.page.getByRole('button',{name:'Find Friends',exact:true})).toBeVisible();queued.delete(participant)}
 for(const participant of participants){
  await participant.page.goto('http://127.0.0.1:3006/matchmaking?view=dating')
  await participant.page.getByRole('button',{name:'Start Dating discovery',exact:true}).click()
  await expect(participant.page.getByRole('button',{name:'Pause Dating discovery',exact:true})).toBeVisible()
 }
 await first.page.getByRole('button',{name:'Find someone',exact:true}).click()
 await expect(first.page.locator('.dating-live-card').getByRole('heading')).toContainText(second.name)
 await first.page.getByRole('button',{name:'Send connection request',exact:true}).click()
 await expect(first.page.getByRole('status').filter({hasText:/Connection request sent\.|Connected\./})).toBeVisible()
 const sent=await api(first.page,`/api/connections/${second.id}`)
 assert.ok(['sent','connected'].includes(sent.status),'Real request not persisted')
 const accepted=sent.status==='connected'?sent:await api(second.page,`/api/connections/${first.id}/accept`,'POST',{})
 assert.equal(accepted.status,'connected');assert.equal(typeof accepted.conversationId,'string')
 await first.page.reload()
 const readback=await api(first.page,`/api/connections/${second.id}`)
 assert.equal(readback.status,'connected');assert.equal(readback.conversationId,accepted.conversationId)
 console.log('PASS actual two-real-user Dating: explicit opt-in on both -> real reciprocal candidate -> real request -> recipient Connections acceptance -> persisted connection readback after reload')
 console.log('No fabricated users/candidates/photos/messages. Friends queues left; approved preferences/discovery and actual connection retained for demo. No chat message sent.')
}finally{
 for(const participant of queued){try{await matching(participant.page,'/queue','DELETE')}catch{console.error('Queue cleanup unconfirmed; inspect own demo search')}}
 await browser.close()
}
