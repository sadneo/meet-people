import { expect,test } from '@playwright/test'
import sharp from 'sharp'
import { sharedProfileFixture } from './shared-profile-fixture'
import { emptyDatingProfile,type DatingAggregate } from '../shared/dating'
const owner='a0000000-0000-4000-8000-000000000001',peer='a0000000-0000-4000-8000-000000000002',ref='ac000000-0000-4000-8000-000000000001'
async function setup(page:import('@playwright/test').Page,enabled=false,uncertain=false){
 const base=await sharedProfileFixture(page)
 const image=await sharp({create:{width:400,height:600,channels:3,background:'#a9bca0'}}).jpeg().toBuffer()
 let aggregate:DatingAggregate={profileRevision:1,searchRevision:1,profile:{...emptyDatingProfile(),gender:'Man',sexuality:'Straight',intent:'Long-term relationship',style:'Monogamy',enabled},search:{ageMin:18,ageMax:99,radiusMiles:15,searchArea:{source:'home',resolvedLocationRef:ref}},eligibility:{asOf:'2026-10-19',adult:true,locationResolved:true},effectiveEnabled:enabled}
 const mutations:{kind:string;body:any}[]=[],searches:string[][]=[]
 const runtime=()=>({available:true,aggregate,canStart:true,globalDiscovery:true,datingDiscovery:true})
 await page.route('**/api/matchmaking/dating-preferences',route=>route.fulfill({json:aggregate}))
 await page.route('**/api/matchmaking/search-locations/dating/*',route=>route.fulfill({json:{id:ref,mode:'dating',source:'home',areaLabel:'Campus',method:'geocoded-area',expiresAt:'2030-01-01T00:00:00Z',usable:true}}))
 await page.route('**/api/matchmaking/profile-photo/**',route=>{expect(route.request().headers().authorization).toBeTruthy();return route.fulfill({contentType:'image/jpeg',body:image,headers:{'cache-control':'no-store'}})})
 await page.route('**/api/matchmaking/dating/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname
  if(path.endsWith('/status'))return route.fulfill({json:runtime()})
  if(path.endsWith('/enabled')){
   const value=request.postDataJSON();expect(value.expectedProfileRevision).toBe(aggregate.profileRevision);expect(value.expectedSearchRevision).toBe(aggregate.searchRevision)
   mutations.push({kind:'consent',body:value});aggregate={...aggregate,profileRevision:aggregate.profileRevision+1,searchRevision:aggregate.searchRevision+1,profile:{...aggregate.profile,enabled:value.enabled},effectiveEnabled:value.enabled};return route.fulfill({json:runtime()})
  }
  if(path.endsWith('/candidate')){
   const {excludedIds}=request.postDataJSON();searches.push(excludedIds)
   return route.fulfill({json:{candidate:excludedIds.includes(peer)?null:{id:peer,name:'Real API fixture Morgan',age:25,city:'Campus',bio:'Weekend hikes and good coffee.',avatar:null,photoRevision:1,interests:['Custom pottery','Coffee','Hiking'],areaDistanceMiles:2,heightInches:null,gender:null,sexuality:null,intent:'Long-term relationship',style:'Monogamy'}}})
  }
  expect(path).toBe(`/api/matchmaking/dating/requests/${peer}`);expect(request.postDataJSON()).toEqual({});mutations.push({kind:'request',body:{target:peer}})
  return uncertain?route.fulfill({status:503,json:{error:'The request may already be saved. Check Connections before trying again.'}}):route.fulfill({json:{status:'sent',conversationId:null}})
 })
 return{...base,mutations,searches,owner}
}
for(const width of [320,390,1440])test(`real Dating opt-in, manual candidate, private photo, request and pause at ${width}`,async({page},testInfo)=>{
 await page.setViewportSize({width,height:width===1440?900:844});const fixture=await setup(page)
 await page.goto('/matchmaking?view=dating');await expect(page.getByRole('button',{name:'Start Dating discovery',exact:true})).toBeVisible()
 expect(fixture.mutations).toEqual([]);expect(fixture.searches).toEqual([]);await expect(page.getByText('Local prototype recommendations — not live Dating matches.',{exact:true})).toHaveCount(0)
 await page.getByRole('button',{name:'Start Dating discovery',exact:true}).click();await expect(page.getByRole('button',{name:'Pause Dating discovery',exact:true})).toBeVisible();expect(fixture.searches).toEqual([])
 await page.getByRole('button',{name:'Find someone',exact:true}).click();await expect(page.getByRole('article',{name:'Real API fixture Morgan, 25, Dating profile',exact:true})).toBeVisible();await expect(page.getByRole('img',{name:"Real API fixture Morgan's profile photo",exact:true})).toHaveAttribute('src',/^blob:/)
 await page.locator('.dating-deck-focus').evaluate(element=>{element.scrollTop=0});await page.screenshot({path:testInfo.outputPath('dating-live-card.png')})
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width)
 const send=page.getByRole('button',{name:'Send connection request',exact:true});await send.scrollIntoViewIfNeeded();await page.keyboard.press('Tab');await send.focus();expect(await send.evaluate(element=>getComputedStyle(element).outlineStyle)).toBe('solid');await page.screenshot({path:testInfo.outputPath('dating-live-actions.png')})
 await send.click();await expect(page.getByRole('status').filter({hasText:'Connection request sent.'})).toBeVisible();expect(fixture.mutations.filter(value=>value.kind==='request')).toHaveLength(1)
 await page.getByRole('button',{name:'Skip for this visit',exact:true}).click();await expect(page.getByRole('heading',{name:'No one found this time.',exact:true})).toBeVisible();expect(fixture.searches).toEqual([[],[peer]])
 await page.getByRole('button',{name:'Pause Dating discovery',exact:true}).click();await expect(page.getByRole('button',{name:'Start Dating discovery',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Dating preferences',exact:true}).click();const sheet=page.getByRole('dialog',{name:'Your kind of connection.',exact:true});await expect(sheet).toBeVisible();await page.keyboard.press('Escape');await expect(sheet).not.toBeVisible()
 expect(fixture.external).toEqual([])
})
test('an uncertain Dating request does not claim success or automatically retry',async({page})=>{
 const fixture=await setup(page,true,true);await page.goto('/matchmaking?view=dating');await page.getByRole('button',{name:'Find someone',exact:true}).click();await page.getByRole('button',{name:'Send connection request',exact:true}).click()
 await expect(page.getByRole('alert')).toContainText('may already be saved');await expect(page.getByText('Connection request sent.',{exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Find someone',exact:true})).toBeDisabled()
 await page.getByRole('button',{name:'Reload Dating',exact:true}).click();await expect(page.getByRole('button',{name:'Find someone',exact:true})).toBeEnabled();expect(fixture.mutations.filter(value=>value.kind==='request')).toHaveLength(1);expect(fixture.searches).toHaveLength(1);expect(fixture.external).toEqual([])
})
