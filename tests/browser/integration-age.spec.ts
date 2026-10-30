import {test,expect} from '@playwright/test'
import {wiringFixture} from './wiring-fixture'

test('minors cannot mount or navigate to Dating across app surfaces',async({page})=>{
 const fixture=await wiringFixture(page)
 fixture.getAccount().profile={...fixture.getAccount().profile!,birthdate:'2010-01-01'}
 let datingCalls=0;page.on('request',request=>{if(request.url().includes('/api/matchmaking/dating'))datingCalls++})
 for(const path of ['/matchmaking?mode=dating&preferences=true','/profile','/profile?section=dating','/profile?section=discovery','/messages/requests']){
  await page.goto(path)
  await expect(page.locator('main').first()).toBeVisible()
  await expect(page.getByRole('button',{name:'Dating',exact:true})).toHaveCount(0)
  await expect(page.getByRole('button',{name:'Dating Profile',exact:true})).toHaveCount(0)
  await expect(page.getByRole('switch',{name:'Dating discovery',exact:true})).toHaveCount(0)
  await expect(page.getByRole('link',{name:'Dating preferences',exact:false})).toHaveCount(0)
  await expect(page.getByText('Dating preferences',{exact:true})).toHaveCount(0)
 }
 expect(datingCalls).toBe(0)
})
