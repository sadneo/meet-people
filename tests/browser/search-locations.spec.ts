import { expect, test } from '@playwright/test'
import { sharedProfileFixture } from './shared-profile-fixture'
import { emptyDatingProfile, SaveDatingAggregateSchema, type DatingAggregate } from '../../shared/dating'
import { SaveFriendsSearchPreferencesSchema, type FriendsSearchPreferences } from '../../shared/friends-search-preferences'

for(const mode of ['Friends','Dating'] as const)for(const width of [320,390,1440]){
 test(`${mode} search area selection, explicit save and cancel at ${width}`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:width===1440?900:844})
  const base=await sharedProfileFixture(page)
  const id='ac000000-0000-4000-8000-000000000001',receipts=new Map<string,object>(),writes:unknown[]=[]
  let friends:FriendsSearchPreferences={revision:0,preferences:null}
  let dating:DatingAggregate={profileRevision:0,searchRevision:0,profile:emptyDatingProfile(),search:null,eligibility:{asOf:'2026-10-19',adult:true,locationResolved:false},effectiveEnabled:false}
  await page.route('**/api/matchmaking/friends-search-preferences',async route=>{
   if(route.request().method()==='PUT'){
    const value=SaveFriendsSearchPreferencesSchema.parse(route.request().postDataJSON());expect(value.expectedRevision).toBe(friends.revision)
    writes.push(value);friends={revision:friends.revision+1,preferences:value.preferences}
   }
   await route.fulfill({json:friends})
  })
  await page.route('**/api/matchmaking/dating-preferences',async route=>{
   if(route.request().method()==='PUT'){
    const value=SaveDatingAggregateSchema.parse(route.request().postDataJSON());expect(value.profile.enabled).toBe(false);expect(value.expectedProfileRevision).toBe(dating.profileRevision);expect(value.expectedSearchRevision).toBe(dating.searchRevision)
    writes.push(value);dating={...dating,profileRevision:dating.profileRevision+1,searchRevision:dating.searchRevision+1,profile:value.profile,search:value.search,eligibility:{...dating.eligibility,locationResolved:value.search?.searchArea.resolvedLocationRef===id}}
   }
   await route.fulfill({json:dating})
  })
  await page.route('**/api/matchmaking/search-locations/**',async route=>{
   const request=route.request(),url=new URL(request.url());expect(url.origin).toBe('http://127.0.0.1:3194')
   if(url.pathname.endsWith('/places'))return route.fulfill({json:{places:[{id,label:'Campus',region:'Synthetic test region'}]}})
   if(url.pathname.endsWith('/resolve')){
    const body=request.postDataJSON();expect(body.mode).toBe(mode.toLowerCase());expect(body.source).toBe('home');expect(body.placeId).toBe(id);expect(Object.keys(body).sort()).toEqual(['mode','placeId','requestId','source'])
    const receipt={id,mode:mode.toLowerCase(),source:'home',areaLabel:'Campus',method:'geocoded-area',expiresAt:'2030-01-01T00:00:00Z',usable:true};receipts.set(id,receipt)
    return route.fulfill({json:receipt})
   }
   return route.fulfill({json:receipts.get(id)})
  })
  await page.goto(mode==='Friends'?'/matchmaking':'/downtime-matchmaking')
  if(mode==='Dating')await page.getByRole('link',{name:'Dating',exact:true}).click()
  const opener=page.getByRole('button',{name:mode==='Friends'?'Preferences':'Prototype preferences',exact:true});await opener.click()
  const sheet=page.getByRole('dialog',{name:'Your kind of connection.',exact:true})
  await sheet.getByRole('button',{name:'Find areas',exact:true}).click()
  const selected=sheet.getByRole('button',{name:/Campus.*Use this area/});await expect(selected).toBeVisible();await page.keyboard.press('Tab');await selected.focus();await expect(selected).toBeFocused();expect(await selected.evaluate(element=>getComputedStyle(element).outlineStyle)).toBe('solid')
  await page.screenshot({path:testInfo.outputPath('location-options.png')})
  await selected.click();await expect(sheet.getByText(/Selected area: Campus/)).toBeVisible()
  expect(writes).toEqual([]);expect(base.profile()?.location_city).toBe('Campus')
  const save=sheet.getByRole('button',{name:mode==='Friends'?'Save Friends filters':'Save disabled Dating draft',exact:true})
  await expect(save).toBeEnabled();await save.scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath('location-ready.png')})
  expect(await sheet.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true)
  await save.click();await expect(sheet).not.toBeVisible();expect(writes).toHaveLength(1)
  const stored=mode==='Friends'?friends.preferences?.searchArea:dating.search?.searchArea;expect(stored?.resolvedLocationRef).toBe(id)
  await opener.click();await expect(sheet.getByText(/Selected area: Campus/)).toBeVisible()
  await sheet.getByLabel('Temporary search area').check();await sheet.getByLabel('Temporary city or campus').fill('Discard this area')
  await page.keyboard.press('Escape');await expect(sheet).not.toBeVisible();expect(writes).toHaveLength(1)
  expect(base.external).toEqual([]);expect(base.calls.some(call=>call.path.endsWith('/profile')&&call.method!=='GET')).toBe(false)
 })
}
