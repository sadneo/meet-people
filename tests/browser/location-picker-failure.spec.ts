import { expect, test } from '@playwright/test'
import { wiringFixture } from './wiring-fixture'
import { mockLocationPicker } from './location-picker-fixture'

async function realMapAdapter(page:import('@playwright/test').Page){
 await wiringFixture(page)
 await mockLocationPicker(page)
 await page.unroute('**/src/features/matchmaking/google-location-map.ts')
 // Exercise the production adapter with an SDK double, not a renderer replacement.
 await page.route('**/src/features/matchmaking/google-location-map.ts*',async route=>{
  const response=await route.fetch(),source=await response.text()
  expect(source).toContain('const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY')
  await route.fulfill({response,body:source.replace('const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY','const key = "synthetic-maps-key"')})
 })
}
const sdk=`
 (() => {
 window.__mapsConstructed = 0;
 class Map {
   constructor(element) { window.__mapsConstructed++; element.textContent = 'Synthetic rejected Google map'; }
   addListener() { return undefined; }
 }
 class Circle { setMap() { throw new Error('Map already disposed'); } }
 window.google = { maps: { Map, Circle, event: { clearInstanceListeners() { throw new Error('Listeners already disposed'); } } } };
 window.__pebbleMapsReady();
 })();
`

for(const back of ['button','cancel'] as const)test(`authorization-rejected map survives repeated ${back} Back without blanking the app`,async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message))
 await realMapAdapter(page)
 await page.route('https://maps.googleapis.com/**',route=>route.fulfill({contentType:'application/javascript',body:sdk}))
 await page.goto('/matchmaking?preferences=true')
 const trigger=page.getByRole('button',{name:'Search area Choose an area',exact:true})
 const picker=page.getByRole('region',{name:'Choose search area'})
 await trigger.click()
 await expect(picker.getByRole('combobox')).toBeEnabled()
 await page.evaluate(()=>{(window as unknown as {gm_authFailure:()=>void}).gm_authFailure()})
 await expect(picker.getByRole('alert')).toContainText('could not be authorized')
 await expect(picker.getByRole('button',{name:'Set search area'})).toBeDisabled()
 for(let round=0;round<3;round++){
  if(back==='button')await picker.getByRole('button',{name:'Back to preferences',exact:true}).click()
  else await page.getByRole('dialog',{name:'Friends preferences'}).dispatchEvent('cancel',{cancelable:true})
  await expect(picker).toHaveCount(0)
  await expect(trigger).toBeVisible()
  await trigger.click()
  await expect(picker.getByRole('alert')).toContainText('could not be authorized')
 }
 await picker.getByRole('button',{name:'Back to preferences',exact:true}).click()
 await page.getByRole('button',{name:'Done',exact:true}).click()
 await expect(page.getByRole('heading',{name:'Taylor, 23',exact:true})).toBeVisible()
 expect(await page.evaluate(()=>(window as unknown as {__mapsConstructed:number}).__mapsConstructed)).toBe(1)
 expect(errors).toEqual([])
})

test('Back during SDK loading never initializes the detached map sheet',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message))
 await realMapAdapter(page)
 let release!:()=>void
 const held=new Promise<void>(resolve=>{release=resolve})
 await page.route('https://maps.googleapis.com/**',async route=>{await held;await route.fulfill({contentType:'application/javascript',body:sdk})})
 await page.goto('/matchmaking?preferences=true')
 const request=page.waitForRequest('https://maps.googleapis.com/**')
 const trigger=page.getByRole('button',{name:'Search area Choose an area',exact:true})
 await trigger.click();await request
 await page.getByRole('button',{name:'Back to preferences',exact:true}).click()
 await expect(trigger).toBeVisible()
 release()
 await expect.poll(()=>page.evaluate(()=>(window as unknown as {__mapsConstructed?:number}).__mapsConstructed)).toBe(0)
 await trigger.click()
 await expect(page.getByRole('combobox',{name:'Search city or neighborhood'})).toBeEnabled()
 expect(await page.evaluate(()=>(window as unknown as {__mapsConstructed:number}).__mapsConstructed)).toBe(1)
 await page.getByRole('button',{name:'Back to preferences',exact:true}).click()
 await page.getByRole('button',{name:'Done',exact:true}).click()
 await expect(page.getByRole('heading',{name:'Taylor, 23',exact:true})).toBeVisible()
 expect(errors).toEqual([])
})
